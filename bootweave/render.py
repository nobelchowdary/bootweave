"""Offline, self-contained review artifact. All imported text is escaped."""

from html import escape
import json


def render_text(report):
    s = report["summary"]
    lines = [f"BootWeave · {report['source']['name']}",
             f"Static QNX 8.0 SLM review · {s['components']} components · {s['dependencies']} dependencies",
             f"{s['errors']} errors, {s['warnings']} warnings · complete={str(report['analysis_complete']).lower()}"]
    for f in report["findings"]:
        lines.append(f"{f['severity'].upper()} {f['id']}:{f.get('line', 0)} [{f.get('component') or 'system'}] {f['title']}: {f['detail']}")
    return "\n".join(lines) + "\n"


def render_html(report):
    e = lambda v: escape(str(v), quote=True)
    s = report["summary"]
    findings = "".join(f"<article><span class='{e(f['severity'])}'>{e(f['severity']).upper()} · {e(f['id'])}</span><h3>{e(f['title'])}</h3><p>{e(f['detail'])}</p><p class='muted'>{e(f['recommendation'])}</p><small>{e(f.get('component') or 'system')} · line {e(f.get('line', 0))} · <a href='{e(f['doc_url'])}'>Reference</a></small></article>" for f in report["findings"])
    rows = "".join(f"<tr><td>{e(c['name'])}</td><td><code>{e(c['command'])}</code></td><td>{e(c['wait']['mode'])}</td><td>{e(', '.join(d['name'] + ' (' + d['state'] + ')' for d in c['dependencies']) or '—')}</td></tr>" for c in report["components"])
    impacts = "".join(f"<tr><td>{e(n)}</td><td>{e(', '.join(i['coupled']) or '—')}</td><td>{e(', '.join(i['possible']) or '—')}</td><td>{e(', '.join(i['startup_blocked']) or '—')}</td></tr>" for n, i in report["impacts"].items())
    complete = "Complete within supported syntax" if report["analysis_complete"] else "INCOMPLETE — review unsupported input"
    return f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BootWeave · {e(report['source']['name'])}</title><style>
    *{{box-sizing:border-box}}body{{margin:0;background:#f5f5f0;color:#24332f;font:15px/1.6 system-ui,sans-serif}}main{{max-width:1100px;margin:auto;padding:48px 24px}}h1{{font-size:42px;letter-spacing:-2px;margin:12px 0}}h2{{margin-top:40px}}.tag{{color:#287a65;text-transform:uppercase;letter-spacing:2px;font-size:12px}}.muted,small{{color:#66756d}}.stats{{display:flex;gap:30px;margin:30px 0;padding:24px;background:#e5eee8;border-radius:12px}}.stats b{{font-size:28px;display:block}}article{{background:white;padding:22px;border:1px solid #dfe4dc;border-radius:10px;margin:10px 0}}h3{{margin:8px 0}}p{{margin:8px 0}}a{{color:#207761}}table{{border-collapse:collapse;width:100%;background:white}}td,th{{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #e1e6df}}.error{{color:#b64232}}.warning{{color:#9a650b}}.info{{color:#287a65}}code{{overflow-wrap:anywhere}}.notice{{padding:16px;border-left:3px solid #d2a952;background:#fff9eb}}@media print{{body{{background:white}}main{{padding:0}}article{{break-inside:avoid}}}}
    </style><main><div class="tag">BootWeave / QNX 8.0 SLM</div><h1>Startup, explained.</h1><p>{e(report['source']['name'])} · {e(complete)}</p><p class="muted">Static host analysis. No target execution or observed recovery is represented.</p><div class="stats"><div><b>{s['components']}</b>components</div><div><b>{s['dependencies']}</b>dependencies</div><div><b>{s['errors']}</b>errors</div><div><b>{s['warnings']}</b>warnings</div></div><div class="notice">Coupling lists follow explicit session edges; possible coupling includes unspecified edges. This is conditional graph reachability, not a runtime simulator. Repair policies, SLM options and manual slmctl commands can change recovery. A critical process can cause a system crash. XML does not prove boot speed or availability.</div><h2>Review findings</h2>{findings or '<p>No findings within supported checks.</p>'}<h2>Components</h2><table><thead><tr><th>Component</th><th>Command</th><th>Readiness</th><th>Prerequisites</th></tr></thead><tbody>{rows}</tbody></table><h2>Dependency impact</h2><table><thead><tr><th>Selected</th><th>Explicit session coupling</th><th>Possible coupling</th><th>Startup blocked</th></tr></thead><tbody>{impacts}</tbody></table><p class="muted">Source SHA-256: <code>{e(report['source']['sha256'])}</code></p></main></html>"""


def render_comparison(comparison):
    c = comparison["changes"]
    lines = ["BootWeave · configuration comparison"]
    for label in ("added_components", "removed_components", "changed_components"):
        lines.append(f"{label.replace('_', ' ').capitalize()}: {', '.join(c[label]) or 'none'}")
    lines.append(f"Findings: {len(c['new_findings'])} new, {len(c['resolved_findings'])} resolved")
    for v in c["new_couplings"]:
        lines.append("NEW SESSION COUPLING: " + " → ".join(v["path"]))
    for v in c.get("new_possible_couplings", []):
        lines.append("NEW POSSIBLE COUPLING (unspecified state): " + " → ".join(v["path"]))
    p = comparison["policy"]
    lines.append("Policy: " + ("PASS" if p["passed"] else "FAIL / NOT EVALUABLE"))
    if p["unknown_protected"]:
        lines.append("Unknown protected components: " + ", ".join(p["unknown_protected"]))
    return "\n".join(lines) + "\n"
