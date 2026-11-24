# Initial QNX 8.0 target observations

Recorded November 24, 2026. **Partial validation, with an unresolved option-description discrepancy.** These are observations from a licensed QNX guest, not an illustrative robot demonstration or a recovery benchmark.

## Environment and artifacts

- Ubuntu 24.04 x86-64 on an Intel EC2 instance with nested KVM; QEMU 8.2.2.
- QNX kernel: `8.0.0 2026/10/30-09:10:05EDT`, x86-64; guest allocation: 2 vCPUs and 2 GiB RAM.
- SLM and slmctl: package `com.qnx.qnx800.target.base.slm/0.0.1.00135T202311191043L`. Kernel and utility build dates differ; neither is substituted for the other.
- [Environment, binary hashes and tested application revision](environment.json).
- [Exact fixture](../../fixtures/lifecycle-distinct.xml): four sleep processes, distinguished by arguments 600–603. No process naturally exits during these short observations.
- [Host static report](host-distinct-report.json), [plain restart recording](plain-observation.json), and [`-s` restart recording](stateless-option-observation.json).
- [Recorder source](../../observe-native.py) and [host/image setup](../../../docs/AWS-QNX-HOST.md). Each final recording includes the recorder's SHA-256.

Only authored source, configuration, metadata, and text observations are published. SDK files, guest images, proprietary executables, licenses, private keys, account identifiers and cloud addresses are excluded. Hashes bind artifacts; they do not independently authenticate the origin of a recording.

## Observed results

Each operation used a fresh dedicated SLM daemon at `/dev/bootweave-slm-observe`, with no pre-existing sleep processes. The recorder required two matching snapshots of both SLM and the independent `pidin` process table before and after each operation. After a restart, the prerequisite's PID also had to change. It checked component identity using distinct process arguments, and recorded whether both old and new PIDs remained present. Cleanup stopped only the owned daemon and fixture PIDs; the final recordings verify no sleep processes or experiment endpoint remained.

| Component | Plain `restart bw-prerequisite` | `restart -s bw-prerequisite` |
| --- | --- | --- |
| Prerequisite | Old PID absent; new PID present | Old PID absent; new PID present |
| Explicit `state="session"` client | Old PID absent; new PID present | Old PID absent; new PID present |
| Explicit `state="stateless"` client | Same PID remained present | Old PID absent; new PID present |
| Client with omitted state | Old PID absent; new PID present | Old PID absent; new PID present |

The plain-restart observation is consistent with the fixture's explicit session-coupling graph. The omitted-state client behaved like the session client in this build and experiment. BootWeave continues to mark omitted state as uncertain rather than inferring a default for every QNX version or operation.

The current [slmctl reference](https://www.qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slmctl.html) describes inner `-s` as ignoring stateless dependencies during stopping. The observed stateless-client replacement with `-s` differs from our expectation from that description. This remains **unresolved**: the recordings establish behavior for the identified utility build and fixture, not a general conclusion about the implementation or documentation. BootWeave does not simulate arbitrary manual control operations.

## Limits and remaining work

The guest booted successfully more than once; the final isolated observations were made after a fresh VM boot. Earlier preliminary attempts and incomplete cleanup were kept in private lab notes and superseded by these recordings with distinct process arguments, bounded settling and verified cleanup. Repeat each case across additional fresh boots and the intended release package before generalizing.

Automatic failure recovery, transitive/mixed dependency graphs, readiness modes, invalid native configurations, external entities and module expansion remain **NOT RUN**. No independent external heartbeat receiver or robot workload exists yet. `repair` is `none` in this fixture. These manual restart tests do not prove automatic recovery, availability or real-time performance. Full [QNX validation](../../../docs/QNX-VALIDATION.md), the native three-service demo and public video remain outstanding.
