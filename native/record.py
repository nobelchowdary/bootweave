#!/usr/bin/env python3
"""Run one isolated native experiment from the Ubuntu host, retaining evidence.

The licensed target must already be running. No VM or system service is stopped.
An automatic-failure trial sends SIGKILL only to the identified demo telemetry
process. A manual trial issues a separate, plain SLM restart command.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import platform
from pathlib import Path
import re
import shlex
import socket
import subprocess
import tarfile
import threading
import time


COMPONENTS = ("sensor", "controller", "telemetry")
REMOTE = "/data/bootweave-demo"
ENDPOINT = "/dev/bootweave-demo-slm"
SLM = "/data/bootweave-lab/slm"
SLMCTL = "/data/bootweave-lab/slmctl"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--configuration", choices=("risky", "revised"), required=True)
    parser.add_argument("--operation", choices=("automatic-failure", "manual-restart"), default="automatic-failure")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    output = args.output.resolve()
    allowed = Path.home() / "bootweave-native-demo"
    if not output.is_relative_to(allowed):
        parser.error(f"output must be within {allowed}")
    output.mkdir(parents=True, exist_ok=False)
    ssh = ["ssh", "-p", "2222", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", f"UserKnownHostsFile={Path.home() / 'bootweave-qnx-target/guest-known-hosts'}",
           "-i", str(Path.home() / ".ssh/bootweave-qnx-lab"), "root@127.0.0.1"]
    fixture = source / "configs" / f"{args.configuration}.xml"
    result = {
        "schema": "bootweave.native-evidence.v1",
        "configuration": {"name": fixture.name, "sha256": digest(fixture.read_bytes())},
        "environment": {"host_platform": platform.platform(), "host_python": platform.python_version()},
        "experiment": {"operation": args.operation, "subject": "telemetry", "trigger": "NOT RUN"},
        "observations": [], "artifacts": [], "completed": False,
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
        "limitations": [
            "Authored software-counter workload; no robot, actuator, medical device or hardware sensor.",
            "Observed PID/instance behavior and sampled UDP messages do not prove continuous availability or hard real-time performance.",
            "This recording is not cryptographically authenticated; artifact hashes establish internal consistency only.",
            "Manual restart and automatic failure are separate experiments; inner -s is not used here.",
        ],
    }
    audit = []
    packets = []
    lock = threading.Lock()
    stop_receiver = threading.Event()
    daemon = None
    started = False
    receiver = None
    receiver_socket = None
    raw_stream = None
    collected = False

    def write_json(name, value):
        (output / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def run(command, *, check=True, binary=False, input_bytes=None):
        try:
            response = subprocess.run(ssh + [command], input=input_bytes, capture_output=True, timeout=20)
        except (subprocess.TimeoutExpired, OSError) as error:
            audit.append({"command": command, "transport_error": str(error)})
            raise
        item = {"host_monotonic_ns": time.monotonic_ns(), "command": command,
                "exit_code": response.returncode, "stderr": response.stderr.decode("utf-8", errors="replace")}
        if binary:
            item["stdout_sha256"] = digest(response.stdout)
            item["stdout_bytes"] = len(response.stdout)
        else:
            item["stdout"] = response.stdout.decode("utf-8", errors="replace")
        audit.append(item)
        if check and response.returncode:
            raise RuntimeError(f"Guest command failed: {command}: {item['stderr']}")
        return response.stdout if binary else response.stdout.decode("utf-8", errors="replace")

    def control(command):
        return run(shlex.join([SLMCTL, "-n", ENDPOINT, command]))

    def process_map():
        found = {component: [] for component in COMPONENTS}
        for component in COMPONENTS:
            for line in run(f"pidin -p bw-{component} ar").splitlines():
                match = re.fullmatch(r"\s*(\d+)\s+(?:\S*/)?bw-" + component + r"\s+10\.0\.2\.2\s+19010\s*", line)
                if match:
                    found[component].append(int(match[1]))
        return found

    def find_daemon():
        matches = []
        for line in run("pidin -p slm ar").splitlines():
            if f"-n {ENDPOINT} " in line:
                matches.append(int(line.split()[0]))
        if len(matches) > 1:
            raise RuntimeError("Multiple daemons match the dedicated endpoint")
        return matches[0] if matches else None

    def snapshot():
        text = control("listall -v")
        rows = {}
        for line in text.splitlines():
            match = re.fullmatch(r"(sensor|controller|telemetry)\s+\S+\s+(ACTIVE|INACTIVE)\s+(\w+)\s*(\d+)?\s*", line)
            if match:
                component, active, state, pid = match.groups()
                rows[component] = {"active": active, "state": state, "pid": int(pid) if pid else None}
        return {"slm": rows, "independent_processes": process_map()}

    def settled(replaced_telemetry=None):
        previous = None
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            current = snapshot()
            rows, processes = current["slm"], current["independent_processes"]
            ready = set(rows) == set(COMPONENTS)
            ready = ready and all(row["active"] == "ACTIVE" and row["state"] == "INITIALIZED"
                                  and processes[name] == [row["pid"]] for name, row in rows.items())
            if replaced_telemetry is not None:
                ready = ready and rows.get("telemetry", {}).get("pid") != replaced_telemetry
            if ready and current == previous:
                return current
            previous = current
            time.sleep(.25)
        raise RuntimeError("Three services did not reach stable, independently matching process snapshots")

    def capture():
        while not stop_receiver.is_set():
            try:
                data, _address = receiver_socket.recvfrom(8192)
            except socket.timeout:
                continue
            item = {"host_monotonic_ns": time.monotonic_ns(), "raw_utf8": data.decode("utf-8", errors="replace")}
            try:
                payload = json.loads(data)
                if not isinstance(payload, dict) or payload.get("protocol") != "bootweave.heartbeat.v1" or payload.get("component") not in COMPONENTS:
                    raise ValueError("Unexpected heartbeat protocol/component")
                if not isinstance(payload.get("instance"), str) or not payload["instance"]:
                    raise ValueError("Missing process identity")
                for key in ("pid", "sequence", "target_monotonic_ns", "ipc_successes", "ipc_errors"):
                    if type(payload.get(key)) is not int or payload[key] < 0:
                        raise ValueError(f"Invalid {key}")
                item["payload"] = payload
                with lock:
                    packets.append(item)
            except (ValueError, UnicodeError) as error:
                item["error"] = str(error)
            raw_stream.write(json.dumps(item) + "\n")
            raw_stream.flush()

    def window_frames(component, start, end, pid):
        with lock:
            return [item for item in packets if start <= item["host_monotonic_ns"] <= end
                    and item["payload"]["component"] == component and item["payload"]["pid"] == pid]

    try:
        result["environment"]["qnx_uname"] = run("uname -a").strip()
        builds = run(f"use -i {SLM} {SLMCTL}")
        (output / "qnx-utilities-build.txt").write_text(builds)
        for name in ("slm", "slmctl"):
            match = re.search(r"QNX_BUILDID=\(GNU\)(\w+)\nNAME=" + name + r"\n", builds)
            if not match:
                raise RuntimeError(f"Missing native {name} build identity")
            result["environment"][f"{name}_build_id"] = match[1]
            utility_path = SLM if name == "slm" else SLMCTL
            result["environment"][f"{name}_sha256"] = digest(run(f"cat {utility_path}", binary=True))
        if run(f"test ! -e {ENDPOINT}; echo $?", check=False).strip() != "0":
            raise RuntimeError("Dedicated demo endpoint already exists")
        if any(process_map().values()):
            raise RuntimeError("Demo-named processes already exist; refusing to adopt or kill them")
        for component in COMPONENTS:
            binary = source / "build" / f"bw-{component}"
            remote = f"{REMOTE}/bw-{component}"
            run(f"mkdir -p {REMOTE} && cat > {remote}", input_bytes=binary.read_bytes())
            run(f"chmod 755 {remote}")
            actual_hash = digest(run(f"cat {remote}", binary=True))
            if actual_hash != digest(binary.read_bytes()):
                raise RuntimeError("Deployed binary differs from the compiled host artifact")
            result["environment"][f"{component}_binary_sha256"] = actual_hash
        native_builds = []
        readelf = Path.home() / "qnx800/host/linux/x86_64/usr/bin/ntox86_64-readelf"
        for component in COMPONENTS:
            notes = subprocess.check_output([str(readelf), "-n", str(source / "build" / f"bw-{component}")], text=True, timeout=20)
            match = re.search(r"Build ID:\s*([a-f0-9]+)", notes)
            if not match:
                raise RuntimeError(f"Missing authored ELF build ID for {component}")
            result["environment"][f"{component}_build_id"] = match[1]
            native_builds.append(f"COMPONENT={component}\n{notes}")
        (output / "authored-binary-builds.txt").write_text("\n".join(native_builds))
        remote_fixture = f"{REMOTE}/{fixture.name}"
        run(f"cat > {remote_fixture}", input_bytes=fixture.read_bytes())
        if run(f"cat {remote_fixture}", binary=True) != fixture.read_bytes():
            raise RuntimeError("Target configuration differs from the recorded source")
        (output / fixture.name).write_bytes(fixture.read_bytes())
        for filename in ("source-manifest.json", "build-log.txt", "compiler-version.txt"):
            path = source.parent / filename
            if not path.is_file():
                raise RuntimeError(f"Required provenance artifact missing: {filename}")
            (output / filename).write_bytes(path.read_bytes())
        manifest = json.loads((source.parent / "source-manifest.json").read_text())
        result["environment"]["base_repository_revision"] = manifest["base_repository_revision"]
        result["environment"]["native_source_manifest_sha256"] = digest((output / "source-manifest.json").read_bytes())
        for entry in manifest["files"]:
            path = source.parent / entry["name"]
            if not path.is_file() or digest(path.read_bytes()) != entry["sha256"]:
                raise RuntimeError(f"Source manifest mismatch: {entry['name']}")
        with tarfile.open(output / "authored-source.tar", "w") as snapshot_tar:
            for entry in manifest["files"]:
                snapshot_tar.add(source.parent / entry["name"], arcname=entry["name"], recursive=False)
        receiver_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        receiver_socket.bind(("127.0.0.1", 19010))
        receiver_socket.settimeout(.25)
        raw_stream = (output / "host-heartbeats.jsonl").open("w", encoding="utf-8")
        receiver = threading.Thread(target=capture, daemon=True)
        receiver.start()
        started = True
        run(f"{SLM} -n {ENDPOINT} -s none -VVV {remote_fixture} > {REMOTE}/slm-console.txt 2>&1 < /dev/null &")
        deadline = time.monotonic() + 10
        while daemon is None and time.monotonic() < deadline:
            daemon = find_daemon()
            if daemon is None:
                time.sleep(.2)
        if daemon is None:
            raise RuntimeError("Could not identify the dedicated demo SLM daemon")
        control("start all")
        before = settled()
        before_start = time.monotonic_ns()
        time.sleep(3)
        result["snapshots"] = {"before": before}
        old_telemetry = before["slm"]["telemetry"]["pid"]
        if process_map()["telemetry"] != [old_telemetry]:
            raise RuntimeError("Telemetry identity changed before the owned-process operation")
        trigger_ns = time.monotonic_ns()
        result["experiment"]["trigger_host_monotonic_ns"] = trigger_ns
        if args.operation == "automatic-failure":
            trigger = f"kill -9 {old_telemetry}"
            result["experiment"]["trigger"] = "SIGKILL to the independently identified demo telemetry PID; SLM automatic recovery observed separately from manual control"
            run(trigger)
        else:
            trigger = "restart telemetry"
            result["experiment"]["trigger"] = trigger
            control(trigger)
        result["experiment"]["exact_guest_operation"] = trigger
        after = settled(old_telemetry)
        after_start = time.monotonic_ns()
        time.sleep(4)
        after_end = time.monotonic_ns()
        final = snapshot()
        if final != after:
            raise RuntimeError("Processes changed during the post-operation observation window")
        result["snapshots"]["after"] = after
        result["snapshots"]["after_observation_window"] = final
        result["heartbeat_windows"] = {"before_start": before_start, "trigger": trigger_ns,
                                       "after_start": after_start, "after_end": after_end}
        ipc = []
        for component in COMPONENTS:
            before_pid = before["slm"][component]["pid"]
            after_pid = after["slm"][component]["pid"]
            old_frames = window_frames(component, before_start, trigger_ns, before_pid)
            new_frames = window_frames(component, after_start, after_end, after_pid)
            if len(old_frames) < 3 or len(new_frames) < 3:
                raise RuntimeError(f"Insufficient independent host heartbeats for {component}")
            old_instances = {frame["payload"]["instance"] for frame in old_frames}
            new_instances = {frame["payload"]["instance"] for frame in new_frames}
            if len(old_instances) != 1 or len(new_instances) != 1:
                raise RuntimeError("PID-to-instance mapping is ambiguous")
            old_instance, new_instance = next(iter(old_instances)), next(iter(new_instances))
            restarted = old_instance != new_instance
            if restarted != (before_pid != after_pid):
                raise RuntimeError("Independent instance and process identities disagree")
            result["observations"].append({
                "component": component, "before_instance": old_instance, "after_instance": new_instance,
                "before_pid": before_pid, "after_pid": after_pid, "restarted": restarted,
                "old_pid_still_present": before_pid in after["independent_processes"][component],
                "new_pid_present": after_pid in after["independent_processes"][component],
                "heartbeats_before": len(old_frames), "heartbeats_after": len(new_frames),
            })
            for window, frames in (("before", old_frames), ("after", new_frames)):
                first, last = frames[0]["payload"], frames[-1]["payload"]
                if last["ipc_successes"] <= first["ipc_successes"]:
                    raise RuntimeError(f"No increasing successful IPC samples for {component} {window}")
                ipc.append({"component": component, "window": window,
                            "first_sequence": first["sequence"], "last_sequence": last["sequence"],
                            "first_ipc_successes": first["ipc_successes"], "last_ipc_successes": last["ipc_successes"],
                            "first_ipc_errors": first["ipc_errors"], "last_ipc_errors": last["ipc_errors"],
                            "first_sample": first["sample"], "last_sample": last["sample"]})
        result["ipc_observations"] = ipc
        observed = {entry["component"]: entry["restarted"] for entry in result["observations"]}
        result["authored_expectation"] = {"sensor": False, "telemetry": True, "controller": args.configuration == "risky"}
        result["matches_authored_expectation"] = observed == result["authored_expectation"]
        collected = True
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    finally:
        if started:
            try:
                (output / "slm-console.txt").write_text(run(f"cat {REMOTE}/slm-console.txt"))
            except Exception as error:
                result["console_error"] = str(error)
            try:
                if daemon is None:
                    daemon = find_daemon()
                if daemon is not None:
                    run(f"kill -9 {daemon}")
                # Only the uniquely named authored binaries admitted by the
                # clean-start check belong to this experiment.
                processes = process_map()
                for pid in sorted({pid for values in processes.values() for pid in values}):
                    run(f"kill {pid}", check=False)
                time.sleep(.4)
                for pid in sorted({pid for values in process_map().values() for pid in values}):
                    run(f"kill -9 {pid}", check=False)
                time.sleep(.2)
                remaining = process_map()
                endpoint_absent = run(f"test ! -e {ENDPOINT}; echo $?", check=False).strip() == "0"
                sensor_name_absent = run("test ! -e /dev/name/local/bootweave-demo-sensor; echo $?", check=False).strip() == "0"
                result["cleanup"] = {"remaining_processes": remaining,
                                     "endpoint_absent": endpoint_absent, "sensor_name_absent": sensor_name_absent,
                                     "verified": not any(remaining.values()) and endpoint_absent and sensor_name_absent}
            except Exception as error:
                result["cleanup"] = {"verified": False, "error": str(error)}
        else:
            result["cleanup"] = {"verified": True, "note": "No demo process was started by this invocation"}
        stop_receiver.set()
        if receiver is not None:
            receiver.join(timeout=2)
        if receiver_socket is not None:
            receiver_socket.close()
        if raw_stream is not None:
            raw_stream.close()
        write_json("guest-command-audit.json", audit)
        result["completed"] = collected and result["cleanup"]["verified"]
        result["artifacts"] = [{"name": path.name, "sha256": digest(path.read_bytes())}
                               for path in sorted(output.iterdir()) if path.is_file() and path.name != "observation.json"]
        write_json("observation.json", result)
        print(json.dumps({key: result.get(key) for key in ("configuration", "experiment", "observations", "matches_authored_expectation", "completed", "cleanup", "error")}, indent=2))
    return 0 if result["completed"] and result.get("matches_authored_expectation") else 1


if __name__ == "__main__":
    raise SystemExit(main())
