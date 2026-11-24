"""Semantic comparisons of static SLM reports."""

from copy import deepcopy


def _semantic(value):
    if isinstance(value, dict):
        return {k: _semantic(v) for k, v in value.items() if k not in {"line", "layer"}}
    if isinstance(value, list):
        return [_semantic(v) for v in value]
    return value


def _component_semantic(component):
    """Ignore source/property ordering while retaining repeated value ordering.

    Dependencies and launch options are sets. Repeated envvar/ability entries
    can override earlier settings, so preserve their relative order. Core
    fields already represent command/depend/waitfor/repair properties; keeping
    the raw copies would reintroduce irrelevant XML ordering differences.
    """
    value = _semantic(component)
    value["dependencies"] = sorted(value["dependencies"], key=lambda d: (d["name"], d["state"]))
    value["launch"] = sorted(set(value["launch"]))
    represented = {"command", "args", "depend", "waitfor", "repair"}
    value["properties"] = sorted(
        (p for p in value.get("properties", []) if p["name"] not in represented),
        key=lambda p: p["name"],
    )
    return value


def compare_reports(before, after, protected=()):
    old = {c["name"]: c for c in before["components"]}
    new = {c["name"]: c for c in after["components"]}
    edge_key = lambda e: (e["source"], e["target"], e["state"])
    old_edges = {edge_key(e): e for e in before["edges"]}
    new_edges = {edge_key(e): e for e in after["edges"]}
    finding_key = lambda f: (f["id"], f.get("component"), f["title"], f["detail"])
    old_findings = {finding_key(f): f for f in before["findings"]}
    new_findings = {finding_key(f): f for f in after["findings"]}
    valid = all(r["analysis_complete"] and r["summary"]["valid_graph"] for r in (before, after))
    expansions = []
    possible_expansions = []
    if valid:
        for source, impact in sorted(after["impacts"].items()):
            previous_impact = before["impacts"].get(source, {})
            previous = set(previous_impact.get("coupled", []))
            for target in sorted(set(impact["coupled"]) - previous):
                path = next((p["path"] for p in impact["paths"] if p["component"] == target and p["certainty"] == "explicit-session"), [])
                expansions.append({"source": source, "target": target, "path": path, "certainty": "explicit-session"})
            previous_exposure = previous | set(previous_impact.get("possible", []))
            for target in sorted(set(impact["possible"]) - previous_exposure):
                path = next((p["path"] for p in impact["paths"] if p["component"] == target and p["certainty"] == "unspecified-state"), [])
                possible_expansions.append({"source": source, "target": target, "path": path, "certainty": "unspecified-state"})
    protected = sorted(set(protected))
    unknown_protected = [name for name in protected if name not in new]
    violations = [e for e in expansions + possible_expansions if e["target"] in protected]
    component_changes = []
    for name in sorted(old.keys() & new.keys()):
        previous, current = _component_semantic(old[name]), _component_semantic(new[name])
        fields = [{"field": field, "before": deepcopy(previous.get(field)), "after": deepcopy(current.get(field))}
                  for field in sorted(previous.keys() | current.keys())
                  if previous.get(field) != current.get(field)]
        if fields:
            component_changes.append({"name": name, "fields": fields})
    old_modules = {m["name"]: _semantic(m) for m in before.get("modules", [])}
    new_modules = {m["name"]: _semantic(m) for m in after.get("modules", [])}
    changes = {
        "added_components": sorted(new.keys() - old.keys()),
        "removed_components": sorted(old.keys() - new.keys()),
        "changed_components": sorted(name for name in old.keys() & new.keys() if _component_semantic(old[name]) != _component_semantic(new[name])),
        "component_changes": component_changes,
        "modules": {
            "added": sorted(new_modules.keys() - old_modules.keys()),
            "removed": sorted(old_modules.keys() - new_modules.keys()),
            "changed": [{"name": name, "before": deepcopy(old_modules[name]), "after": deepcopy(new_modules[name])}
                        for name in sorted(old_modules.keys() & new_modules.keys())
                        if old_modules[name] != new_modules[name]],
        },
        "added_edges": [deepcopy(new_edges[k]) for k in sorted(new_edges.keys() - old_edges.keys())],
        "removed_edges": [deepcopy(old_edges[k]) for k in sorted(old_edges.keys() - new_edges.keys())],
        "resolved_findings": [deepcopy(f) for k, f in old_findings.items() if k not in new_findings],
        "new_findings": [deepcopy(f) for k, f in new_findings.items() if k not in old_findings],
        "new_couplings": expansions,
        "new_possible_couplings": possible_expansions,
    }
    return {"before": before, "after": after, "changes": changes,
            "policy": {"evaluated": valid and not unknown_protected, "protected": protected,
                       "violations": violations, "unknown_protected": unknown_protected,
                       "passed": valid and not violations and not unknown_protected}}
