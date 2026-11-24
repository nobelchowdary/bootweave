# BootWeave submission checklist

## Official requirements summary

Checked November 24, 2026 against the [official rules](https://qnx.devpost.com/rules) and [overview](https://qnx.devpost.com/). Recheck before submission; the rules prevail.

Entrants must be 18+, meet residency restrictions, and avoid excluded sponsor/judge conflicts. Teams need an authorized representative. Register and submit by December 15, 2026, 1 PM Central / 2 PM Eastern. Work must be new or significantly updated during November 2–December 15. Select one category. A working host tool meaningfully supporting QNX 8.0 qualifies.

Provide a public GitHub/GitLab/Bitbucket repository with all required source/assets, reproducible instructions, and a detectable open-source license. Explain and demonstrate the QNX connection. Specify QNX version, intended target, and toolchain. Include an English description and public YouTube demonstration under three minutes showing the intended platform; clear third-party rights. Keep judging access free and unrestricted through January 29, 2027.

Ports require a new submission-period repository, upstream URL, and contribution files rather than an upstream fork. The tutorial bonus requires a tutorial authored during the submission period and its URL. A project may receive one Overall, one Bonus, and Community Choice award. No explicit entrant AI prohibition or disclosure clause was found.

## Required release gates

Status below distinguishes prepared files from completed external submission. A written script is not an uploaded video; a local edit is not a published repository revision.

- [x] Public [repository](https://github.com/nobelchowdary/bootweave) is accessible; GitHub displays **MIT license** in About (checked November 24).
- [x] Source and host build/run instructions exist; intended category is **Developer Tooling & Host Tools**.
- [x] Basic entrant eligibility and individual entry confirmed by the entrant November 24; the final form must retain accurate ownership/contribution statements.
- [x] Four [native three-service recordings](../validation/evidence/native-demo/README.md) cover risky/revised configurations with separate automatic-failure and plain-manual operations, independent PID/UDP instance checks, successful native IPC samples and verified cleanup.
- [x] Six additional [matrix cases](../validation/matrix/README.md) retain missing/cyclic prerequisites, module glob startup, delay readiness, absent-path timeout and external-entity results. Coverage remains scoped to the recorded build/cases.
- [x] Two-file/protected-service review, property/module changes and imported-recording hash checks are implemented. [Browser release QA](BROWSER-QA.md) is complete for the listed interactions; matching evidence hashes do not authenticate origin.
- [x] Final source, images, tutorial and reproduction instructions are public. [Fresh-checkout verification](RELEASE-CHECKS.md) and cross-platform CI retain the results; media is linked separately.
- [x] Reconcile the [Devpost draft](DEVPOST-SUBMISSION.md) with the finished implementation. Specify the Python host runtime, actual QNX target/version, and native compiler if the native workload is included.
- [x] Record the functioning host product in English, **2:33.45**, and upload it to [YouTube](https://www.youtube.com/watch?v=m-SxmSBkiLo) with its title, description and thumbnail. Captions are burned in and an SRT was uploaded. English (United States), AI-use disclosure and no paid promotion are recorded.
- [x] Publish the YouTube video as **Public** and verify playback while signed out (November 24, 2026; 153.481-second player duration, no playback error). Selectable English (United States) captions rendered in the signed-out player; burned-in captions are also present. [Storyboard](DEMO-SCRIPT.md).
- [x] Retain the verified public video URL in the saved Devpost entry; the project preview embeds `youtube.com/embed/m-SxmSBkiLo`. [Project page](https://devpost.com/software/bootweave-vilw4u) (final hackathon entry pending).
- [x] Ensure submitted media uses owned or permitted material and contains no private account/host information.
- [ ] Complete registration, team details and all Devpost fields; select exactly one category; check every submitted URL.
- [ ] The entrant supplies the two personal feedback answers in the Devpost form.
- [ ] At the final submission step, the entrant reviews the complete entry, verifies its ownership/contribution statements and confirms entry. The rules' opening states that submission constitutes agreement; the remaining decision belongs at that concrete final step, after media and links are ready.
- [ ] Submit by **December 14** as our buffer; retain the actual submission receipt and revision. Keep code and media accessible through January 29, 2027.

## Evidence that strengthens the entry

These are product-quality goals, not additional universal eligibility requirements for a host analyzer.

- [x] Native three-service QNX message passing, source/build instructions and scoped before/after observations are retained. All four final bundles were checked against source/artifact hashes.
- [x] Automatic SIGKILL-triggered recovery is recorded separately from plain manual restart in fresh dedicated SLM instances. The earlier inner-`-s` discrepancy remains unresolved and documented.
- [x] Complete final browser QA for file imports, protected-service policy, property/module changes, evidence mismatch/incomplete states, and bundle export.
- [ ] Have another developer reproduce one review; collect specific feedback without inventing time savings.
- [x] [The tutorial](TUTORIAL.md) is public and its URL is entered in the saved Devpost draft for the optional tutorial bonus; final entry is pending.
- [x] Capture a clear failing policy, its correction, an invalid input, and the distinction between static analysis and target observations.

Final factual status: the host workflow, native application contrast and six matrix cases exist with retained evidence. Browser QA, the 2:33 demo and five images are prepared, and the [YouTube demonstration](https://www.youtube.com/watch?v=m-SxmSBkiLo) is public with signed-out playback verified. The entrant's two personal feedback answers and final Devpost submission remain open. Further SLM coverage, including exits/blocks readiness and other utility builds, must not be described as complete.
