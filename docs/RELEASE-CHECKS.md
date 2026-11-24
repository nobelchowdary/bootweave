# Public-checkout release checks — November 24, 2026

Tested public revision: [`4c4b041c23ced5f2729bb7285fd7f03e992866d7`](https://github.com/nobelchowdary/bootweave/tree/4c4b041c23ced5f2729bb7285fd7f03e992866d7).

The checks used a new shallow clone of the public HTTPS repository in an isolated temporary directory, rather than the development checkout. No dependency installation was required. Host: macOS/Darwin, reported OS version `27.2`, `arm64`, Python **3.13.3**. These are host checks and integrity checks of retained evidence; this step did not rerun the QNX experiments.

## Reproduction results

```sh
git clone --depth 1 https://github.com/nobelchowdary/bootweave.git
cd bootweave
git rev-parse HEAD
python3 -m unittest discover -s tests -v
```

Actual result at the revision above: **45 tests passed**, exit 0, reported test time 0.631 seconds. A later clone can resolve a newer commit; check the revision before comparing results.

| Command after `python3 -m bootweave` | Expected exit | Observed |
| --- | --- | --- |
| `compare native/configs/revised.xml native/configs/risky.xml --protect controller` | 1 | 1 — regression rejected |
| `compare native/configs/risky.xml native/configs/revised.xml --protect controller` | 0 | 0 — correction accepted |
| `evidence native/configs/risky.xml native/evidence/risky-automatic-evidence.json` | 0 | 0 — matched |
| `evidence native/configs/revised.xml native/evidence/revised-automatic-evidence.json` | 0 | 0 — matched |
| `evidence native/configs/risky.xml native/evidence/revised-automatic-evidence.json` | 1 | 1 — mismatch |

The expected failing commands are deliberate checks. A matching evidence result binds the recording to the configuration bytes after envelope validation; it does not authenticate origin or prove a fresh target execution.

## Retained evidence integrity

All four final [native application bundles](../validation/evidence/native-demo/README.md) were checked from the fresh public clone:

| Bundle | Artifact SHA-256 references | Archived source members | Configuration SHA-256 | Recorded completed/cleanup flags |
| --- | --- | --- | --- | --- |
| risky-automatic-final | 10/10 match | 21/21 match | Match | Both true |
| revised-automatic-final | 10/10 match | 21/21 match | Match | Both true |
| risky-manual-final | 10/10 match | 21/21 match | Match | Both true |
| revised-manual-final | 10/10 match | 21/21 match | Match | Both true |

Each `observation.json` artifact entry was rehashed from its referenced file. Each file listed in `source-manifest.json` was read directly from `authored-source.tar` and rehashed without extracting the archive. The configuration file in each bundle matched its recorded digest. Source snapshots identify the captured authored bytes; their historical base revision is not substituted for that manifest.

For the [matrix package](../validation/matrix/README.md), the public recorder matched its recorded hash, all **seven** source fixtures matched the environment manifest, and all **six** observations referenced the matching recorder and fixture digests. Every case records `completed=true` and `cleanup_verified=true`. These consistency checks preserve the scope and limitations of the original observations; they do not independently attest their origin.

All repository-relative Markdown file links in the root README, tutorial, native README, native evidence index and matrix README resolved in the fresh checkout. HTTP HEAD requests returned **200** for the linked public repository, host-workflow page, QNX SLM reference and QNX slmctl reference. This checks link availability, not the latest workflow run's status or video publication.

## Host analysis measurements

Three consecutive in-process calls to `bootweave.analyzer.analyze` were measured for each synthetic linear chain. Each chain used explicit session edges, component names `service-000` onward, command `/bin/true`, and no readiness waits. Every report was a complete valid graph. Times cover **analysis only**: imports, JSON serialization, I/O, HTTP, graph rendering and browser interactions were excluded. Report sizes use compact UTF-8 JSON with separators `(',', ':')` and `ensure_ascii=False`.

| Components | XML bytes | Analysis milliseconds, three trials | Median ms | Compact report bytes |
| --- | --- | --- | --- | --- |
| 50 | 6,873 | 1.902 / 2.022 / 1.873 | 1.902 | 499,695 |
| 100 | 13,773 | 7.621 / 6.803 / 8.059 | 7.621 | 3,059,746 |
| 250 | 34,473 | 50.401 / 55.553 / 73.393 | 55.553 | 40,600,048 |

The retained impact paths make the 250-component chain's report large—about 40.6 MB even as compact JSON. These results do not establish browser responsiveness, serialization latency, or similar performance for arbitrary graph shapes. They suggest report-size reduction or lazy path expansion as future work. They are Python host measurements, not QNX scheduling, boot, recovery or real-time measurements.

Equivalent measurement shape, after importing `analyze`, `json` and `time`:

```python
for count in (50, 100, 250):
    xml = '<SLM:system>' + ''.join(
        '<SLM:component name="service-%03d"><SLM:command>/bin/true</SLM:command>%s</SLM:component>'
        % (i, '<SLM:depend state="session">service-%03d</SLM:depend>' % (i-1) if i else '')
        for i in range(count)
    ) + '</SLM:system>'
    for trial in range(3):
        started = time.perf_counter()
        report = analyze(xml, 'synthetic-chain.xml')
        print(count, trial, (time.perf_counter() - started) * 1000)
    print(len(json.dumps(report, separators=(',', ':'), ensure_ascii=False).encode()))
```

## Remaining release gates

Final browser QA and media/public-YouTube checks are separate from this reproduction. Recheck the demonstrated revision and public links after final publishing. The [submission checklist](SUBMISSION-CHECKLIST.md) tracks the final entrant review and actual Devpost submission; neither is implied by passing these checks.
