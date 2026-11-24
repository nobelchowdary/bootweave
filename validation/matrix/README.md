# Isolated QNX SLM validation matrix

**Six scoped cases recaptured November 24, 2026; one release-check recording per case on this build is published here.** These records supplement the earlier [manual-restart observations](../evidence/2026-11-24/README.md). They do not establish complete SLM compatibility, automatic-recovery behavior, controller function or physical timing.

The guest reported `QNX bootweave-qnx 8.0.0 2026/10/30-09:10:05EDT x86pc x86_64`. Both utilities identify package `com.qnx.qnx800.target.base.slm/0.0.1.00135T202311191043L`; individual build IDs and dates are in [environment.json](evidence/2026-11-24/environment.json). Recorder and all fixture SHA-256 digests are retained there. The recorder identifies its own source hash in every case record; the [exact captured recorder source](evidence/2026-11-24/capture-matrix-source.py) is retained too. [Host analysis manifest](evidence/2026-11-24/host-analysis-manifest.json) identifies the analyzer bytes used for the adjacent static reports.

| Case | Native observation | Host result / scope |
| --- | --- | --- |
| [Missing prerequisite](evidence/2026-11-24/missing-observation.json) | SLM printed `Unknown dependency 'bw-matrix-absent'`; no dedicated daemon or fixture process was found. | [Static report](evidence/2026-11-24/missing-host-report.json) diagnoses a missing prerequisite. |
| [Two-component cycle](evidence/2026-11-24/cycle-observation.json) | SLM printed `Circular dependency detected` and named both components; no dedicated daemon or fixture process was found. | [Static report](evidence/2026-11-24/cycle-host-report.json) diagnoses a cycle. |
| [Module wildcard](evidence/2026-11-24/module-observation.json) | Starting only module `bw-matrix-group`, whose member is `bw-matrix-*`, launched both configured sleep processes with distinct arguments 901/902. SLM reported both INITIALIZED. | [Static report](evidence/2026-11-24/module-host-report.json) expands the module to those two component names. |
| [Delay readiness](evidence/2026-11-24/delay-observation.json) | Prerequisite was WAITING while the dependent was DEAD/not present in the OS table. After SLM logged completion of delay `2000`, both were INITIALIZED and both PIDs appeared. | [Static report](evidence/2026-11-24/delay-host-report.json) records the fixed delay and prerequisite relationship. This is ordering evidence, not a precise latency measurement. |
| [Absent pathname](evidence/2026-11-24/pathname-observation.json) | With `polltime="100:1000"`, SLM logged a wait timeout and stopped the prerequisite. Its repair policy was `none`; it became INACTIVE/DEAD. The dependent never appeared in sampled OS tables. | [Static report](evidence/2026-11-24/pathname-host-report.json) retains readiness settings. It does not predict whether that path exists at runtime. |
| [Local external entity](evidence/2026-11-24/external-observation.json) | SLM accepted the DOCTYPE/entity fixture, loaded the component from its separate file and launched `sleep 903`; the component was INITIALIZED. | [Static report](evidence/2026-11-24/external-host-report.json) is deliberately incomplete with unsupported-XML diagnostic BW002. Native support does not imply this host parser supports includes. |

For each case, `completed=true` means the **capture procedure and cleanup** completed, including a native rejection where applicable. It does not mean the submitted configuration was accepted or every analyzer prediction was validated. `capture_completed` separately identifies whether observation finished before cleanup. The raw `audit`, console, SLM queries and independent OS snapshots remain in each observation JSON.

## Isolation and cleanup

The recorder used only `/dev/bootweave-matrix-slm`, `/data/bootweave-matrix` and reserved fixture arguments 901/902/903. It refused to begin if the endpoint or matching sleep processes already existed. Every launch used a separate SLM instance, with no adoption of existing services. It never issued commands to the system SLM or `/dev/bootweave-demo-slm`.

SLM daemonizes, so the recorder identified the actual process through its unique endpoint in `pidin` output. Cleanup killed that dedicated daemon first, then only processes identified by this experiment's reserved arguments after its empty-set precheck. All six records have `cleanup_verified=true`: no matching fixture process or matrix endpoint remained. This does not claim that no unrelated processes existed on the guest.

The absent-path case used an owned scratch pathname. The missing/cyclic cases used `-s none`; errors occurred while loading the configuration. The module and entity cases selected their named startup target directly. The delay case used global `-T 4000`; other cases used `-T 1200`; per-component pathname polling/timeout was explicit. Exact commands are in the records.

## Repeat the capture

Use the existing licensed, disposable [QNX lab](../../docs/AWS-QNX-HOST.md), with verified guest SSH host key, the dedicated lab key, active `slogger2`, `sleep`, and the licensed SLM binaries already installed at `/data/bootweave-lab/slm` and `/data/bootweave-lab/slmctl`. The SSH transport stays on host loopback port 2222. Do not publish keys, SDK binaries, images, licenses or private account/cloud details.

On the Ubuntu host, from this checkout:

```sh
python3 validation/matrix/capture-matrix.py \
  --lab "$HOME/bootweave-qnx-target" \
  --output "$HOME/bootweave-matrix-recordings"
```

The recorder transfers and byte-checks the supplied source fixtures, bounds each guest command and observation window, saves every case, and stops subsequent cases if cleanup fails. It requires a new output directory so earlier records remain available. The entity references its owned absolute guest path; preserve both XML files when repeating it.

Transport errors, nonzero query exits, missing process-table headers and unparseable rows cannot be interpreted as empty process sets. Cleanup is asserted only after successful independent process and endpoint checks. The missing/cyclic cases additionally require their observed native rejection messages, so an unrelated launch failure cannot masquerade as those rejections. A failed capture or cleanup produces a nonzero recorder exit status. The release check exercised a successful native `pidin` query, a real SSH connection failure on a closed host-loopback port, and negative header/row/timeout-metadata inputs; each failure predicate rejected the input as unknown rather than reporting no processes. The earlier host recordings remain in their original operator lab directory; these release-check captures were written to a separate directory.

## Limits

These are sampled states and process identities from one utility build and virtual target. SLM and OS snapshots are successive SSH queries rather than an atomic snapshot; the pathname record intentionally preserves a transition where SLM still reported WAITING after the process table no longer contained the PID. Host elapsed sampling times are not guest scheduler or real-time benchmarks. The delay record shows a before/after ordering transition, not a bound on scheduling jitter or startup latency.

The external-entity case only tests one local file. It does not evaluate recursive entities, entity security, remote includes, or host include support. Module coverage is one glob over two components. Readiness coverage is one fixed delay and one absent pathname; exits/blocks and pathname success remain untested here. This recorder does not inject critical-process failures or test automatic repair; the [native application experiment](../evidence/native-demo/README.md) records its own separate automatic-failure and manual-restart operations.
