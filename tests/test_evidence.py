import contextlib
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from bootweave.__main__ import main
from bootweave.evidence import check_evidence, SCHEMA


class EvidenceBindingTests(unittest.TestCase):
    def setUp(self):
        self.xml = '<SLM:system><SLM:component name="controller"><SLM:command>/bin/controller</SLM:command></SLM:component></SLM:system>'
        self.recording = {
            "schema": SCHEMA, "configuration": {"name": "controller.xml", "sha256": hashlib.sha256(self.xml.encode()).hexdigest()},
            "environment": {"qnx_uname": "QNX 8.0 test fixture", "slm_build_id": "test-build"},
            "experiment": {"operation": "automatic-failure", "subject": "telemetry", "trigger": "test fixture only"},
            "observations": [{"component": "controller", "before_instance": "first", "after_instance": "second", "restarted": True,
                              "heartbeats_before": 5, "heartbeats_after": 7}],
            "artifacts": [{"name": "../never-opened.txt", "sha256": "0" * 64}], "completed": True,
        }

    def test_match_binds_bytes_without_authenticating_origin(self):
        result = check_evidence(self.xml, self.recording)
        self.assertEqual(result["status"], "matched")
        self.assertTrue(result["configuration_matches"])
        self.assertFalse(result["origin_authenticated"])
        self.assertIn("does not authenticate", result["notice"])
        self.assertEqual(result["observations"], self.recording["observations"])
        result["observations"][0]["component"] = "changed"
        self.assertEqual(self.recording["observations"][0]["component"], "controller")

    def test_an_xml_edit_invalidates_binding(self):
        result = check_evidence(self.xml + '\n', self.recording)
        self.assertEqual(result["status"], "mismatch")
        self.assertFalse(result["configuration_matches"])

    def test_incomplete_and_malformed_recordings_cannot_match(self):
        for mutation in (
            lambda r: r.update(schema="other"),
            lambda r: r["configuration"].update(sha256="not-a-hash"),
            lambda r: r.update(environment={}),
            lambda r: r.update(observations=[]),
            lambda r: r["observations"].append(deepcopy(r["observations"][0])),
            lambda r: r["observations"][0].update(heartbeats_after=True),
            lambda r: r["observations"][0].update(restarted=False),
            lambda r: r.update(artifacts=[{"name": "unopened", "sha256": "bad"}]),
        ):
            with self.subTest(mutation=mutation):
                recording = deepcopy(self.recording)
                mutation(recording)
                self.assertEqual(check_evidence(self.xml, recording)["status"], "invalid")
        self.recording["completed"] = False
        self.assertEqual(check_evidence(self.xml, self.recording)["status"], "incomplete")

    def test_cli_returns_distinct_binding_and_operational_status(self):
        with tempfile.TemporaryDirectory() as directory:
            xml = Path(directory) / "config.xml"
            recording = Path(directory) / "recording.json"
            xml.write_text(self.xml)
            recording.write_text(json.dumps(self.recording))
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["evidence", str(xml), str(recording)]), 0)
                xml.write_text(self.xml + '\n')
                self.assertEqual(main(["evidence", str(xml), str(recording)]), 1)
            recording.write_text('{broken')
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main(["evidence", str(xml), str(recording)]), 2)

    def test_cli_preserves_crlf_source_hash_across_analysis_and_binding(self):
        xml_text = self.xml.replace('><', '>\r\n<')
        self.recording["configuration"]["sha256"] = hashlib.sha256(xml_text.encode()).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            xml = Path(directory) / "config.xml"
            recording = Path(directory) / "recording.json"
            xml.write_bytes(xml_text.encode())
            recording.write_text(json.dumps(self.recording))
            with contextlib.redirect_stdout(io.StringIO()) as stream:
                self.assertEqual(main(["evidence", str(xml), str(recording)]), 0)
            self.assertTrue(json.loads(stream.getvalue())["configuration_matches"])
            with contextlib.redirect_stdout(io.StringIO()) as stream:
                self.assertEqual(main(["analyze", str(xml), "--format", "json"]), 0)
            self.assertEqual(json.loads(stream.getvalue())["source"]["sha256"], self.recording["configuration"]["sha256"])


if __name__ == "__main__":
    unittest.main()
