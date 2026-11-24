import contextlib
from http.server import ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from bootweave.__main__ import main
from bootweave.analyzer import analyze
from bootweave.compare import compare_reports
from bootweave.render import render_html
from bootweave.server import Handler

ROOT = Path(__file__).resolve().parent.parent


class ReviewWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.risky = (ROOT / "examples/robot-risky.xml").read_text()
        self.revised = (ROOT / "examples/robot-revised.xml").read_text()

    def test_policy_rejects_new_exposure_and_accepts_fix(self):
        risky, revised = analyze(self.risky), analyze(self.revised)
        regression = compare_reports(revised, risky, ["motion-control"])
        self.assertFalse(regression["policy"]["passed"])
        self.assertIn({"source": "dashboard", "target": "motion-control", "path": ["dashboard", "motion-control"], "certainty": "explicit-session"}, regression["policy"]["violations"])
        self.assertTrue(compare_reports(risky, revised, ["motion-control"])["policy"]["passed"])

    def test_line_only_edits_are_not_semantic_changes(self):
        before = analyze(self.risky)
        after = analyze("\n\n" + self.risky)
        changes = compare_reports(before, after)["changes"]
        for key, values in changes.items():
            self.assertEqual(values, {"added": [], "removed": [], "changed": []} if key == "modules" else [], key)

    def test_unknown_protected_name_cannot_pass(self):
        report = analyze(self.risky)
        result = compare_reports(report, report, ["motion-contrl"])
        self.assertFalse(result["policy"]["passed"])
        self.assertFalse(result["policy"]["evaluated"])

    def test_incomplete_baseline_cannot_silently_pass(self):
        result = compare_reports(analyze("<SLM:system/>"), analyze(self.revised))
        self.assertFalse(result["policy"]["passed"])
        self.assertEqual(result["changes"]["new_couplings"], [])
        self.assertEqual(result["changes"]["new_possible_couplings"], [])

    def test_dependency_launch_and_singleton_order_are_not_semantic_changes(self):
        before = '''<SLM:system>
          <SLM:component name="a"><SLM:command>/bin/a</SLM:command></SLM:component>
          <SLM:component name="b"><SLM:command>/bin/b</SLM:command></SLM:component>
          <SLM:component name="c"><SLM:command launch="pathname critical">/bin/c</SLM:command>
            <SLM:depend state="session">a</SLM:depend><SLM:depend state="stateless">b</SLM:depend>
            <SLM:type>service_t</SLM:type><SLM:priority>10r</SLM:priority>
          </SLM:component></SLM:system>'''
        after = before.replace('launch="pathname critical"', 'launch="critical,pathname"')
        after = after.replace('<SLM:depend state="session">a</SLM:depend><SLM:depend state="stateless">b</SLM:depend>', '<SLM:depend state="stateless">b</SLM:depend><SLM:depend state="session">a</SLM:depend>')
        after = after.replace('<SLM:type>service_t</SLM:type><SLM:priority>10r</SLM:priority>', '<SLM:priority>10r</SLM:priority><SLM:type>service_t</SLM:type>')
        changes = compare_reports(analyze(before), analyze(after))["changes"]
        for key, values in changes.items():
            self.assertEqual(values, {"added": [], "removed": [], "changed": []} if key == "modules" else [], key)

    def test_property_diff_retains_semantic_values_and_module_only_changes(self):
        before = '<SLM:system><SLM:component name="a"><SLM:command>/bin/a</SLM:command><SLM:priority>10r</SLM:priority></SLM:component><SLM:component name="b"><SLM:command>/bin/b</SLM:command></SLM:component><SLM:module name="boot"><SLM:member>a</SLM:member></SLM:module></SLM:system>'
        after = before.replace('10r', '20r').replace('<SLM:member>a</SLM:member>', '<SLM:member>b</SLM:member>')
        changes = compare_reports(analyze(before), analyze(after))["changes"]
        self.assertEqual(changes["changed_components"], ["a"])
        fields = changes["component_changes"][0]["fields"]
        self.assertEqual([f["field"] for f in fields], ["properties"])
        self.assertEqual(fields[0]["before"][0]["value"], '10r')
        self.assertEqual(fields[0]["after"][0]["value"], '20r')
        self.assertNotIn('line', fields[0]["before"][0])
        self.assertEqual(changes["modules"]["changed"], [{"name": "boot", "before": {"name": "boot", "members": ["a"]}, "after": {"name": "boot", "members": ["b"]}}])

    def test_repeated_envvar_order_is_preserved_for_comparison(self):
        before = '<SLM:system><SLM:component name="a"><SLM:command>/bin/a</SLM:command><SLM:envvar>A=first</SLM:envvar><SLM:envvar>A=last</SLM:envvar></SLM:component></SLM:system>'
        after = before.replace('<SLM:envvar>A=first</SLM:envvar><SLM:envvar>A=last</SLM:envvar>', '<SLM:envvar>A=last</SLM:envvar><SLM:envvar>A=first</SLM:envvar>')
        self.assertEqual(compare_reports(analyze(before), analyze(after))["changes"]["changed_components"], ["a"])

    def test_new_possible_exposure_cannot_silently_pass_protection(self):
        before = '<SLM:system><SLM:component name="a"><SLM:command>/bin/a</SLM:command></SLM:component><SLM:component name="protected"><SLM:command>/bin/protected</SLM:command><SLM:depend state="stateless">a</SLM:depend></SLM:component></SLM:system>'
        after = before.replace(' state="stateless"', '')
        result = compare_reports(analyze(before), analyze(after), ["protected"])
        exposure = {"source": "a", "target": "protected", "path": ["a", "protected"], "certainty": "unspecified-state"}
        self.assertTrue(result["policy"]["evaluated"])
        self.assertFalse(result["policy"]["passed"])
        self.assertEqual(result["changes"]["new_couplings"], [])
        self.assertEqual(result["changes"]["new_possible_couplings"], [exposure])
        self.assertEqual(result["policy"]["violations"], [exposure])
        unchanged = compare_reports(analyze(after), analyze(after), ["protected"])
        self.assertEqual(unchanged["policy"]["violations"], [])
        self.assertTrue(unchanged["policy"]["passed"])

    def test_invalid_candidate_does_not_evaluate_exposure_policy(self):
        result = compare_reports(analyze(self.revised), analyze('<SLM:system><SLM:unknown/></SLM:system>'), ["motion-control"])
        self.assertFalse(result["policy"]["passed"])
        self.assertFalse(result["policy"]["evaluated"])
        self.assertEqual(result["changes"]["new_couplings"], [])
        self.assertEqual(result["changes"]["new_possible_couplings"], [])

    def test_html_escapes_imported_strings(self):
        report = analyze(self.risky, '<script>alert("x")</script>')
        html = render_html(report)
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)

    def test_cli_policy_exit_status_and_report_export(self):
        with contextlib.redirect_stdout(io.StringIO()):
            code = main(["compare", str(ROOT / "examples/robot-revised.xml"), str(ROOT / "examples/robot-risky.xml"), "--protect", "motion-control"])
        self.assertEqual(code, 1)
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "review.html"
            with contextlib.redirect_stderr(io.StringIO()):
                code = main(["analyze", str(ROOT / "examples/robot-revised.xml"), "--format", "html", "--output", str(destination)])
            self.assertEqual(code, 0)
            self.assertIn("motion-control", destination.read_text())

    def test_cli_legacy_stdout_encoding_retains_policy_failure(self):
        result = subprocess.run(
            [sys.executable, "-m", "bootweave", "compare",
             "examples/robot-revised.xml", "examples/robot-risky.xml",
             "--protect", "motion-control"],
            cwd=ROOT, env={**os.environ, "PYTHONIOENCODING": "cp1252"},
            capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 1, result.stderr.decode("cp1252"))
        output = result.stdout.decode("cp1252")
        self.assertIn("Policy: FAIL", output)
        self.assertIn(r"dashboard \u2192 motion-control", output)
        self.assertEqual(result.stderr, b"")


class APIWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class QuietHandler(Handler):
            def log_message(self, *_):
                pass
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post(self, path, data):
        return urlopen(Request(self.url + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"}))

    def test_example_to_report_roundtrip(self):
        with urlopen(self.url + "/api/examples") as response:
            examples = json.load(response)
        examples = {e["id"]: e for e in examples}
        self.assertTrue({"risky", "revised", "cycle"} <= examples.keys())
        with self.post("/api/analyze", examples["risky"]) as response:
            report = json.load(response)
        self.assertTrue(report["analysis_complete"])
        self.assertIn("motion-control", report["impacts"]["dashboard"]["coupled"])
        with self.post("/api/compare", {"before": examples["revised"]["xml"], "after": examples["risky"]["xml"], "protected": ["motion-control"]}) as response:
            result = json.load(response)
        self.assertFalse(result["policy"]["passed"])

    def test_malformed_user_input_is_a_review_report(self):
        with self.post("/api/analyze", {"xml": "<broken"}) as response:
            report = json.load(response)
        self.assertFalse(report["analysis_complete"])
        self.assertGreater(report["summary"]["errors"], 0)

    def test_invalid_api_request_is_rejected(self):
        with self.assertRaises(HTTPError) as error:
            self.post("/api/analyze", {"xml": 42})
        self.assertEqual(error.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
