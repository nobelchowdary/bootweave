# BootWeave — Devpost draft

**DRAFT — final video and publication links still need completion.** The copy below describes the implemented host workflow, four captured native application experiments and six additional matrix cases. Final browser QA is in progress; reconcile the demonstrated revision and media links before submitting.

## Form fields

| Field | Draft value |
| --- | --- |
| Project name | BootWeave |
| Tagline | Catch QNX lifecycle regressions before deployment. |
| Category | Developer Tooling & Host Tools |
| Source | https://github.com/nobelchowdary/bootweave |
| Demonstration video | **PENDING — public YouTube URL, duration under 3:00** |
| Tutorial bonus URL | **PENDING publication check:** https://github.com/nobelchowdary/bootweave/blob/main/docs/TUTORIAL.md |
| Built with — implemented source | Python, JavaScript, HTML, CSS, C, QNX 8.0 SLM, slmctl, QNX message passing, QEMU, Ubuntu |
| Native workload toolchain | QNX `qcc -Vgcc_ntox86_64`, GCC 12.2.0 target toolchain, C11; compiled and executed on the recorded QNX x86-64 guest |

## Inspiration

A configuration review can miss a consequential relationship: an essential service has quietly acquired a lifecycle dependency on an optional interface. The XML may look reasonable, yet the change can expand what must start first and what may need to stop when a prerequisite changes.

We wanted that relationship to be visible during review. BootWeave brings QNX System Launch and Monitor configuration into a local workbench and a repeatable CI check, so a developer can ask a specific question: “What new prerequisites and lifecycle coupling does this edit introduce?”

## What it does

BootWeave reads QNX 8.0 SLM XML and maps the configured services and prerequisites. Select a service to inspect startup reachability, explicit session coupling, and possible coupling through dependencies whose state was omitted. Diagnostics lead back to source lines and the relevant QNX documentation.

The workbench compares independently imported or edited baseline/candidate files, including service properties, module membership, dependencies, findings and newly introduced coupling paths. Select a protected component in the browser or CLI to reject new explicit or possible lifecycle exposure. In our native software lab, an unnecessary dependency on optional telemetry makes the controller vulnerable to the telemetry service's lifecycle. The guard rejects that regression and accepts its correction.

Imported target recordings can be checked against the active XML's configuration hash and shown alongside static analysis. Reports retain the operation, environment and observed process instances; export bundles preserve the imported record and check result. A matching hash confirms configuration association and envelope consistency, not trusted origin or a fresh target run.

JSON and self-contained HTML reports make the review portable. The Python host tool and browser interface run locally. The core application needs no account, proprietary SDK, target connection, cloud service or AI API to inspect a configuration.

Malformed, incomplete, unsupported and cyclic inputs remain visible as failures or incomplete analyses. BootWeave does not substitute a clean-looking graph for a result it could not evaluate.

## How we built it

One Python engine supplies the CLI and local HTTP API. The browser renders the dependency map, source context and review findings; the policy uses the same graph relationships as the host report. Reproduction instructions and automated host checks live with the source in an MIT-licensed repository.

The native reference workload has three small C services: sensor, controller and optional telemetry. The sensor uses `name_attach`, `MsgReceive` and `MsgReply`; clients use `name_open`, `MsgSend`, bounded waits through `TimerTimeout`, and reconnection handling. We compiled the sources with the QNX GCC 12.2.0 x86-64 toolchain and ran them on QNX. The controller consumes sensor messages and has no application dependency on telemetry, making the extra SLM relationship an intentionally authored configuration regression. An independent host receiver captures process-instance IDs and actual IPC counters emitted by the running services.

We grounded the model in QNX's SLM and slmctl references, then established a separate licensed QNX lab: Ubuntu 24.04 x86-64, QEMU 8.2.2, nested KVM, and a QNX 8.0.0 guest. The recorded guest kernel reports `2026/10/30-09:10:05EDT`. The SLM utility package is separately identified as `com.qnx.qnx800.target.base.slm/0.0.1.00135T202311191043L`; a kernel date is not a substitute for its utility version.

## QNX connection and evidence

The meaningful connection is the supported artifact and analysis: QNX SLM component definitions, prerequisite states, readiness conditions, repair settings and module membership. The analyzer, examples, model contract and target fixtures identify that connection directly.

The [native application evidence](https://github.com/nobelchowdary/bootweave/tree/main/validation/evidence/native-demo) retains four final recordings. With the risky configuration, SIGKILL to the identified telemetry process caused SLM to replace both telemetry and controller. With the revised configuration, the same fault replaced telemetry while the controller retained its PID and process-instance ID and produced additional successful sensor IPC samples. The sensor instance remained unchanged in both. Separate plain-manual-restart experiments reproduced the same configuration contrast; each operation used a fresh dedicated SLM instance.

The recorder corroborates SLM output with OS process queries and independent UDP observations, retains configuration/source/binary and raw-artifact hashes, and verifies cleanup. [Six additional matrix cases](https://github.com/nobelchowdary/bootweave/tree/main/validation/matrix) record native rejection of missing/cyclic prerequisites, wildcard module startup, delayed dependent startup, absent-path timeout and local external-entity acceptance. Host include support remains explicitly unsupported.

An [earlier minimal experiment](https://github.com/nobelchowdary/bootweave/tree/main/validation/evidence/2026-11-24) found an inner-`-s` result different from the expectation derived from the current reference description. That observation remains unresolved; the four application experiments use automatic failure or plain manual restart, with no inner `-s`.

These records establish the reported cases on the identified build. Sampled successful IPC and stable process identity do not prove uninterrupted availability, physical timing or production safety. The sensor is a software counter, not hardware. Older robot XML examples remain configuration illustrations; their robot executables are not supplied or represented as running.

## Challenges we ran into

The difficult part was deciding what the evidence supports. An omitted dependency state is not assigned a documented default in the reference we used, so BootWeave preserves it as possible coupling. A pathname becoming available is not proof of application health. Manual restarts and automatic repair are different operations. Native observations also depend on exact utility builds and launch options.

That discipline shaped both the product and its reports: show the path, identify the assumption, and keep an unresolved result unresolved.

## Accomplishments

We built a complete path from independent XML imports to an explainable policy result and a source-associated native recording. The real QNX message-passing workload makes the configuration contrast observable; 46 automated host tests cover the current backend, and the retained native experiments include independent process/IPC observations and verified cleanup. We also preserved a result that challenged our expectation. Static reasoning and native evidence remain separate and inspectable.

## What we learned

Lifecycle configuration deserves the same scrutiny as application code. Good tooling must explain its decision and expose uncertainty. Native experimentation is most useful when it can disagree with the model and retain enough context for another developer to investigate.

## What's next

Test additional QNX/SLM utility builds, broaden readiness coverage to exits/blocks and pathname success, and review representative shareable configurations with QNX developers. Repeat experiments across fresh VM boots, investigate the inner-`-s` discrepancy, and measure developer usefulness from actual reproduction feedback. We do not claim complete SLM compatibility or measured time savings.

## Build and run field

Host product: Python 3.11+; tested instructions are in the [README](https://github.com/nobelchowdary/bootweave#readme). Run `python3 -m bootweave serve` from the checkout and open `http://127.0.0.1:8765`. The CLI comparison command and expected failing/passing sample are documented there.

Native workload: QNX 8.0.0 x86-64 under QEMU 8.2.2/KVM, built using QNX `qcc -Vgcc_ntox86_64` / GCC 12.2.0. See the [native build and capture instructions](https://github.com/nobelchowdary/bootweave/blob/main/native/README.md), [host/image setup](https://github.com/nobelchowdary/bootweave/blob/main/docs/AWS-QNX-HOST.md), and [evidence index](https://github.com/nobelchowdary/bootweave/tree/main/validation/evidence/native-demo). Licensed SDK tools and guest images are obtained separately; they are not redistributed.

## Final editor checks — do not paste as project claims

- Replace pending links with published, signed-out-tested links and add the demonstrated source revision.
- Complete final browser QA and retain the actual result before recording the release video.
- Preserve material limitations and the unresolved operation-specific discrepancy.
- The entrant confirmed basic eligibility and individual entry. Confirm the completed entry and its final ownership/contribution statements at submission time.
- Official [submission requirements and judging](https://qnx.devpost.com/rules) govern the entry. No placement or prize is guaranteed.
