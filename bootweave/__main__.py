"""Run with python3 -m bootweave."""

import argparse
import json
from pathlib import Path
import sys

from .analyzer import analyze
from .compare import compare_reports
from .render import render_html, render_text, render_comparison


def main(argv=None):
    parser = argparse.ArgumentParser(description="BootWeave: review QNX 8.0 SLM configuration before deployment.")
    sub = parser.add_subparsers(dest="command", required=True)
    workbench = sub.add_parser("serve", help="Open the local visual workbench")
    workbench.add_argument("--port", type=int, default=8765)
    review = sub.add_parser("analyze", help="Analyze an SLM XML file")
    review.add_argument("file", type=Path)
    review.add_argument("--format", choices=("text", "json", "html"), default="text")
    review.add_argument("--output", type=Path)
    review.add_argument("--fail-on", choices=("error", "warning", "never"), default="error")
    diff = sub.add_parser("compare", help="Compare two configs and guard essential components")
    diff.add_argument("before", type=Path)
    diff.add_argument("after", type=Path)
    diff.add_argument("--format", choices=("text", "json"), default="text")
    diff.add_argument("--output", type=Path)
    diff.add_argument("--protect", action="append", default=[], metavar="COMPONENT", help="Fail on new explicit session or possible unspecified-state exposure to this service; repeatable")
    args = parser.parse_args(argv)
    try:
        if args.command == "serve":
            from .server import serve
            serve(args.port)
            return 0
        if args.command == "analyze":
            report = analyze(args.file.read_text(encoding="utf-8"), args.file.name)
            output = json.dumps(report, indent=2, ensure_ascii=False) + "\n" if args.format == "json" else (render_html(report) if args.format == "html" else render_text(report))
            invalid = not report["analysis_complete"] or not report["summary"]["valid_graph"]
            code = int(args.fail_on != "never" and (invalid or report["summary"]["errors"] > 0 or (args.fail_on == "warning" and report["summary"]["warnings"] > 0)))
        else:
            result = compare_reports(analyze(args.before.read_text(encoding="utf-8"), args.before.name), analyze(args.after.read_text(encoding="utf-8"), args.after.name), args.protect)
            output = json.dumps(result, indent=2, ensure_ascii=False) + "\n" if args.format == "json" else render_comparison(result)
            code = int(not result["policy"]["passed"] or result["after"]["summary"]["errors"] > 0)
        if args.output:
            args.output.write_text(output, encoding="utf-8")
            print(f"Wrote {args.output}", file=sys.stderr)
        else:
            # Redirected Windows streams may use a legacy encoding. Preserve
            # the selected encoding and escape only unrepresentable characters
            # so report formatting cannot replace the policy's exit status.
            encoding = getattr(sys.stdout, "encoding", None)
            if encoding:
                output = output.encode(encoding, errors="backslashreplace").decode(encoding)
            print(output, end="")
        return code
    except (OSError, UnicodeError, RecursionError) as exc:
        print(f"BootWeave: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
