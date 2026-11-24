# Native SLM coupling lab

Three small authored C processes make BootWeave's configuration review testable on QNX 8.0:

- `sensor` registers a local name with `name_attach`, receives requests using `MsgReceive`, and replies using `MsgReply`. A software sample counter and per-connection request sequence are maintained. There is no hardware sensor.
- `controller` needs the sensor's native IPC service. It uses `name_open`, `MsgSend`, `TimerTimeout`, and reconnect handling, and emits observed sample/counter heartbeats. Its code never requires telemetry.
- `telemetry` is an optional sensor client. It also emits independent process identity and sample observations.

[risky.xml](configs/risky.xml) adds an unnecessary explicit `state="session"` dependency from controller to telemetry. [revised.xml](configs/revised.xml) removes that edge while retaining required sensor IPC. The lab tests whether terminating the optional process also replaces the controller under the recorded SLM configuration. It is an illustrative software workload, not robot software, a safety mechanism, or a timing benchmark.

## Build and run

Use a licensed QNX SDP 8.0 Linux x86_64 SDK host and an already booted QNX x86_64 guest. The current recorder expects this isolated topology:

- Host working tree: `~/bootweave-native-demo/native`.
- SDK: `~/qnx800`; the recorder uses its `ntox86_64-readelf` to record authored ELF build IDs.
- Guest SSH: host loopback port 2222, the operator's existing `~/.ssh/bootweave-qnx-lab` identity, and verified host keys at `~/bootweave-qnx-target/guest-known-hosts`.
- Guest utilities: licensed `slm` and `slmctl` already present at `/data/bootweave-lab/`. They are used in place and are not redistributed.
- Guest demo files: `/data/bootweave-demo/`; dedicated SLM endpoint `/dev/bootweave-demo-slm`.
- Independent UDP receiver: Ubuntu host loopback port 19010. These configs use QEMU user networking's host address `10.0.2.2`. This address is specific to that networking topology.

Place the `native/` source directory in the host working tree. Supply the base BootWeave repository revision if that directory was copied without Git history:

```sh
source ~/qnx800/qnxsdp-env.sh
bash ~/bootweave-native-demo/native/prepare.sh BASE_REPOSITORY_REVISION
python3 ~/bootweave-native-demo/native/record.py --configuration risky --operation automatic-failure --output ~/bootweave-native-demo/evidence/risky-automatic
python3 ~/bootweave-native-demo/native/record.py --configuration revised --operation automatic-failure --output ~/bootweave-native-demo/evidence/revised-automatic
```

Replace `BASE_REPOSITORY_REVISION` with the actual 40-character revision. Each output directory must be new. `prepare.sh` uses `qcc -Vgcc_ntox86_64`, C11, `-Wall -Wextra -Werror`, `-lsocket`, and an ELF build ID. The source manifest plus source snapshot identify exact bytes even when newly authored files have not yet been committed. No license data, SDK libraries, utilities, or compiled proprietary files belong in the public repository.

The recorder first refuses an existing demo endpoint or demo-named processes. It verifies deployed binary/configuration hashes, launches its own SLM, and waits for matching stable SLM and independent `pidin` snapshots. Heartbeats contain a per-process random instance ID, PID, sequence, actual IPC success/error counts, and software samples. A host receiver records the raw datagrams and its own timestamps.

An `automatic-failure` experiment sends SIGKILL only to the independently identified demo telemetry PID and observes SLM's response. It does **not** issue a manual restart. To record that distinct operation, use a fresh output directory and `--operation manual-restart`; that mode issues plain `restart telemetry`. Neither mode uses inner `-s`, whose behavior is separately under investigation for the installed SLM build.

Cleanup runs on success and failure. The recorder stops only its dedicated daemon and the uniquely identified authored processes, then verifies no demo processes, sensor name, or SLM endpoint remain. It leaves the QNX VM, logger, SSH server, and other SLM instances running. If transport fails, cleanup cannot be asserted; inspect the retained error and finish cleanup before another trial.

## Reading the evidence

`observation.json` follows `bootweave.native-evidence.v1` and includes configuration/source/binary hashes, utility and authored ELF build IDs, exact operation, before/after observations, IPC counters, raw-artifact hashes, and cleanup status. `completed` reports whether capture and cleanup finished; `matches_authored_expectation` separately compares the measured instance changes with this experiment's intended contrast.

The host sample windows establish that particular process instances and successful IPC samples were observed. They do not prove uninterrupted availability, bounded scheduling latency, functional safety, or hardware performance. UDP loss can hide observations. Source/artifact hashes establish internal consistency, not trusted origin or a cryptographic attestation of QNX execution. Retain unexpected and incomplete results and label them accordingly.

The retained November 24 source archives contain the exact helper version used for those runs. The current `prepare.sh` additionally excludes `native/evidence/` convenience envelopes from future source manifests; this packaging change does not alter the C workload or recorder used by the retained experiments.
