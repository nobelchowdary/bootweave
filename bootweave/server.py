"""Local-only review workbench. Configuration is never executed."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import mimetypes

from .analyzer import analyze
from .compare import compare_reports
from .evidence import check_evidence

ROOT = Path(__file__).resolve().parent.parent
MAX_BODY = 4_500_000
EXAMPLES = [
    ("risky", "Overcoupled robot", "Authored example: an explicit session dependency couples the dashboard and motion controller.", "robot-risky.xml"),
    ("revised", "Reviewed robot", "Authored example: removing the optional dashboard prerequisite removes that coupling.", "robot-revised.xml"),
    ("cycle", "Broken startup", "Authored example: a circular prerequisite prevents a valid startup order.", "robot-cycle.xml"),
]


class Handler(BaseHTTPRequestHandler):
    server_version = "BootWeave/0.1"

    def send(self, data, status=200, content_type="application/json; charset=utf-8"):
        if isinstance(data, (dict, list)):
            data = json.dumps(data, ensure_ascii=False).encode()
        elif isinstance(data, str):
            data = data.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/examples":
            examples = [{"id": i, "name": n, "description": d, "filename": f, "xml": (ROOT / "examples" / f).read_text()} for i, n, d, f in EXAMPLES]
            native = []
            for revision in ("risky", "revised"):
                file = ROOT / "native" / "configs" / f"{revision}.xml"
                if file.is_file():
                    native.append({"id": f"native-{revision}", "name": f"QNX demo · {revision}",
                                   "description": "Authored native sensor/controller/telemetry configuration. Static review does not execute services.",
                                   "filename": f"native-{revision}.xml", "xml": file.read_text()})
            self.send(native + examples)
        elif path == "/api/evidence/examples":
            examples = []
            directory = ROOT / "native" / "evidence"
            if directory.is_dir():
                for file in sorted(directory.rglob("*-evidence.json")):
                    try:
                        if file.stat().st_size <= 2_000_000:
                            recording = json.loads(file.read_text())
                            if isinstance(recording, dict) and recording.get("schema") == "bootweave.native-evidence.v1":
                                examples.append({"id": file.stem, "name": file.stem.replace("-", " "),
                                                 "filename": file.name, "evidence": recording})
                    except (OSError, ValueError):
                        continue
            self.send(examples)
        elif path in {"/", "/index.html", "/app.js", "/style.css"}:
            file = ROOT / "web" / ("index.html" if path == "/" else path[1:])
            if not file.exists():
                self.send({"error": "Workbench asset missing"}, 404)
                return
            self.send(file.read_bytes(), content_type=(mimetypes.guess_type(file)[0] or "application/octet-stream") + "; charset=utf-8")
        elif path == "/favicon.ico":
            self.send(b"", 204, "image/x-icon")
        else:
            self.send({"error": "Not found"}, 404)

    def do_POST(self):
        # Other web pages cannot submit local configuration through this endpoint.
        origin = self.headers.get("Origin")
        if origin and origin != f"http://127.0.0.1:{self.server.server_port}" and origin != f"http://localhost:{self.server.server_port}":
            self.send({"error": "Cross-origin requests are not supported"}, 403)
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0] != "application/json":
            self.send({"error": "Send application/json"}, 415)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                self.send({"error": "Request must be 1 byte to 4.5 MB"}, 413)
                return
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object")
            if self.path == "/api/analyze":
                if not isinstance(data.get("xml"), str):
                    raise ValueError("xml must be text")
                self.send(analyze(data["xml"], str(data.get("filename", "config.xml"))))
            elif self.path == "/api/compare":
                if not all(isinstance(data.get(k), str) for k in ("before", "after")):
                    raise ValueError("before and after must contain XML text")
                protected = data.get("protected", [])
                if not isinstance(protected, list) or not all(isinstance(p, str) for p in protected):
                    raise ValueError("protected must be a list of component names")
                self.send(compare_reports(analyze(data["before"], str(data.get("before_name", "before.xml"))), analyze(data["after"], str(data.get("after_name", "after.xml"))), protected))
            elif self.path == "/api/evidence":
                if not isinstance(data.get("xml"), str):
                    raise ValueError("xml must be text")
                self.send(check_evidence(data["xml"], data.get("evidence")))
            else:
                self.send({"error": "Not found"}, 404)
        except (ValueError, UnicodeError) as exc:
            self.send({"error": str(exc)}, 400)
        except RecursionError:
            self.send({"error": "Configuration nesting exceeds supported analysis depth"}, 400)


def serve(port=8765):
    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(f"BootWeave workbench: http://127.0.0.1:{server.server_port}", flush=True)
        print("Static QNX 8.0 SLM analysis. Press Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
