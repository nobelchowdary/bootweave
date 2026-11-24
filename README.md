# BootWeave

**Review QNX startup changes before they reach a device.**

[Repository](https://github.com/nobelchowdary/bootweave) · [Host verification](https://github.com/nobelchowdary/bootweave/actions/workflows/review.yml) · [MIT license](LICENSE) · [YouTube demo](https://www.youtube.com/watch?v=m-SxmSBkiLo) · [Media and captions](docs/media/README.md)

BootWeave is a host developer tool for QNX 8.0 System Launch and Monitor (SLM) configuration. Import SLM XML, explore prerequisites and recovery coupling, review source-linked diagnostics, and compare configuration changes. A CI guard detects new explicit or possible coupling to a component you protect.

![BootWeave configuration review workbench](docs/assets/workbench.jpg)

## Run the workbench

Python 3.11+ is the only dependency. From this repository:

```sh
python3 -m bootweave serve
```

Open http://127.0.0.1:8765. Choose **native-risky.xml**, select `telemetry`, and inspect its explicit session path to `controller`. In **Change review**, compare the revised baseline against the risky candidate, protect `controller`, and run the check. The policy explains the newly introduced path. Swap the revisions to review the correction. Each revision can also be imported or edited independently.

In **Configuration review**, choose the matching captured recording and check its binding to the active XML. The risky native experiment replaced the controller after optional telemetry failure; in the revised experiment, the controller kept its process instance and continued successful software-sensor IPC in the observed windows. The panel separates static relationships from imported observations. A matching hash does not authenticate the recording's origin or prove a fresh execution.

The older **robot-risky.xml** and **robot-revised.xml** examples remain illustrations: their robot executables are not included or represented as running. The supplied [three-service native workload](native/README.md) uses an authored software sensor, not physical hardware.

## CLI and CI

```sh
python3 -m bootweave analyze examples/robot-risky.xml
python3 -m bootweave analyze examples/robot-revised.xml --format json
python3 -m bootweave analyze examples/robot-revised.xml --format html --output review.html

# Reject a change that newly couples motion-control to a prerequisite.
python3 -m bootweave compare examples/robot-revised.xml examples/robot-risky.xml --protect motion-control

# The correction passes the same policy.
python3 -m bootweave compare examples/robot-risky.xml examples/robot-revised.xml --protect motion-control

# Native workload: reject the seeded regression (exit 1), accept its correction.
python3 -m bootweave compare native/configs/revised.xml native/configs/risky.xml --protect controller
python3 -m bootweave compare native/configs/risky.xml native/configs/revised.xml --protect controller

# Check a captured recording's exact XML binding; does not authenticate origin.
python3 -m bootweave evidence native/configs/revised.xml native/evidence/revised-automatic-evidence.json

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

The comparison summarizes component properties, dependencies, module membership and findings. Protected services can be selected in the browser or CLI. Non-graph properties are retained for comparison; their internal languages (for example, ability specifications) are not validated. Exported comparison JSON retains the policy; a configuration review bundle can retain an imported recording and its current binding check.

Semantics are grounded in the [QNX 8.0 SLM reference](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slm.html) and [slmctl reference](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slmctl.html). No QNX software is redistributed. No third-party assets, fonts, runtime libraries, or API services are bundled.

## Hackathon status

Working developer tool for **Developer Tooling & Host Tools**, published at [nobelchowdary/bootweave](https://github.com/nobelchowdary/bootweave). The host tool runs on macOS, Linux, and Windows with Python; this does not imply that QNX compiler tools run natively on each host. The [native application experiments](validation/evidence/native-demo/README.md) record automatic failure and plain manual restart separately for both configurations, with actual QNX message passing, independent process/heartbeat observations and verified cleanup. The [six-case validation matrix](validation/matrix/README.md) covers selected graph, module, readiness and unsupported-include cases. These scoped observations do not establish complete SLM compatibility, continuous availability or real-time performance. The [earlier restart-option discrepancy](validation/evidence/2026-11-24/README.md) remains explicit. The [2:33 YouTube demonstration](https://www.youtube.com/watch?v=m-SxmSBkiLo) is public, with signed-out playback verified November 24; [media sources and captions](docs/media/README.md) are available. The entrant's two personal feedback answers and final Devpost submission remain pending.

See [idea research](docs/RESEARCH.md), [the build plan](docs/PLAN.md), [submission checklist](docs/SUBMISSION-CHECKLIST.md), [Ubuntu/AWS host setup](docs/AWS-QNX-HOST.md), [QNX validation procedure](docs/QNX-VALIDATION.md), [demo storyboard](docs/DEMO-SCRIPT.md), and [report schema](docs/report-schema.md).

MIT licensed. QNX names describe the supported platform; this project is independently authored and is not endorsed by QNX or BlackBerry.
