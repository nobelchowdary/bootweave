# BootWeave demo storyboard — 2 minutes 40 seconds

Recording plan, November 24, 2026. The host product, native application contrast and scoped evidence exist. Final browser QA, screen capture and public YouTube upload remain open. Use the verified release build, original title cards and English narration/captions; no music is needed.

The main example is now the **real authored QNX sensor/controller/optional-telemetry workload**. The sensor supplies software counters through native QNX request/reply IPC. It is not a physical robot or sensor. The independent receiver runs outside the tested SLM dependency graph.

| Time | Show | Narration |
| --- | --- | --- |
| 0:00–0:15 | BootWeave; native risky configuration; telemetry selected, controller highlighted | “An optional telemetry process should not control a controller's lifecycle. This QNX software lab contains that exact configuration mistake. BootWeave makes the relationship visible before deployment.” |
| 0:15–0:40 | Change review: revised baseline, risky candidate; protect `controller`; show FAIL and `telemetry → controller` source line | “Import baseline and candidate independently, then protect the controller. The policy finds the new session dependency and explains its path. The controller's C code needs sensor IPC, not telemetry.” |
| 0:40–1:00 | Reverse to risky baseline/revised candidate; show PASS, source hashes and property/module diff affordances; briefly show CLI outputs | “Remove the unnecessary prerequisite and the review passes. The same engine checks files in CI, with source hashes and inspectable changes. Invalid or incomplete graphs cannot pass as clean results.” |
| 1:00–1:35 | Actual QNX automatic-failure recording: environment/version, exact telemetry SIGKILL, independent instance/PID and successful IPC observations; risky then revised contrast | “We built and ran all three services on QNX. With the risky configuration, killing optional telemetry replaced both telemetry and controller. With the correction, telemetry restarted while the controller kept its instance and produced more successful sensor IPC samples. The sensor stayed unchanged.” |
| 1:35–2:05 | Configuration review, native revised XML plus imported revised automatic recording; visible `matched` and origin notice; deliberately check against risky XML to show mismatch | “The workbench associates this recording with the exact XML hash. Change the configuration and it no longer matches. The result is imported evidence, not a live connection or proof of trusted origin. Raw records and reproduction steps stay available.” |
| 2:05–2:25 | Evidence index: four named operations, six matrix cases, earlier unresolved `-s` note; export review bundle | “Automatic failure and plain manual restart have separate records and verified cleanup. Additional cases cover cycles, missing prerequisites, readiness and modules. We preserve an unresolved option discrepancy. These observations make no availability or timing guarantee.” |
| 2:25–2:40 | Workbench export, public repository and published tutorial URLs | “BootWeave makes QNX lifecycle changes reviewable and explainable. It runs locally, is open source, and includes the source, tutorial and scoped native evidence needed to reproduce this review.” |

## Exact host policy shots

Run from the repository in a POSIX shell. Print the actual status immediately after each command; expected statuses are 1, then 0. Do not use `set -e` for the deliberate failure.

```sh
python3 -m bootweave compare native/configs/revised.xml native/configs/risky.xml --protect controller
echo "Exit status: $?"
python3 -m bootweave compare native/configs/risky.xml native/configs/revised.xml --protect controller
echo "Exit status: $?"
```

For the evidence shot, select native revised XML and `native/evidence/revised-automatic-evidence.json`. The equivalent CLI result is:

```sh
python3 -m bootweave evidence native/configs/revised.xml native/evidence/revised-automatic-evidence.json
```

Then choose risky XML with that same recording to demonstrate the actual mismatch. Keep **Origin not authenticated** visible. A matched result checks source association/envelope consistency, not every raw artifact's authenticity.

## Native capture and editorial boundaries

Use the actual [native recording procedure](../native/README.md) to capture fresh target footage, or visibly label the existing [November 24 records](../validation/evidence/native-demo/README.md) as **Recorded QNX experiment**. Never present replayed data as a live connection. Retain an uncut source capture and exact command output; edit pauses rather than outcomes.

The automatic experiment sends SIGKILL to the identified demo telemetry PID and observes SLM recovery. The plain manual experiment is a distinct recording. Neither uses inner `-s`; its earlier discrepancy remains separately documented. Only claim the successful IPC samples and instance behavior actually captured. Avoid “uninterrupted,” “zero downtime,” “safe,” “microsecond recovery” or general SLM compatibility claims.

The matrix includes one fixed-delay and one absent-path readiness case, not every readiness mode. Exits/blocks, additional utility versions and broader fresh-boot repetition remain outside the demonstrated coverage. The older robot XML still uses illustrative executables; do not mix it into native footage as though it ran.

## Shot preparation and upload metadata

Use a clean 16:9 viewport, readable source/terminal text, and no unrelated tabs, accounts, cloud consoles, notifications, desktop watermarks, third-party logos or music. Record the final browser-QA build and check the exported video is below 180 seconds with legible English narration/captions.

Suggested title: **BootWeave | Review QNX startup dependencies before deployment**.

Suggested description:

> BootWeave is a local review workbench and CI guard for QNX 8.0 SLM configuration changes. This demonstration shows an authored three-service QNX message-passing lab, a failing/passing lifecycle policy, and imported native experiment records. Automatic-failure and manual-restart observations are separate. Static analysis and sampled target observations do not establish functional safety, continuous availability or real-time performance. Source and instructions: https://github.com/nobelchowdary/bootweave . Tutorial: https://github.com/nobelchowdary/bootweave/blob/main/docs/TUTORIAL.md .

Upload to YouTube as **Public**, verify playback while signed out, and paste the actual URL into [the Devpost draft](DEVPOST-SUBMISSION.md). Check that the demonstrated revision, tutorial and evidence links are published. A local video file or storyboard is not the required public video link.
