import hashlib
import json
import unittest

from bootweave.analyzer import analyze


def component(name, dependencies=(), extra="", wait="pathname"):
    prerequisite_elements = []
    for dep, state in dependencies:
        attribute = f' state="{state}"' if state is not None else ""
        prerequisite_elements.append(f'<SLM:depend{attribute}>{dep}</SLM:depend>')
    prerequisites = "".join(prerequisite_elements)
    readiness = f'<SLM:waitfor wait="{wait}">/dev/{name}</SLM:waitfor>' if wait == "pathname" else ""
    return f'<SLM:component name="{name}"><SLM:command>/bin/{name}</SLM:command>{prerequisites}{readiness}{extra}</SLM:component>'


def system(*components):
    return "<SLM:system>" + "".join(components) + "</SLM:system>"


class AnalyzerTests(unittest.TestCase):
    def assert_invalid(self, xml, title=None, incomplete=None):
        report = analyze(xml)
        self.assertFalse(report["summary"]["valid_graph"])
        self.assertEqual(report["impacts"], {})
        if title:
            self.assertIn(title, [f["title"] for f in report["findings"]])
        if incomplete is not None:
            self.assertIs(report["analysis_complete"], not incomplete)
        return report

    def test_qnx_unbound_and_bound_prefixes_have_same_semantics(self):
        xml = system(component("a"), component("b", [("a", "session")]))
        plain = analyze(xml)
        bound = analyze(xml.replace("<SLM:system>", '<SLM:system xmlns:SLM="urn:qnx:slm">'))
        self.assertTrue(plain["summary"]["valid_graph"])
        self.assertEqual(plain["components"], bound["components"])
        self.assertEqual(plain["impacts"], bound["impacts"])

    def test_source_lines_and_xml_characters_preserved(self):
        xml = '<SLM:system>\n<SLM:component name="display">\n<SLM:command>/bin/display</SLM:command>\n<SLM:args>SLM:literal &quot;Hello &amp; world&quot;</SLM:args>\n</SLM:component>\n</SLM:system>'
        report = analyze(xml, filename="my.xml")
        self.assertEqual(report["source"], {"name": "my.xml", "sha256": hashlib.sha256(xml.encode()).hexdigest()})
        self.assertEqual(report["components"][0]["line"], 2)
        self.assertEqual(report["components"][0]["args"], 'SLM:literal "Hello & world"')
        self.assertEqual(report["components"][0]["properties"][1]["line"], 4)
        json.dumps(report)

    def test_layers_wait_for_all_prerequisites_and_ignore_input_order(self):
        report = analyze(system(
            component("last", [("first", "stateless"), ("middle", "session")]),
            component("middle", [("first", "session")]),
            component("first"), component("alone"),
        ))
        self.assertEqual(report["layers"], [["alone", "first"], ["middle"], ["last"]])
        self.assertEqual([c["name"] for c in report["components"]], ["last", "middle", "first", "alone"])
        self.assertEqual(report["components"][0]["layer"], 2)

    def test_stateless_edge_blocks_coupling_but_not_startup_reachability(self):
        report = analyze(system(
            component("a"), component("b", [("a", "stateless")]),
            component("c", [("b", "session")]), component("d"),
        ))
        impact = report["impacts"]["a"]
        self.assertEqual(impact["startup_blocked"], ["b", "c"])
        self.assertEqual(impact["coupled"], [])
        self.assertEqual(impact["possible"], [])
        self.assertEqual(impact["independent"], ["b", "c", "d"])

    def test_unspecified_state_propagates_without_claiming_default(self):
        report = analyze(system(
            component("a"), component("b", [("a", None)]),
            component("c", [("b", "session")]),
        ))
        impact = report["impacts"]["a"]
        self.assertEqual(impact["coupled"], [])
        self.assertEqual(impact["possible"], ["b", "c"])
        self.assertEqual(impact["paths"][1], {"component": "c", "path": ["a", "b", "c"], "certainty": "unspecified-state"})
        self.assertIn("Dependency state is unspecified", [f["title"] for f in report["findings"]])

    def test_diamond_explicit_path_wins_over_uncertain_alternate(self):
        report = analyze(system(
            component("a"), component("b", [("a", None)]),
            component("c", [("a", "session")]),
            component("d", [("b", "session"), ("c", "session")]),
            component("e", [("d", "session")]),
        ))
        impact = report["impacts"]["a"]
        self.assertEqual(impact["coupled"], ["c", "d", "e"])
        self.assertEqual(impact["possible"], ["b"])
        path = next(p for p in impact["paths"] if p["component"] == "e")
        self.assertEqual(path["path"], ["a", "c", "d", "e"])
        self.assertEqual(path["certainty"], "explicit-session")

    def test_critical_flag_is_selected_command_only(self):
        xml = system(component("a", extra='<SLM:repair>none</SLM:repair>'),
                     component("b", [("a", "session")]).replace('<SLM:command>', '<SLM:command launch="critical pathname">'))
        report = analyze(xml)
        self.assertFalse(report["impacts"]["a"]["critical"])
        self.assertTrue(report["impacts"]["b"]["critical"])
        self.assertEqual(report["impacts"]["a"]["coupled"], ["b"])
        self.assertIn("Critical process may crash the system", [f["title"] for f in report["findings"]])

    def test_cycle_reported_once_per_strong_component(self):
        report = self.assert_invalid(system(
            component("a", [("b", "session"), ("c", "session")]),
            component("b", [("a", "session")]),
            component("c", [("a", "session")]),
        ), "Dependency cycle")
        cycles = [f for f in report["findings"] if f["title"] == "Dependency cycle"]
        self.assertEqual(len(cycles), 1)
        self.assertIn("a, b, c", cycles[0]["detail"])
        self.assertEqual(report["layers"], [])

    def test_missing_self_and_duplicate_dependencies(self):
        for xml, title in [
            (system(component("a", [("missing", "session")])), "Missing prerequisite"),
            (system(component("a", [("a", "session")])), "Self dependency"),
            (system(component("a"), component("b", [("a", "session"), ("a", "stateless")])), "Repeated dependency"),
        ]:
            with self.subTest(title=title):
                self.assert_invalid(xml, title)

    def test_same_dependency_duplicate_does_not_corrupt_topological_layers(self):
        report = analyze(system(component("a"), component("b", [("a", "session"), ("a", "session")])))
        self.assertTrue(report["summary"]["valid_graph"])
        self.assertEqual(report["layers"], [["a"], ["b"]])

    def test_duplicate_definitions_cannot_be_silently_overwritten(self):
        self.assert_invalid(system(component("a"), component("a")), "Duplicate definition name", incomplete=True)
        self.assert_invalid(system(component("a"), '<SLM:module name="a"><SLM:member>a</SLM:member></SLM:module>'), "Duplicate definition name", incomplete=True)

    def test_missing_name_command_or_components_never_passes(self):
        for xml in [
            "", "<SLM:system/>",
            '<SLM:system><SLM:component name="x"/></SLM:system>',
            '<SLM:system><SLM:component name=""><SLM:command>/bin/x</SLM:command></SLM:component></SLM:system>',
        ]:
            with self.subTest(xml=xml):
                self.assert_invalid(xml)

    def test_invalid_dependency_state_is_an_error(self):
        for state in ["stateful", "", "unspecified"]:
            with self.subTest(state=state):
                xml = system(component("a"), component("b", [("a", "session")])).replace('state="session"', f'state="{state}"')
                self.assert_invalid(xml, "Invalid dependency state")

    def test_module_globs_are_component_only_and_unmatched_member_warns(self):
        report = analyze(system(component("dev-a"), component("dev-b"), component("display"),
                                '<SLM:module name="drivers"><SLM:member>dev-*</SLM:member><SLM:member>unknown</SLM:member></SLM:module>'))
        self.assertEqual(report["modules"][0]["members"], ["dev-a", "dev-b"])
        self.assertTrue(report["summary"]["valid_graph"])
        self.assertIn("Module member has no matches", [f["title"] for f in report["findings"]])
        self.assert_invalid(system(component("a"), '<SLM:module name="m"><SLM:depend>a</SLM:depend></SLM:module>'), "Unsupported module element", incomplete=True)

    def test_malformed_xml_reports_source_line(self):
        report = self.assert_invalid('<SLM:system>\n<SLM:component name="a">\n</SLM:system>', "Malformed XML", incomplete=True)
        self.assertEqual(report["findings"][0]["line"], 3)

    def test_doctype_internal_external_entities_and_includes_are_rejected(self):
        for prefix in [
            '<!DOCTYPE SLM:system>',
            '<!DOCTYPE SLM:system [<!ENTITY x "payload">]>',
            '<!DOCTYPE SLM:system [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
            '<!DOCTYPE SLM:system SYSTEM "https://example.org/remote.dtd">',
        ]:
            with self.subTest(prefix=prefix):
                self.assert_invalid(prefix + system(component("a")), "Unsupported XML feature", incomplete=True)
        self.assert_invalid(system(component("a"), '<xi:include href="other.xml"/>'), "Unsupported system element", incomplete=True)
        self.assert_invalid('<?include file="other.xml"?>' + system(component("a")), "Unsupported XML feature", incomplete=True)

    def test_wrong_root_and_unknown_structure_fail_closed(self):
        self.assert_invalid('<system/>', "Invalid SLM root", incomplete=True)
        self.assert_invalid(system(component("a"), '<SLM:subsystem/>'), "Unsupported system element", incomplete=True)
        self.assert_invalid(system(component("a", extra='<SLM:depends>b</SLM:depends>')), "Unsupported component element", incomplete=True)
        self.assert_invalid(system(component("a")).replace('name="a"', 'name="a" optional="true"'), "Unsupported attribute", incomplete=True)
        self.assert_invalid(system(component("a")).replace('/bin/a', '<SLM:depend>b</SLM:depend>'), "Invalid nested structure", incomplete=True)

    def test_duplicate_singletons_fail_closed(self):
        self.assert_invalid(system(component("a", extra='<SLM:command>/bin/other</SLM:command>')), "Repeated singleton property", incomplete=True)

    def test_readiness_modes_and_polling_validation(self):
        valid = [
            '<SLM:waitfor wait="none"/>',
            '<SLM:waitfor wait="delay">0</SLM:waitfor>',
            '<SLM:waitfor wait="pathname" polltime="100:20000">/dev/sensor</SLM:waitfor>',
            '<SLM:waitfor wait="exits" polltime="100:20000"/>',
            '<SLM:waitfor wait="blocks">1</SLM:waitfor>',
        ]
        invalid = [
            '<SLM:waitfor wait="timer">100</SLM:waitfor>',
            '<SLM:waitfor wait="delay">-1</SLM:waitfor>',
            '<SLM:waitfor wait="pathname"/>',
            '<SLM:waitfor wait="blocks">0</SLM:waitfor>',
            '<SLM:waitfor wait="exits">abc</SLM:waitfor>',
            '<SLM:waitfor wait="pathname" polltime="0:10">/dev/x</SLM:waitfor>',
            '<SLM:waitfor wait="pathname" polltime="100:x">/dev/x</SLM:waitfor>',
            '<SLM:waitfor wait="delay" polltime="100:10">10</SLM:waitfor>',
        ]
        for wait in valid:
            with self.subTest(wait=wait):
                self.assertTrue(analyze(system(component("a", extra=wait, wait=None)))["summary"]["valid_graph"])
        for wait in invalid:
            with self.subTest(wait=wait):
                self.assert_invalid(system(component("a", extra=wait, wait=None)), "Invalid readiness condition")

    def test_no_readiness_and_fixed_delay_are_only_review_prompts(self):
        for wait in ["", '<SLM:waitfor wait="delay">500</SLM:waitfor>']:
            report = analyze(system(component("a", extra=wait, wait=None), component("b", [("a", "session")])))
            self.assertTrue(report["summary"]["valid_graph"])
            self.assertEqual(report["summary"]["errors"], 0)
            self.assertTrue(any(f["id"] == "BW019" for f in report["findings"]))

    def test_repair_policies_and_advisory_backoff(self):
        report = analyze(system(component("a", extra='<SLM:repair>restart</SLM:repair>')))
        self.assertEqual(report["summary"]["errors"], 0)
        self.assertIn("Review restart backoff", [f["title"] for f in report["findings"]])
        report = analyze(system(component("a", extra='<SLM:repair backoff="2">restart</SLM:repair>')))
        self.assertEqual(report["components"][0]["repair"], {"mode": "restart", "backoff_seconds": 2})
        self.assertNotIn("Review restart backoff", [f["title"] for f in report["findings"]])
        self.assert_invalid(system(component("a", extra='<SLM:repair>replace</SLM:repair>')), "Invalid repair policy")
        self.assert_invalid(system(component("a", extra='<SLM:repair backoff="-1">restart</SLM:repair>')), "Invalid restart backoff")

    def test_documented_other_fields_retained_without_graph_claims(self):
        report = analyze(system(component("a", extra='<SLM:type>sensor_t</SLM:type><SLM:envvar clear="all">A=1</SLM:envvar><SLM:priority>10r</SLM:priority><SLM:stop child="true" timeout="1000">TERM</SLM:stop>')))
        self.assertTrue(report["summary"]["valid_graph"])
        properties = {p["name"]: p for p in report["components"][0]["properties"]}
        self.assertEqual(properties["type"]["value"], "sensor_t")
        self.assertEqual(properties["envvar"]["attributes"], {"clear": "all"})

    def test_session_launch_requires_tty(self):
        xml = system(component("a")).replace('<SLM:command>', '<SLM:command launch="session">')
        self.assert_invalid(xml, "Session launch requires a terminal")
        report = analyze(xml.replace('</SLM:component>', '<SLM:tty>/dev/console</SLM:tty></SLM:component>'))
        self.assertTrue(report["summary"]["valid_graph"])

    def test_analysis_is_deterministic(self):
        xml = system(component("a"), component("b", [("a", "session")]), component("c", [("a", None)]))
        self.assertEqual(json.dumps(analyze(xml)), json.dumps(analyze(xml)))

    def test_invalid_unicode_and_oversized_numbers_are_reports_not_crashes(self):
        self.assert_invalid(system(component("a", extra='<SLM:args>\ud800</SLM:args>')), "Malformed XML", incomplete=True)
        self.assert_invalid(system(component("a", extra='<SLM:repair backoff="' + "9" * 5000 + '">restart</SLM:repair>')), "Invalid restart backoff")
        self.assert_invalid(system(component("a", wait=None, extra='<SLM:waitfor wait="blocks">' + "9" * 5000 + '</SLM:waitfor>')), "Invalid readiness condition")


if __name__ == "__main__":
    unittest.main()
