# Review a QNX SLM lifecycle change with BootWeave

In this tutorial you will inspect a QNX 8.0 startup configuration, explain a new lifecycle dependency, reject it in CI, and distinguish the resulting static report from a recorded native experiment.

The host exercise takes about 10–15 minutes and needs Git and Python 3.11+. A browser is useful for the visual steps. You do not need a QNX license to analyze the supplied XML. Repeating the optional target experiment requires your own licensed QNX environment; SDK files and images are not supplied.

This tutorial uses two authored robot configurations. Their robot binaries are illustrative. The correction removes a dependency that the example defines as optional; real applications require an owner to confirm that the prerequisite is unnecessary.

## 1. Get the source and run the host checks

```sh
git clone https://github.com/nobelchowdary/bootweave.git
cd bootweave
python3 --version
python3 -m unittest discover -s tests -v
```

Use `python` instead of `python3` if that is how your compatible interpreter is installed. No `pip install` step is needed for the core host tool. Record the checkout revision with `git rev-parse HEAD` when saving a review.

## 2. Inspect the prerequisite path

```sh
python3 -m bootweave serve
```

Open `http://127.0.0.1:8765`. Choose **Overcoupled robot**, then select `dashboard`. In the example, the `motion-control` component contains:

```xml
<SLM:depend state="session">dashboard</SLM:depend>
```

The element belongs to the dependent service; its value names the prerequisite. The graph therefore includes `dashboard → motion-control`. The network prerequisite also reaches motion control through the dashboard.

Switch between startup and recovery-coupling views. Startup traversal includes every prerequisite edge. Lifecycle coupling follows explicit session edges; a stateless edge stops that traversal. Omitted state stays uncertain. These are configured relationships, not a prediction that every real process will recover successfully. Consult the [SLM reference](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slm.html) for the underlying platform semantics.

Choose **Reviewed robot** and inspect the controller again. Its sensor prerequisite remains, while its optional dashboard prerequisite is removed. The dashboard also uses a pathname readiness wait instead of a fixed delay. The latter is a review improvement in this example, not proof of application health.

For your own files, open **Change review**. Import baseline and candidate XML independently using their separate cards; editing or importing one preserves the other. Select a service under **Protected services** and choose **Compare revisions**. The result includes source hashes, the policy and its violation paths, service/property changes, and module membership changes. **View map** opens either revision for inspection; **Swap revisions** reverses review direction. Changing a source clears the old comparison so it cannot silently describe the previous input.

## 3. Reject the regression with a policy

In a second terminal, run from the checkout:

```sh
python3 -m bootweave compare examples/robot-revised.xml examples/robot-risky.xml --protect motion-control
```

Expected: a failing policy, exit status **1**, and paths including:

```text
dashboard → motion-control
io-sock → dashboard → motion-control
```

The order is **baseline first, candidate second**. `--protect` rejects newly introduced explicit or possible exposure to the named service. It does not assert that the baseline is ideal, remove existing coupling, or certify application safety. A missing protected component and an invalid/incomplete graph cannot produce a passing protection result.

Reverse the files to review the correction:

```sh
python3 -m bootweave compare examples/robot-risky.xml examples/robot-revised.xml --protect motion-control
```

Expected: policy **PASS**, exit status **0**. In a POSIX shell, `echo "$?"` immediately after either command prints its observed status. Do not enable `set -e` while intentionally demonstrating the failure.

## 4. Save a review and inspect a broken input

```sh
python3 -m bootweave analyze examples/robot-revised.xml --format json --output reviewed.json
python3 -m bootweave analyze examples/robot-revised.xml --format html --output reviewed.html
python3 -m bootweave compare examples/robot-risky.xml examples/robot-revised.xml --protect motion-control --format json --output change-review.json
python3 -m bootweave analyze examples/robot-cycle.xml
```

The cycle is expected to fail. In JSON, inspect `source.sha256`, `analysis_complete`, `summary.valid_graph`, `findings`, and `impacts`. In the comparison, inspect the two source hashes and `policy`. Unsupported includes/entities are valid cases for an explicit incomplete result: the current standalone-file analyzer does not silently expand them.

Open `reviewed.html` locally for a shareable static report. A browser export or saved report documents this analysis; it is not a connection to a running target.

## 5. Use the same check in CI

In your own repository, keep an approved baseline and candidate configuration under version control. After checking out a revision and making BootWeave available, run the same comparison command as a normal failing build step. For this repository's sample:

```yaml
- name: Review QNX lifecycle changes
  run: python -m bootweave compare examples/robot-risky.xml examples/robot-revised.xml --protect motion-control
```

Do not append `|| true` to the policy step. Preserve the reviewed baseline deliberately: comparing a file against itself cannot catch a regression. Use `--format json --output change-review.json` when the CI system should retain a machine-readable artifact. The existing [host workflow](../.github/workflows/review.yml) runs the checks on Linux, macOS and Windows.

## 6. Compare the model with scoped native evidence

The [November 24 target record](../validation/evidence/2026-11-24/README.md) uses a different, minimal fixture: a prerequisite and three sleep clients with explicit session, explicit stateless and omitted states. Analyze the identical source:

```sh
python3 -m bootweave analyze validation/fixtures/lifecycle-distinct.xml --format json --output native-fixture-review.json
```

Compare its source SHA-256 with `fixture_sha256` in [the environment manifest](../validation/evidence/2026-11-24/environment.json). Read both operation records and their independent OS-process snapshots. In the recorded plain restart, the session and omitted-state clients received new PIDs while the stateless client's PID remained. The separate inner-`-s` experiment differed from the expectation derived from the current [slmctl option description](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slmctl.html); that discrepancy remains unresolved.

A PID observation establishes process identity in that experiment. It does not show a functioning controller heartbeat or establish automatic repair behavior. Hash agreement binds the analyzed fixture to the record; it does not independently authenticate where a record originated.

To repeat these experiments, first follow [the isolated lab setup](AWS-QNX-HOST.md) and its recorder prerequisites. On that Ubuntu lab host, with its verified guest SSH key, use the existing recorder:

```sh
python3 validation/observe-native.py --lab "$HOME/bootweave-qnx-target" --fixture validation/fixtures/lifecycle-distinct.xml --operation plain --output plain-observation.json
python3 validation/observe-native.py --lab "$HOME/bootweave-qnx-target" --fixture validation/fixtures/lifecycle-distinct.xml --operation stateless-option --output stateless-option-observation.json
```

These commands operate only after the documented disposable guest and licensed utilities are installed. Retain the raw records, exact environment and cleanup result. Do not operate on the system's production SLM instance. The separate [six-case matrix](../validation/matrix/README.md) now records missing/cyclic prerequisites, module glob startup, delay ordering, an absent-path timeout and native local-entity acceptance. Its host include report deliberately remains incomplete. Coverage outside those recorded cases, including exits/blocks readiness, remains untested.

## 7. Build and review the native QNX message-passing example

The repository now includes C sources for sensor, controller and optional telemetry in [native/](../native). On the licensed Ubuntu build host, from this checkout:

```sh
source "$HOME/qnx800/qnxsdp-env.sh"
make -C native
```

The Makefile invokes `qcc -Vgcc_ntox86_64` and builds `native/build/bw-sensor`, `bw-controller` and `bw-telemetry`. The retained compiler manifest identifies GCC 12.2.0. The sensor serves request/reply messages through QNX native IPC; both clients request sensor data. Controller code has no telemetry dependency.

Review the real workload configuration with the existing host tool:

```sh
python3 -m bootweave compare native/configs/revised.xml native/configs/risky.xml --protect controller
python3 -m bootweave compare native/configs/risky.xml native/configs/revised.xml --protect controller
```

Expected host policy statuses are 1 and 0 respectively. The extra session prerequisite in the risky file is the intentional regression. Both files retain the required sensor relationship.

The [four final native recordings](../validation/evidence/native-demo/README.md) ran these services on QNX. In the automatic case, the recorder sent SIGKILL only to the identified telemetry PID. The risky configuration replaced telemetry **and** controller; the revised configuration replaced telemetry while the controller retained its PID and independent process-instance ID and produced additional successful sensor IPC samples. The sensor instance stayed the same. Separate plain-manual-restart cases used fresh dedicated SLM daemons and showed the same configuration contrast. Cleanup was verified for all four records.

## 8. Associate an imported recording with its configuration

```sh
python3 -m bootweave evidence native/configs/revised.xml native/evidence/revised-automatic-evidence.json
```

Expected: `status` is `matched`, exit status 0, and `origin_authenticated` is false. Now deliberately select the wrong configuration:

```sh
python3 -m bootweave evidence native/configs/risky.xml native/evidence/revised-automatic-evidence.json
```

Expected: `mismatch`, exit status 1. This command checks the recording envelope and its configuration hash. It does not rerun QNX, authenticate provenance, or assert that the observed operation validates every static relationship.

In **Configuration review**, choose the native revised example, then select the corresponding revised automatic recording under **Imported recording**. You can also import `native/evidence/revised-automatic-evidence.json`. Check the active XML, inspect the operation/environment and before/after instances, and keep the origin notice visible. The export becomes a review bundle containing the static report, raw recording and check result. Replacing the active XML clears the old check; checking a different XML produces a mismatch. In **Change review**, export retains both revisions and the selected policy.

The raw [native application bundles](../validation/evidence/native-demo/README.md) contain more than the convenience import files: source snapshots, compiler/build output, deployed hashes, command audits and host heartbeat JSONL. Those records corroborate observed process identity and successful IPC samples. They do not establish uninterrupted availability or real-time performance, and hash consistency is not cryptographic origin attestation.

## 9. Repeat the native application experiment

Follow [native/README.md](../native/README.md) for the exact prepared-host topology, guest utilities, source deployment and build provenance. The current recorder expects `~/bootweave-native-demo/native`, a verified guest SSH host key, and an independent host UDP receiver. On that licensed Ubuntu lab host, after its preparation step, use a new output directory for each recording:

```sh
python3 ~/bootweave-native-demo/native/record.py --configuration risky --operation automatic-failure --output ~/bootweave-native-demo/evidence/risky-automatic-tutorial
python3 ~/bootweave-native-demo/native/record.py --configuration revised --operation automatic-failure --output ~/bootweave-native-demo/evidence/revised-automatic-tutorial
python3 ~/bootweave-native-demo/native/record.py --configuration risky --operation manual-restart --output ~/bootweave-native-demo/evidence/risky-manual-tutorial
python3 ~/bootweave-native-demo/native/record.py --configuration revised --operation manual-restart --output ~/bootweave-native-demo/evidence/revised-manual-tutorial
```

The automatic mode kills only the independently identified authored telemetry process. The manual mode issues plain `restart telemetry`. Neither uses inner `-s`. Do not combine their results as though they were one operation. Retain unexpected results too; inspect `completed`, `matches_authored_expectation`, raw observations and cleanup separately. The recorder refuses existing demo processes/endpoint and confines cleanup to its owned experiment.

## Completion check

You should have an explained prerequisite path, an intentionally failing policy, a passing correction, source-bound reports and a clear account of what the native record does and does not establish.

The three-service workload has recorded target execution. The case remains an authored software-counter demonstration on one QNX/SLM build, not a robot, hardware sensor or certification test. The earlier inner-`-s` discrepancy remains unresolved. Extending the result to other utility versions or readiness modes requires new evidence.
