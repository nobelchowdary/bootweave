# BootWeave

**Review QNX startup changes before they reach a device.**

[Repository](https://github.com/nobelchowdary/bootweave) · [Host verification](https://github.com/nobelchowdary/bootweave/actions/workflows/review.yml) · [MIT license](LICENSE)

BootWeave is a host developer tool for QNX 8.0 System Launch and Monitor (SLM) configuration. Import SLM XML, explore prerequisites and recovery coupling, review source-linked diagnostics, and compare configuration changes. A CI guard detects new explicit session coupling to a component you protect.

![BootWeave configuration review workbench](docs/assets/workbench.jpg)

## Run the workbench

Python 3.11+ is the only dependency. From this repository:

```sh
python3 -m bootweave serve
```

Open http://127.0.0.1:8765. Choose **Overcoupled robot**, select `dashboard`, and inspect how the explicit session path reaches `motion-control`. Compare with **Reviewed robot**: removing the optional prerequisite removes both that startup dependency and session coupling. These are authored configuration examples; the illustrative robot executables are not included or represented as running.

## CLI and CI

```sh
python3 -m bootweave analyze examples/robot-risky.xml
python3 -m bootweave analyze examples/robot-revised.xml --format json
python3 -m bootweave analyze examples/robot-revised.xml --format html --output review.html

# Reject a change that newly couples motion-control to a prerequisite.
python3 -m bootweave compare examples/robot-revised.xml examples/robot-risky.xml --protect motion-control

# The correction passes the same policy.
python3 -m bootweave compare examples/robot-risky.xml examples/robot-revised.xml --protect motion-control

python3 -m unittest discover -s tests -v
```

`analyze` exits 1 on errors or incomplete input; `--fail-on warning` also rejects warnings. `--fail-on never` is for inspecting deliberately broken inputs. `compare` exits 1 if either graph cannot be evaluated, the candidate has errors, a protected name is missing, or explicit/possible coupling to a protected component is added. Operational failures exit 2. JSON and self-contained HTML reports can be saved locally; no hosted service or account is required.

## What the model means

- Startup prerequisites traverse every dependency edge.
- Explicit session coupling traverses only `state="session"` edges. It describes lifecycle coupling when prerequisite stop/restart propagation applies.
- Possible coupling crosses at least one dependency whose state was omitted. The QNX 8.0 reference does not state the omitted-state default; BootWeave preserves the uncertainty.
- Stateless edges stop the session-coupling traversal. Application reconnect behavior is outside this model.
- Repair modes, SLM launch options, runtime state, and manual `slmctl` operations affect actual recovery. Manual restart has separate stateless handling. This tool does not emulate SLM or predict availability, successful recovery, or boot timing.
- A `critical` launch can cause a system crash on unexpected process death. A component-only graph cannot describe that outcome.

Malformed XML, unknown structural syntax, entities/includes, and invalid graphs cannot receive a complete clean result. External entities are valid SLM features, but are not yet supported by this standalone-file analyzer. Readiness warnings are review prompts, not proof of a defect. Pathname existence and fixed delays do not prove application health.

The comparison summarizes component configuration, dependencies and findings. Both reports retain module definitions, but standalone module membership changes do not yet have a dedicated change summary. Non-graph properties are retained for comparison; their internal languages (for example, ability specifications) are not validated.

Semantics are grounded in the [QNX 8.0 SLM reference](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slm.html) and [slmctl reference](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slmctl.html). No QNX software is redistributed. No third-party assets, fonts, runtime libraries, or API services are bundled.

## Hackathon status

Working host MVP for **Developer Tooling & Host Tools**, published at [nobelchowdary/bootweave](https://github.com/nobelchowdary/bootweave). The host tool runs on macOS, Linux, and Windows with Python; this does not imply that QNX compiler tools run natively on each host. **Initial QNX target evidence is available:** a licensed QNX 8.0.0 guest boots under nested KVM, and isolated manual-restart observations include independent process checks. See the [captured evidence and unresolved restart-option discrepancy](validation/evidence/2026-11-24/README.md). Automatic recovery, the wider validation matrix, the complete native demo workload, and the public video remain outstanding.

See [idea research](docs/RESEARCH.md), [the build plan](docs/PLAN.md), [submission checklist](docs/SUBMISSION-CHECKLIST.md), [Ubuntu/AWS host setup](docs/AWS-QNX-HOST.md), [QNX validation procedure](docs/QNX-VALIDATION.md), [demo storyboard](docs/DEMO-SCRIPT.md), and [report schema](docs/report-schema.md).

MIT licensed. QNX names describe the supported platform; this project is independently authored and is not endorsed by QNX or BlackBerry.
