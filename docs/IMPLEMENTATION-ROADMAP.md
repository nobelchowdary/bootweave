# BootWeave implementation roadmap

Progress on November 24: an Ubuntu x86-64 AWS lab with nested KVM is running, SDP 8.0 is installed and activated, and QNX 8.0.0 boots. Initial manual-restart observations are recorded in [the evidence directory](../validation/evidence/2026-11-24/README.md). Native correctness remains incomplete; an option-description discrepancy is explicitly unresolved.

Decision date: November 23, 2026. All schedule times below are Central Time.

## Product decision

Build a complete review and verification workflow for QNX 8.0 System Launch and Monitor configuration changes. The developer question is: **Does this edit introduce unwanted lifecycle coupling, and what does a controlled QNX run show?**

Enter Developer Tooling & Host Tools. The [official rules](https://qnx.devpost.com/rules) allow QNX-specific host tools and give equal weight to implementation, design, impact, and innovation/problem understanding. Native execution is our recommended correctness and demonstration evidence; it is not a universal eligibility requirement for host tools. The tutorial bonus is optional.

Current foundation: host analyzer, graph, CLI, comparison API, JSON/HTML reports, 39 passing host tests, a public MIT repository, and passing Linux/macOS/Windows CI. QNX noncommercial license access is deployed. Everything described below remains proposed until implemented and verified; no native QNX execution has been captured yet.

## Architecture

| Part | Implementation | Purpose |
| --- | --- | --- |
| Host review tool | Existing Python analyzer/API and browser workbench | Compare two configurations, explain exact dependency paths and enforce protected-service policy |
| Reference target | QNX 8.0 in QEMU; initially use the documented Ubuntu/x86_64 route | Reproduce SLM semantics on a repeatable target |
| Native demonstration | Three small services: sensor, controller, optional telemetry; SLM controls their lifecycle | Give the configuration an actual observable workload |
| Independent observation | Recorder outside the tested dependency graph; capture service instance IDs, heartbeat sequences, process states and SLM output | Corroborate what stopped/restarted and preserve raw evidence |
| Report and CI | Bind source hashes, selected policy, environment manifest and recorded results | Make a review reproducible outside the developer's browser |

BootWeave can stay on the Mac or another Python host. An ARM64 QNX target is a useful second validation platform when readily available. The reference setup should be selected for a reliable supported image and reproducibility; CPU architecture itself is not our product claim. Do not make physical timing or worst-case real-time guarantees from QEMU results.

## Milestone 1: establish native correctness

Follow [QNX-VALIDATION.md](QNX-VALIDATION.md) before extending recovery claims. Record the exact QNX image/version, architecture, SLM options, configuration digest and commands. Verify `slm`, `slmctl` and `slogger2` are available; customize the image if necessary.

Start with the existing minimal fixture. Then use a small native service workload. Use QNX message passing where services actually communicate. Add a resource manager only if the workload needs its pathname/readiness or file-interface behavior. Preserve enough source and build instructions for another developer to reproduce the workload with licensed tools.

Acceptance:

- Explicit session/stateless relationships and the omitted-state case have observed results.
- Automatic failure recovery, ordinary manual restart and stateless-aware manual restart are separate cases.
- Readiness success/timeout, missing prerequisites and cycles have recorded native outcomes.
- A monitor independent of the tested services records instance IDs and heartbeat sequences. A changed PID alone does not establish continued application function.
- Any model discrepancy is resolved or remains explicitly unsupported/unknown.

## Milestone 2: complete real-file review

Add independent **Before** and **After** file imports to the UI. Preserve both documents, filenames and hashes. Add protected-service selection and display policy pass/fail/not-evaluable results with an exact path for every violation. Use the same engine and policy in the browser and CLI.

Show property-level changes and module membership changes. Start with self-contained files; add bounded local configuration bundles if representative QNX configurations require includes. Retain per-file source locations and report missing/unsupported input explicitly.

Acceptance: two arbitrary user files can be compared, a regression fails, its correction passes, and the exported artifact agrees with the CLI on source hashes, policy and violations. Editing either input invalidates the old comparison.

## Milestone 3: add the signature verification report

Import a recorded QNX run into the review. Show **configuration-derived relationships**, **observed target behavior**, and **unresolved discrepancies** as separate fields. Include the exact operation performed; different restart/recovery operations must not be treated as equivalent.

Capture source hashes, service binaries/build revision, QNX/SLM environment, launch options, raw logs, service instance IDs and observer results. Hashes bind files together; they do not independently prove where a recording originated. Preserve the continuous demo and reproducible capture procedure as additional evidence.

Acceptance: missing observations, mismatched source hashes, truncated records and unsupported scenarios cannot produce a verified result. Included sample captures are clearly identified. A fresh target run can generate the same report structure.

## Milestone 4: test usefulness and the complete journey

- Add browser automation for two-file import, protected-service selection, failing/passing reviews, invalid input, changed-input invalidation, export and keyboard navigation.
- Add graph/model tests for alternate paths, module-only changes and representative configurations. Keep ambiguous cases uncertain.
- Exercise the native matrix repeatedly and retain each run's results rather than publishing only a successful run.
- Test clean-checkout installation and reproduction from the public instructions.
- Measure analysis/render behavior on representative 50/100/250-component inputs and publish the actual environment/results.
- Ask two or three QNX developers to reproduce a review and record specific feedback. Use only configurations they may share. Report measured review effort if collected; do not invent savings.

## Demonstration story

1. Load a working QNX configuration and show an independent controller heartbeat.
2. Introduce a known unwanted session dependency on optional telemetry.
3. BootWeave explains the path and the protected-service policy rejects the edit.
4. In the isolated QNX fixture, perform the specified failure/recovery operation and show the recorded behavior. The exact effect must be established experimentally.
5. Review the correction, repeat the operation, and show the resulting observations and passing policy.
6. Export the report and show the reproduction instructions.

Teach one precise lesson: lifecycle dependencies belong in code review and can be checked against native behavior. Describe the example as a controlled demonstration, not an independently discovered production defect.

## Delivery schedule

| Dates | Deliverable / stopping gate |
| --- | --- |
| Nov 23–26 | Boot QNX and capture the first SLM validation results. If setup stalls, prioritize the supported reference environment before adding target complexity. |
| Nov 27–Dec 2 | Finish two-file/policy UI and record the three-service scenario. |
| Dec 3–7 | Deliver the verification report, browser tests, representative configuration review and developer feedback. |
| Dec 8–11 | Freeze features; publish the tutorial, exact reproduction instructions and a roughly 2:40 public demo. |
| Dec 12–14 | Verify submission links, release/tag the demonstrated revision, finish Devpost and submit with a buffer. |

Official deadline: **December 15, 2026, 1:00 PM Central / 2:00 PM Eastern**. Recheck the [official page](https://qnx.devpost.com/) before submission. Native results, product completeness and useful developer evidence take priority over additional feature breadth. Winning remains a judging outcome, not a guaranteed consequence of completing this plan.
