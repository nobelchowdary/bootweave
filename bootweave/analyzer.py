"""Conservative, offline analysis of documented QNX 8.0 SLM configurations.

This module never executes a command or resolves an XML entity. Its coupling
sets describe paths in a configuration, not the actions of a running SLM.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import fnmatch
import hashlib
import re
from typing import Any
from xml.parsers import expat


DOC_URL = "https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slm.html"
MAX_XML_BYTES = 2_000_000
MAX_COMPONENTS = 250
MAX_ELEMENTS = 15_000
MAX_DEPTH = 32

# These properties are preserved for comparison. Only graph/readiness/repair
# fields are interpreted; accepting a property is not a claim to validate it.
_PROPERTY_ATTRIBUTES = {
    "ability": set(), "args": set(), "cd": set(), "command": {"launch"},
    "debug": set(), "depend": {"state"}, "envvar": {"clear"},
    "groups": set(), "priority": set(), "repair": {"backoff"},
    "rlimit": set(), "runmask": set(), "stderr": {"iomode"},
    "stdin": {"iomode"}, "stdout": {"iomode"},
    "stop": {"stop", "child", "timeout"}, "tty": set(),
    "type": set(), "user": set(), "waitfor": {"wait", "polltime"},
}
_REPEATED_PROPERTIES = {"ability", "depend", "envvar", "rlimit"}


@dataclass
class _Node:
    tag: str
    attrs: dict[str, str]
    line: int
    children: list[_Node] = field(default_factory=list)
    chunks: list[str] = field(default_factory=list)

    @property
    def value(self) -> str:
        return "".join(self.chunks).strip()


class _RejectedXML(Exception):
    def __init__(self, message: str, line: int):
        super().__init__(message)
        self.line = line


def _parse(xml: str) -> _Node:
    # Namespace expansion is deliberately disabled: QNX's documented files use
    # an unbound SLM: prefix. Expat still handles XML tokens, entities, comments,
    # quoting and source lines, without rewriting text inside attributes.
    parser = expat.ParserCreate()
    stack: list[_Node] = []
    roots: list[_Node] = []
    count = 0

    def start(tag: str, attrs: dict[str, str]) -> None:
        nonlocal count
        count += 1
        if count > MAX_ELEMENTS or len(stack) >= MAX_DEPTH:
            raise _RejectedXML("XML exceeds the supported element/depth limit.", parser.CurrentLineNumber)
        node = _Node(tag, attrs, parser.CurrentLineNumber)
        if stack:
            stack[-1].children.append(node)
        else:
            roots.append(node)
        stack.append(node)

    def end(_tag: str) -> None:
        stack.pop()

    def text(value: str) -> None:
        if stack:
            stack[-1].chunks.append(value)

    def reject(*_args: Any) -> None:
        raise _RejectedXML(
            "DOCTYPE declarations, processing instructions and XML entities/includes are unsupported; provide a self-contained SLM document.",
            parser.CurrentLineNumber,
        )

    parser.StartElementHandler = start
    parser.EndElementHandler = end
    parser.CharacterDataHandler = text
    parser.StartDoctypeDeclHandler = reject
    parser.EntityDeclHandler = reject
    parser.ExternalEntityRefHandler = reject
    parser.ProcessingInstructionHandler = reject
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    parser.Parse(xml, True)
    return roots[0]


def analyze(xml: str, filename: str = "config.xml") -> dict[str, Any]:
    """Return the v1 JSON report for one self-contained SLM XML document.

    Unsupported/ambiguous graph syntax never produces a clean, complete graph.
    The unspecified dependency state is kept explicit rather than assigning a
    default absent from the cited QNX 8.0 reference.
    """
    if not isinstance(xml, str):
        raise TypeError("xml must be a string")
    encoded = xml.encode("utf-8", errors="surrogatepass")
    report: dict[str, Any] = {
        "schema_version": 1,
        "source": {"name": filename, "sha256": hashlib.sha256(encoded).hexdigest()},
        "analysis_complete": True,
        "components": [], "modules": [], "edges": [], "layers": [],
        "findings": [], "summary": {}, "impacts": {},
    }
    findings = report["findings"]

    def finding(code: str, severity: str, title: str, detail: str,
                recommendation: str, line: int = 1, component: str | None = None,
                incomplete: bool = False) -> None:
        findings.append({
            "id": code, "severity": severity, "component": component,
            "line": line, "title": title, "detail": detail,
            "recommendation": recommendation, "doc_url": DOC_URL,
        })
        if incomplete:
            report["analysis_complete"] = False

    def finish() -> dict[str, Any]:
        counts = {severity: sum(f["severity"] == severity for f in findings)
                  for severity in ("error", "warning", "info")}
        report["summary"] = {
            "components": len(report["components"]),
            "dependencies": len(report["edges"]),
            "errors": counts["error"], "warnings": counts["warning"],
            "infos": counts["info"],
            "valid_graph": report["analysis_complete"] and counts["error"] == 0,
        }
        return report

    if len(encoded) > MAX_XML_BYTES:
        finding("BW002", "error", "Unsupported XML size", "Input exceeds the 2 MB analysis limit.",
                "Split the configuration into smaller, self-contained review inputs.", incomplete=True)
        return finish()
    try:
        root = _parse(xml)
    except _RejectedXML as error:
        finding("BW002", "error", "Unsupported XML feature", str(error),
                "Inline the reviewed component/module definitions and remove declarations or processing instructions.",
                error.line, incomplete=True)
        return finish()
    except expat.ExpatError as error:
        finding("BW001", "error", "Malformed XML", str(error),
                "Correct the XML syntax before reviewing dependency impact.", error.lineno, incomplete=True)
        return finish()
    except UnicodeEncodeError as error:
        finding("BW001", "error", "Malformed XML", "Input contains invalid Unicode surrogate characters.",
                "Use valid UTF-8 XML text.", xml[:error.start].count("\n") + 1, incomplete=True)
        return finish()

    def attributes(node: _Node, allowed: set[str], component: str | None = None) -> None:
        unknown = sorted(k for k in node.attrs
                         if k not in allowed and k != "xmlns" and not k.startswith("xmlns:"))
        if unknown:
            finding("BW008", "error", "Unsupported attribute",
                    f"{node.tag} has unsupported attributes: {', '.join(unknown)}.",
                    "Use documented QNX 8.0 attributes; this analyzer cannot establish their meaning.",
                    node.line, component, incomplete=True)

    def scalar(node: _Node, component: str | None = None) -> None:
        if node.children:
            finding("BW003", "error", "Invalid nested structure",
                    f"{node.tag} must contain text, not nested elements.",
                    "Keep each documented SLM property as a text element.",
                    node.line, component, incomplete=True)

    if root.tag != "SLM:system":
        finding("BW003", "error", "Invalid SLM root",
                f"Expected SLM:system, received {root.tag}.",
                "Use the documented SLM:system root and SLM: element names.", root.line, incomplete=True)
        return finish()
    attributes(root, set())
    if root.value:
        finding("BW003", "error", "Unexpected system text",
                "The system element contains text outside component/module elements.",
                "Use XML comments for commentary and direct SLM component/module children.", root.line, incomplete=True)

    names: dict[str, tuple[str, int]] = {}
    module_nodes: list[tuple[dict[str, Any], _Node]] = []
    for node in root.children:
        if node.tag not in {"SLM:component", "SLM:module"}:
            finding("BW007", "error", "Unsupported system element",
                    f"{node.tag} is not a supported component or module definition.",
                    "Supply a self-contained document using documented SLM component/module structure.",
                    node.line, incomplete=True)
            continue
        kind = node.tag.split(":", 1)[1]
        attributes(node, {"name"})
        name = node.attrs.get("name", "").strip()
        if not name:
            finding("BW005", "error", "Missing definition name",
                    f"{kind.capitalize()} has no nonempty name.",
                    "Give every component and module a unique name.", node.line, incomplete=True)
            continue
        if name in names:
            previous_kind, previous_line = names[name]
            finding("BW004", "error", "Duplicate definition name",
                    f"{name!r} is already a {previous_kind} defined on line {previous_line}.",
                    "Give components and modules distinct, unique names.", node.line, name, incomplete=True)
            continue
        names[name] = (kind, node.line)
        if node.value:
            finding("BW003", "error", "Unexpected definition text",
                    f"{kind.capitalize()} {name!r} has text outside property elements.",
                    "Place values inside documented SLM property elements.", node.line, name, incomplete=True)
        if kind == "module":
            module = {"name": name, "line": node.line, "members": []}
            report["modules"].append(module)
            module_nodes.append((module, node))
            continue
        component: dict[str, Any] = {
            "name": name, "line": node.line, "command": "", "args": "", "launch": [],
            "wait": {"mode": "none", "value": "", "poll_ms": None, "timeout_ms": None},
            "repair": {"mode": "default", "backoff_seconds": None},
            "dependencies": [], "layer": None, "properties": [],
        }
        report["components"].append(component)
        seen: set[str] = set()
        for child in node.children:
            prop = child.tag.removeprefix("SLM:") if child.tag.startswith("SLM:") else ""
            if prop not in _PROPERTY_ATTRIBUTES:
                finding("BW007", "error", "Unsupported component element",
                        f"Component {name!r} contains unsupported {child.tag}.",
                        "Use a documented SLM property; nested components/modules are unsupported.",
                        child.line, name, incomplete=True)
                continue
            scalar(child, name)
            attributes(child, _PROPERTY_ATTRIBUTES[prop], name)
            if prop in seen and prop not in _REPEATED_PROPERTIES:
                finding("BW009", "error", "Repeated singleton property",
                        f"Component {name!r} defines {prop} more than once.",
                        "Keep one value so the configuration has a clear interpretation.",
                        child.line, name, incomplete=True)
                continue
            seen.add(prop)
            value = child.value
            component["properties"].append({
                "name": prop, "value": value,
                "attributes": {k: v for k, v in child.attrs.items() if not k.startswith("xmlns")},
                "line": child.line,
            })
            if prop == "command":
                component["command"] = value
                component["launch"] = list(dict.fromkeys(filter(None, re.split(r"[\s,]+", child.attrs.get("launch", "").strip()))))
                invalid = sorted(set(component["launch"]) - {"builtin", "critical", "pathname", "session"})
                if invalid:
                    finding("BW023", "error", "Invalid launch option", f"Unknown launch option(s): {', '.join(invalid)}.",
                            "Use builtin, critical, pathname or session.", child.line, name)
                if "critical" in component["launch"]:
                    finding("BW022", "warning", "Critical process may crash the system",
                            f"{name!r} uses launch=critical. The documented flag can crash the system if the process dies; graph coupling is not an availability boundary.",
                            "Review this flag deliberately and validate behavior on a QNX target.", child.line, name)
            elif prop == "args":
                component["args"] = value
            elif prop == "depend":
                state = child.attrs.get("state", "unspecified").strip()
                if state not in {"session", "stateless", "unspecified"} or ("state" in child.attrs and state == "unspecified"):
                    finding("BW014", "error", "Invalid dependency state",
                            f"Dependency on {value!r} has state={state!r}.",
                            "Use explicit state=\"session\" or state=\"stateless\".", child.line, name)
                elif state == "unspecified":
                    finding("BW015", "warning", "Dependency state is unspecified",
                            f"The dependency on {value!r} omits state. This analyzer does not assign a default absent from its cited QNX 8.0 reference.",
                            "Specify session or stateless explicitly after reviewing the client/server relationship.", child.line, name)
                component["dependencies"].append({"name": value, "state": state, "line": child.line})
            elif prop == "waitfor":
                wait = component["wait"]
                wait["mode"] = child.attrs.get("wait", "none").strip()
                wait["value"] = value
                mode = wait["mode"]
                issue = None
                if mode not in {"none", "delay", "pathname", "exits", "blocks"}:
                    issue = f"Unknown readiness mode {mode!r}."
                elif mode == "none" and value:
                    issue = "wait=none does not take a readiness value."
                elif mode == "pathname" and not value:
                    issue = "wait=pathname requires a nonempty path."
                elif mode == "delay" and not re.fullmatch(r"[0-9]{1,18}", value):
                    issue = "wait=delay requires a nonnegative integer number of milliseconds."
                elif mode == "blocks" and (not re.fullmatch(r"[0-9]{1,18}", value) or int(value) < 1):
                    issue = "wait=blocks requires a positive integer thread ID."
                elif mode == "exits" and value and not re.fullmatch(r"-?[0-9]{1,18}", value):
                    issue = "wait=exits requires an integer exit code, or an empty value for zero."
                polltime = child.attrs.get("polltime")
                if polltime is not None:
                    parts = polltime.split(":")
                    if mode not in {"pathname", "exits"}:
                        issue = "polltime applies only to pathname or exits readiness."
                    elif len(parts) != 2 or not all(re.fullmatch(r"[0-9]{1,18}", p) for p in parts) or int(parts[0]) < 1:
                        issue = "polltime requires a positive polling interval and nonnegative timeout, in milliseconds (e.g. 100:20000)."
                    else:
                        wait["poll_ms"], wait["timeout_ms"] = map(int, parts)
                if issue:
                    finding("BW018", "error", "Invalid readiness condition", issue,
                            "Use a documented waitfor mode and matching value/attributes.", child.line, name)
            elif prop == "repair":
                repair = component["repair"]
                repair["mode"] = value
                if value not in {"default", "none", "stop", "restart"}:
                    finding("BW020", "error", "Invalid repair policy", f"Unknown repair policy {value!r}.",
                            "Use default, none, stop or restart.", child.line, name)
                backoff = child.attrs.get("backoff")
                if backoff is not None:
                    if not re.fullmatch(r"[0-9]{1,18}", backoff):
                        finding("BW020", "error", "Invalid restart backoff",
                                "Repair backoff must be a nonnegative integer number of seconds.",
                                "Use backoff=\"2\", for example, after reviewing target requirements.", child.line, name)
                    else:
                        repair["backoff_seconds"] = int(backoff)
        if not component["command"]:
            finding("BW006", "error", "Missing executable command", f"Component {name!r} has no nonempty command.",
                    "Add the mandatory SLM:command property.", node.line, name)
        if "session" in component["launch"] and not any(p["name"] == "tty" and p["value"] for p in component["properties"]):
            finding("BW023", "error", "Session launch requires a terminal",
                    "launch=session requires a nonempty SLM:tty property.",
                    "Provide the terminal pathname documented for session launch.", node.line, name)
        if component["repair"]["mode"] == "restart" and component["repair"]["backoff_seconds"] in {None, 0}:
            finding("BW021", "info", "Review restart backoff",
                    "Explicit restart policy has no positive component backoff. Global SLM options and recovery rate limits may still apply.",
                    "Review global -b/-R options and whether component backoff is appropriate; this is advisory.", node.line, name)

    components = report["components"]
    by_name = {c["name"]: c for c in components}
    if not components:
        finding("BW010", "error", "No components to analyze", "The document defines no usable SLM components.",
                "Add at least one named component with a command.", root.line, incomplete=True)
    if len(components) > MAX_COMPONENTS:
        finding("BW002", "error", "Configuration exceeds analysis limit",
                f"The interactive all-component impact report supports up to {MAX_COMPONENTS} components.",
                "Review a smaller self-contained subsystem.", root.line, incomplete=True)

    for module, node in module_nodes:
        matched: set[str] = set()
        for member in node.children:
            if member.tag != "SLM:member":
                finding("BW007", "error", "Unsupported module element",
                        f"Module {module['name']!r} contains {member.tag}; modules may contain only member elements, not dependencies.",
                        "Declare dependencies on components and use module members to group them.", member.line, module["name"], incomplete=True)
                continue
            scalar(member, module["name"])
            attributes(member, set(), module["name"])
            pattern = member.value
            matches = {name for name in by_name if fnmatch.fnmatchcase(name, pattern)} if pattern else set()
            if not matches:
                finding("BW016", "warning", "Module member has no matches",
                        f"Module {module['name']!r} member {pattern!r} matches no defined component.",
                        "Check the component name or wildcard pattern in this self-contained document.", member.line, module["name"])
            matched.update(matches)
        module["members"] = sorted(matched)
        if not node.children:
            finding("BW016", "warning", "Module has no members", f"Module {module['name']!r} contains no member elements.",
                    "Add member elements or remove the empty module.", node.line, module["name"])

    edges = report["edges"]
    for component in components:
        seen_deps: dict[str, str] = {}
        for dep in component["dependencies"]:
            prereq, dependent = dep["name"], component["name"]
            edges.append({"source": prereq, "target": dependent, "state": dep["state"], "line": dep["line"]})
            if prereq not in by_name:
                finding("BW011", "error", "Missing prerequisite",
                        f"{dependent!r} depends on {prereq!r}, which is not a defined component.",
                        "Define the prerequisite component or correct the dependency name.", dep["line"], dependent)
            elif prereq == dependent:
                finding("BW012", "error", "Self dependency", f"{dependent!r} depends on itself.",
                        "Remove the self dependency and describe only prerequisite components.", dep["line"], dependent)
            if prereq in seen_deps:
                conflicting = seen_deps[prereq] != dep["state"]
                finding("BW017", "error" if conflicting else "warning", "Repeated dependency",
                        f"{dependent!r} declares prerequisite {prereq!r} repeatedly" + (" with conflicting states." if conflicting else "."),
                        "Keep one explicit dependency per prerequisite.", dep["line"], dependent)
            seen_deps[prereq] = dep["state"]

    adjacency: dict[str, list[dict[str, Any]]] = {name: [] for name in by_name}
    for edge in edges:
        if edge["source"] in by_name and edge["target"] in by_name:
            adjacency[edge["source"]].append(edge)
    for next_edges in adjacency.values():
        next_edges.sort(key=lambda edge: (edge["target"], edge["state"], edge["line"]))

    for cycle in _strong_components(adjacency):
        if len(cycle) > 1:
            finding("BW013", "error", "Dependency cycle",
                    "Mutually dependent component group: " + ", ".join(cycle) + ". SLM requires an acyclic startup graph.",
                    "Remove a dependency within this group; inspect all group edges rather than assuming a single cycle path.",
                    min(by_name[name]["line"] for name in cycle), cycle[0])

    # These are review prompts, not claims that a valid configuration is buggy.
    for name, next_edges in adjacency.items():
        component = by_name[name]
        if next_edges and component["wait"]["mode"] == "none":
            finding("BW019", "warning", "Review readiness before dependent launch",
                    f"{name!r} has dependents but no readiness wait. A launched process may or may not already be ready for clients.",
                    "Confirm immediate readiness or choose a suitable pathname, blocks or exits condition; absence alone is not a bug.",
                    component["line"], name)
        elif next_edges and component["wait"]["mode"] == "delay":
            finding("BW019", "info", "Readiness uses a fixed delay",
                    f"{name!r} releases dependents after a delay; elapsed time alone does not establish service readiness.",
                    "Review whether a service-specific readiness condition would better express the contract.",
                    component["line"], name)

    finish()
    if report["summary"]["valid_graph"]:
        report["layers"] = _layers(adjacency)
        for index, layer in enumerate(report["layers"]):
            for name in layer:
                by_name[name]["layer"] = index
        report["impacts"] = {name: _impact(name, adjacency, by_name) for name in by_name}
    return report


def _strong_components(adjacency: dict[str, list[dict[str, Any]]]) -> list[list[str]]:
    """Iterative Kosaraju: one canonical diagnostic per mutually dependent set."""
    graph = {name: sorted({e["target"] for e in edges}) for name, edges in adjacency.items()}
    reverse: dict[str, list[str]] = {name: [] for name in graph}
    for name, targets in graph.items():
        for target in targets:
            reverse[target].append(name)
    visited: set[str] = set()
    order: list[str] = []
    for start in sorted(graph):
        if start in visited:
            continue
        stack = [(start, False)]
        while stack:
            name, expanded = stack.pop()
            if expanded:
                order.append(name)
            elif name not in visited:
                visited.add(name)
                stack.append((name, True))
                stack.extend((target, False) for target in reversed(graph[name]) if target not in visited)
    assigned: set[str] = set()
    groups: list[list[str]] = []
    for start in reversed(order):
        if start in assigned:
            continue
        group: list[str] = []
        stack = [start]
        assigned.add(start)
        while stack:
            name = stack.pop()
            group.append(name)
            for previous in reverse[name]:
                if previous not in assigned:
                    assigned.add(previous)
                    stack.append(previous)
        groups.append(sorted(group))
    return sorted(groups)


def _layers(adjacency: dict[str, list[dict[str, Any]]]) -> list[list[str]]:
    targets = {name: {e["target"] for e in edges} for name, edges in adjacency.items()}
    indegree = {name: 0 for name in adjacency}
    for edges in targets.values():
        for target in edges:
            indegree[target] += 1
    current = sorted(name for name, degree in indegree.items() if degree == 0)
    layers: list[list[str]] = []
    while current:
        layers.append(current)
        following = set()
        for name in current:
            for target in targets[name]:
                indegree[target] -= 1
                if indegree[target] == 0:
                    following.add(target)
        current = sorted(following)
    return layers


def _impact(selected: str, adjacency: dict[str, list[dict[str, Any]]],
            by_name: dict[str, dict[str, Any]]) -> dict[str, Any]:
    # Traverse (component, uncertainty) states. A node reached through an
    # unspecified edge must still propagate uncertainty even when another path
    # reached that same node through explicit session edges.
    queue = deque([(selected, False)])
    paths: dict[tuple[str, bool], list[str]] = {(selected, False): [selected]}
    while queue:
        name, uncertain = queue.popleft()
        for edge in adjacency[name]:
            if edge["state"] == "stateless":
                continue
            key = (edge["target"], uncertain or edge["state"] == "unspecified")
            if key not in paths:
                paths[key] = paths[(name, uncertain)] + [edge["target"]]
                queue.append(key)
    coupled = sorted(name for name in by_name if name != selected and (name, False) in paths)
    possible = sorted(name for name in by_name if name != selected and (name, True) in paths and name not in coupled)
    blocked = {selected}
    queue_names = deque([selected])
    while queue_names:
        for edge in adjacency[queue_names.popleft()]:
            if edge["target"] not in blocked:
                blocked.add(edge["target"])
                queue_names.append(edge["target"])
    return {
        "selected": selected,
        "startup_blocked": sorted(blocked - {selected}),
        "coupled": coupled, "possible": possible,
        "independent": sorted(set(by_name) - {selected} - set(coupled) - set(possible)),
        "critical": "critical" in by_name[selected]["launch"],
        "paths": [
            {"component": name, "path": paths[(name, False)], "certainty": "explicit-session"}
            for name in coupled
        ] + [
            {"component": name, "path": paths[(name, True)], "certainty": "unspecified-state"}
            for name in possible
        ],
    }
