# Recorded native three-service experiment — November 24, 2026

These bundles record execution of the [authored C lab](../../../native/README.md) on QNX x86_64 under QEMU/KVM. They contain real target command output, independent host UDP observations, deployed-binary/configuration hashes, utility/ELF build IDs, compiler output, an exact authored-source snapshot, and verified cleanup. They are recordings, not a live target connection or cryptographic attestation.

| Recording | Operation | Sensor instance | Controller instance | Telemetry instance |
| --- | --- | --- | --- | --- |
| [Risky automatic](2026-11-24/risky-automatic-final/observation.json) | SIGKILL to the identified telemetry PID; automatic SLM recovery | Same | Replaced | Replaced |
| [Revised automatic](2026-11-24/revised-automatic-final/observation.json) | Same automatic-failure experiment in a fresh dedicated daemon | Same | Same | Replaced |
| [Risky manual](2026-11-24/risky-manual-final/observation.json) | Plain `restart telemetry` in a separate fresh daemon | Same | Replaced | Replaced |
| [Revised manual](2026-11-24/revised-manual-final/observation.json) | Plain `restart telemetry` in a separate fresh daemon | Same | Same | Replaced |

Every row completed recording and cleanup. Before/after instance IDs agreed with independently queried PID changes. Successful native sensor IPC counters increased in both observation windows for all three roles; the retained packets in those windows reported zero IPC errors. Controller host packet counts were 34 before and 40 after in these recorded windows. Packet counts describe this capture, not an availability or latency guarantee.

The risky configuration has an explicit session prerequisite from controller to optional telemetry. The revised configuration removes that prerequisite. Controller code calls the sensor through QNX native message passing and does not call telemetry. Samples are software counters, not physical sensor readings.

Each bundle's `observation.json` lists its artifacts and hashes. `source-manifest.json` identifies exact authored files; `authored-source.tar` retains those bytes. The base repository revision identifies the surrounding checkout and must not be mistaken for a claim that all then-new native files were already committed. No QNX SDK headers, libraries, utilities, target images, licenses, keys, or compiled binaries are distributed in these bundles.

All four artifact sets were rehashed locally. Source archive members were checked against the source manifest, and before/after heartbeat counts and process-instance IDs were independently recalculated from the raw JSONL. After the final run, a further target query found no authored demo processes, dedicated SLM endpoint, or sensor name. The VM, logger, and SSH service were left running.

These runs used QNX `8.0.0 2026/10/30-09:10:05EDT` and the exact SLM package/build recorded in each manifest. They occurred in one VM boot, with a fresh dedicated SLM daemon per recording. They do not establish other versions, other images, physical real-time performance, or complete SLM compatibility. Automatic-failure and manual-operation results are separate. No inner `-s` command is used here; the [earlier option discrepancy](../2026-11-24/README.md) remains a separate unresolved observation.
