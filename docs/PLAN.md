# BootWeave build plan

Working name: **BootWeave — review QNX startup changes before they reach a device.** Category: Developer Tooling & Host Tools. Planning baseline: November 22, 2026.

The [November 23 implementation roadmap](IMPLEMENTATION-ROADMAP.md) is the current delivery sequence, with concrete acceptance gates and dates in Central Time. The original rationale and planning baseline follow below.

## Decision

| Candidate | Strong demonstration | Delivery constraint | Decision |
| --- | --- | --- | --- |
| BootWeave: SLM configuration review and CI policy | Show an optional dashboard becoming a prerequisite of motion control; identify the path; reject the change; review the correction | Must distinguish static coupling from observed recovery and validate semantics on QNX | Build this focused host product |
| Real-time fault/recovery laboratory | Fail a process and inspect measured recovery behavior | Needs a licensed target, purpose-built workloads, and careful measurement; broad generic profiling overlaps existing tools | Possible later integration |
| Port an open-source developer utility | Reproducible QNX build of an existing useful tool | First identify a missing port, then solve build/runtime issues; usefulness depends on the selected upstream | Keep as fallback, not parallel scope |

These are engineering judgments about this team's current starting point, not predictions about other entrants. QNX already supplies [System Information and System Profiler](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.ide.userguide/topic/analyze_sys_behavior.html) for runtime investigation. The [ports dashboard](https://oss.qnx.com/) is the starting point for checking port coverage. The [hackathon overview](https://qnx.devpost.com/) explicitly includes host tooling.

## Product distinction

BootWeave makes the configuration change itself reviewable: source-linked diagnostics, prerequisite layers, explicit versus possible lifecycle coupling, before/after changes, and a protected-component CI rule. Existing [SLM](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slm.html) and [slmctl](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slmctl.html) supply the platform semantics and runtime controls. BootWeave complements them with an offline review workflow. We have not established that no similar third-party tool exists.

The MVP runs entirely on the host. It has no C agent, cloud service, AI service, target deployment, or hardware controller. Robot examples are authored XML illustrations; their robot executables are not supplied. Removing a dependency is appropriate only after application owners confirm it is optional.

## Current milestone

- Host MVP implemented: analyzer, CLI, local web workbench, comparison, JSON/HTML reports, and `--protect motion-control` policy.
- Policy rejects newly introduced explicit **or possible** coupling to the protected component. Invalid/incomplete inputs cannot pass as clean graphs.
- Current host suite: 39 passing tests. This is host verification only.
- Public repository: [nobelchowdary/bootweave](https://github.com/nobelchowdary/bootweave).
- GitHub host verification passes on Linux, macOS, and Windows. QNX SDP 8.0 noncommercial license access has been obtained and assigned to the project owner; SDK installation and native execution remain pending.
- QNX target execution, real-world configuration feedback, tutorial, video, and Devpost submission remain pending.

## Schedule and acceptance gates

| Dates, Pacific | Work | Exit evidence |
| --- | --- | --- |
| Nov 22 | Complete host MVP and reproducible demonstration | Tests pass; risky comparison fails policy; correction passes; workbench loads |
| Nov 23–26 | Obtain QNX Everywhere access; prepare isolated licensed QNX 8.0 target | Exact image/version recorded; validation fixture accepted; captured `slmctl` output |
| Nov 27–30 | Execute [target validation](QNX-VALIDATION.md); resolve semantic discrepancies | Explicit session/stateless/omitted-state results and assumptions documented |
| Dec 1–4 | Review a shareable real SLM configuration; get developer feedback | Reproducible review case and one concrete usability improvement |
| Dec 5–8 | Polish diagnostics, accessibility, clean-machine instructions, tutorial | Independent reproduction; public tutorial draft; scope frozen |
| Dec 9–11 | Publish licensed public repository; record demo under three minutes | Public links work; video shows the host product and labels target evidence accurately |
| Dec 12–14 | Complete Devpost fields and submit; keep a one-day buffer | Submission receipt and a fixed repository revision retained |

Official deadline: **December 15, 2026, 11:00 AM Pacific / 2:00 PM Eastern**. The [rules](https://qnx.devpost.com/rules) control; recheck before submitting.

## Judging strategy

The four [judging criteria](https://qnx.devpost.com/) have equal weight. Support implementation with tests and traceable QNX semantics; design with a complete import→inspect→compare→export workflow; impact with a specific configuration regression; innovation with explainable CI protection and explicit uncertainty. A tutorial can teach this review task. Pursue the QNX-specific technology bonus only if the finished evidence makes a credible case; configuration parsing alone should not be oversold as native platform engineering.

No win is guaranteed. Prioritize a reproducible, useful tool and honest evidence over adding features that cannot be verified before submission.
