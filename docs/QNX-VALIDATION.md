# QNX 8.0 validation procedure

**Status: NOT YET VALIDATED ON A QNX TARGET.** No commands or expected results below constitute captured evidence. Host tests establish analyzer behavior; they do not establish SLM behavior. The shipped robot XML names illustrative executables and must not be presented as a running robot.

## Environment gate

Use a licensed, disposable QNX 8.0 QEMU image or supported development board with SLM, `slmctl`, `slogger2`, and the [target `sleep` utility](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/sleep-target.html) available. Record the exact OS/image package, target architecture, installed SLM version/package, host Python version, and BootWeave revision. This host MVP has no compiled target agent, so a target-agent compiler version is not applicable. Record image-generation tools if used.

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

Record dependent PIDs before/after each restart. The inner `-s` means stateless dependencies are ignored while stopping. A plain manual restart is a separate operation from automatic failure recovery; never use its result as proof of the latter. Capture SLM console/log output too: control commands need not print their actions in `slmctl` output. Stop the dedicated instance through its own console after cleanup.

## Validation matrix

All rows are **TODO**. Recreate the dedicated instance for each edited fixture and retain exact XML, analyzer JSON, launch options, console output, and observations.

| Case | Procedure and acceptance evidence |
| --- | --- |
| Explicit edges | Check `needs`/`usedby` against BootWeave edges. Inspect PID changes for manual restart with and without inner `-s`. |
| Omitted state | Compare `bw-unspecified` with explicit clients. Record behavior for this exact version only; retain BootWeave's uncertainty until a documented/versioned default is established. |
| Automatic recovery | In a separate fixture, change prerequisite duration to `5` and its repair to `restart`; retain clients at `600`. Observe natural prerequisite exit and subsequent PIDs/logs. Repeat with explicit states. Distinguish this from the manual command test. |
| Readiness | Add a prerequisite delay of `3000`; observe dependent startup ordering, without claiming precise elapsed-time guarantees. Test a pathname wait against a deliberately absent scratch path and retain timeout logs. |
| Invalid graph | Introduce a missing prerequisite, then a two-component cycle. Record native acceptance/error behavior and compare diagnostics; do not invent expected error text. |
| Supported SLM, unsupported host syntax | Test a small local external-entity fixture separately. BootWeave must reject it as incomplete even if native SLM accepts it; this is a documented host limitation. |
| Module | Add a module with `member` value `bw-*`; compare native member startup with host expansion. |

Keep `critical` launch as a static warning case; this protocol does not request a system-crash experiment. This fixture tests relationships, not a robotics workload or an availability guarantee.

## Evidence gate

Publish a small sanitized evidence directory only after execution: environment manifest, exact fixtures and hashes, host JSON, raw target transcripts, observed-versus-predicted table, and unresolved discrepancies. Mark every unrun row **NOT RUN**. QEMU observations establish behavior on that virtual target, not physical real-time performance. Reconcile discrepancies before claiming QNX compatibility; the video should distinguish the working host product from the separate target-validation footage.
