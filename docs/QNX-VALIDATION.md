# QNX 8.0 validation procedure

**Status: SCOPED NATIVE OBSERVATIONS CAPTURED; GENERAL COMPATIBILITY IS NOT ESTABLISHED.** The [native application recordings](../validation/evidence/native-demo/README.md) cover four separate automatic-failure/manual-restart cases with actual QNX IPC and independent PID/UDP observations. The [six-case matrix](../validation/matrix/README.md) covers selected graph, module, readiness and include cases. The [earlier observations](../validation/evidence/2026-11-24/README.md) retain an unresolved difference from the documented `-s` option description. Every result is scoped to its identified build, configuration and operation. The procedure below also documents remaining coverage; it does not claim every proposed test ran. The older robot XML names illustrative executables and must not be presented as a running robot.

## Environment gate

Use a licensed, disposable QNX 8.0 QEMU image or supported development board with SLM, `slmctl`, `slogger2`, and the [target `sleep` utility](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/sleep-target.html) available. Record the exact OS/image package, target architecture, installed SLM version/package, host Python version, and BootWeave revision. The host product needs no compiler. Its separate authored C workload was cross-compiled with QNX `qcc -Vgcc_ntox86_64` / GCC 12.2.0; its manifests retain exact source and ELF identities. Record image-generation tools if used.

QNX's [official macOS setup](https://qnx.software/en/blog/2026/how-to-use-macos-to-develop-for-qnx) uses QNX Software Center, a deployed QNX license, SDP 8.0 Linux Host Tools, and an Ubuntu Docker build environment. The official [build script](https://gitlab.com/qnx/projects/docker-mac/-/blob/main/docker-mac/docker-build-qnx-image.sh) selects `linux/amd64`, including on Apple Silicon. This creates a cross-compilation environment; it does not itself provide a running target. BootWeave's Python host application needs neither SDP nor Docker. Keep proprietary SDK files and licenses outside the public repository.

## Isolated fixture

Prepare this proposed fixture as `/tmp/bootweave-validation.xml` on the target and retain an identical host copy. Confirm `sleep` is in SLM's executable search path. Ensure `slogger2` is already running. Use a separate `/dev/bootweave-slm` endpoint, never the system SLM endpoint. Do not adopt existing processes or alter system startup files.

```xml
<SLM:system>
  <SLM:component name="bw-prerequisite">
    <SLM:command>sleep</SLM:command><SLM:args>600</SLM:args>
    <SLM:repair>none</SLM:repair>
  </SLM:component>
  <SLM:component name="bw-session">
    <SLM:depend state="session">bw-prerequisite</SLM:depend>
    <SLM:command>sleep</SLM:command><SLM:args>600</SLM:args>
    <SLM:repair>none</SLM:repair>
  </SLM:component>
  <SLM:component name="bw-stateless">
    <SLM:depend state="stateless">bw-prerequisite</SLM:depend>
    <SLM:command>sleep</SLM:command><SLM:args>600</SLM:args>
    <SLM:repair>none</SLM:repair>
  </SLM:component>
  <SLM:component name="bw-unspecified">
    <SLM:depend>bw-prerequisite</SLM:depend>
    <SLM:command>sleep</SLM:command><SLM:args>600</SLM:args>
    <SLM:repair>none</SLM:repair>
  </SLM:component>
</SLM:system>
```

Launch a dedicated instance in one target console. These options are documented in the [SLM reference](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slm.html):

```sh
slm -n /dev/bootweave-slm -s none -V /tmp/bootweave-validation.xml
```

In a second target console, as UID 0, execute the documented [slmctl](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slmctl.html) commands individually. Save each command and its output; queries may need repeating until states settle.

```sh
slmctl -n /dev/bootweave-slm "start all"
slmctl -n /dev/bootweave-slm "listall -v"
slmctl -n /dev/bootweave-slm "needs bw-session"
slmctl -n /dev/bootweave-slm "usedby bw-prerequisite"
slmctl -n /dev/bootweave-slm "restart -s bw-prerequisite"
slmctl -n /dev/bootweave-slm "listall -v"
slmctl -n /dev/bootweave-slm "restart bw-prerequisite"
slmctl -n /dev/bootweave-slm "listall -v"
slmctl -n /dev/bootweave-slm "stop all"
```

Record dependent PIDs before/after each restart, corroborate each PID against the OS process table, and wait for settled states. The current reference describes inner `-s` as ignoring stateless dependencies while stopping; the recorded SLM build behaved differently from that expectation. Preserve both operations and their version-specific observations rather than assuming either behavior. A plain manual restart is a separate operation from automatic failure recovery; never use its result as proof of the latter. Capture SLM console/log output too: control commands need not print their actions in `slmctl` output. Stop the dedicated instance and verify that its fixture processes and endpoint are gone. SLM daemonizes; a shell background PID is not sufficient to identify its daemon.

## Validation matrix

Recreate the dedicated instance for each edited fixture and retain exact XML, analyzer JSON, launch options, console output, and observations. The linked artifacts distinguish performed cases from remaining variants.

| Case | Procedure and acceptance evidence |
| --- | --- |
| Explicit edges — SCOPED CAPTURES | Both the sleep fixture and three-service application were exercised with independent process checks. The `-s` description discrepancy remains unresolved. Broader graphs and repeated fresh-boot validation remain open. |
| Omitted state — PARTIAL | The observed client restarted with the explicit-session client on the recorded build. This does not establish a portable default; BootWeave retains uncertainty. |
| Automatic recovery — SCOPED CAPTURES | The native workload's telemetry was terminated with SIGKILL under `repair=restart`, separately from manual restart. Risky/revised configurations produced the recorded controller replacement/retention contrast. Natural exit, every repair mode and broader state combinations remain untested. |
| Readiness — SCOPED CAPTURES | The matrix records a `2000` ms delay ordering transition and an absent-path timeout with `repair=none`. These are not precise latency guarantees. Pathname success and exits/blocks readiness remain untested. |
| Invalid graph — SCOPED CAPTURES | Native SLM rejected the supplied missing-prerequisite and two-component-cycle fixtures; corresponding host reports are included. Other malformed native configurations remain untested. |
| Supported SLM, unsupported host syntax — SCOPED CAPTURE | Native SLM accepted one local external-entity fixture; BootWeave rejected it as incomplete. This deliberately preserves the standalone-file parser's limitation. Recursive or remote includes were not tested. |
| Module — SCOPED CAPTURE | Starting the matrix's wildcard module launched both matched components, consistent with the included host expansion. Other wildcard and module cases remain untested. |

Keep `critical` launch as a static warning case; this protocol does not request a system-crash experiment. This fixture tests relationships, not a robotics workload or an availability guarantee.

## Evidence gate

Publish a small sanitized evidence directory only after execution: environment manifest, exact fixtures and hashes, host JSON, raw target transcripts, observed-versus-predicted table, and unresolved discrepancies. Mark every unrun row **NOT RUN**. QEMU observations establish behavior on that virtual target, not physical real-time performance. Reconcile discrepancies before claiming QNX compatibility; the video should distinguish the working host product from the separate target-validation footage.
