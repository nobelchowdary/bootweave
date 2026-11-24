#!/usr/bin/env python3
"""Capture isolated SLM matrix observations on the already configured lab host.

Run on Ubuntu, not in QNX. This never controls the system or native-demo SLM.
The lab directory supplies the existing verified guest host key; the dedicated
SSH identity remains outside source/evidence. All experiment deadlines are bounded.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import time

ENDPOINT = "/dev/bootweave-matrix-slm"
REMOTE = "/data/bootweave-matrix"
RESERVED = {901, 902, 903}


def require_success(response, allowed_codes=(0,)):
    """A failed transport is unknown evidence, never an empty process set."""
    if (response.get("transport_timeout") or response.get("transport_error")
            or response.get("exit_code") not in allowed_codes):
        raise RuntimeError(f"Guest command did not complete successfully: {response.get('command', '<unknown>')}")
    return response.get("stdout", "")


def pidin_rows(text):
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines or not re.fullmatch(r"\s*pid\s+Arguments\s*", lines[0]):
        raise RuntimeError("Missing expected pidin Arguments header; process liveness is unknown")
    if any(not re.fullmatch(r"\s*\d+\s+\S+.*", line) for line in lines[1:]):
        raise RuntimeError("Unexpected pidin row; process liveness is unknown")
    return lines[1:]


def owned_processes(text):
    result = {}
    for line in pidin_rows(text):
        match = re.fullmatch(r"\s*(\d+)\s+(?:\S*/)?sleep\s+(901|902|903)\s*", line)
        if match:
            result[int(match[1])] = int(match[2])
    return result


def process_query(response):
    return owned_processes(require_success(response))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lab", type=Path, default=Path.home() / "bootweave-qnx-target")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    args.output.mkdir(parents=True, exist_ok=False)
    ssh = ["ssh", "-p", "2222", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", f"UserKnownHostsFile={args.lab / 'guest-known-hosts'}", "-i",
           str(Path.home() / ".ssh/bootweave-qnx-lab"), "root@127.0.0.1"]

    def execute(command, timeout=12):
        started = time.monotonic()
        try:
            p = subprocess.run(ssh + [command], capture_output=True, text=True, timeout=timeout)
            return {"command": command, "elapsed_seconds": round(time.monotonic()-started, 3),
                    "exit_code": p.returncode, "stdout": p.stdout, "stderr": p.stderr}
        except subprocess.TimeoutExpired as error:
            return {"command": command, "elapsed_seconds": round(time.monotonic()-started, 3),
                    "transport_timeout": True,
                    "stdout": (error.stdout or b"").decode(errors="replace") if isinstance(error.stdout, bytes) else error.stdout or "",
                    "stderr": (error.stderr or b"").decode(errors="replace") if isinstance(error.stderr, bytes) else error.stderr or ""}
        except OSError as error:
            return {"command": command, "elapsed_seconds": round(time.monotonic()-started, 3),
                    "transport_error": str(error), "stdout": "", "stderr": ""}

    initial_endpoint = execute(f"test ! -e {ENDPOINT}")
    initial_processes = execute("pidin -p sleep ar")
    require_success(initial_endpoint)
    if process_query(initial_processes):
        raise RuntimeError("Matrix endpoint or reserved fixture processes already present; leaving them untouched")
    captured_at = datetime.now(timezone.utc)
    environment = {"recorded_date": captured_at.date().isoformat(), "recorded_at_utc": captured_at.isoformat(),
                   "scope": "Isolated SLM matrix; no automatic failure recovery or timing guarantee",
                   "host_python": subprocess.check_output(["python3", "--version"], text=True).strip(),
                   "recorder_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                   "guest_uname": require_success(execute("uname -a")).strip(), "utilities": [],
                   "preflight": [initial_endpoint, initial_processes]}
    environment["fixture_sha256"] = {f.name: hashlib.sha256(f.read_bytes()).hexdigest()
                                     for f in sorted((root / "fixtures").glob("*.xml"))}
    builds = require_success(execute("use -i /data/bootweave-lab/slm /data/bootweave-lab/slmctl"))
    for block in builds.strip().split("\n\n"):
        environment["utilities"].append({line.split("=", 1)[0]: line.split("=", 1)[1]
                                         for line in block.splitlines()
                                         if "=" in line and line.split("=", 1)[0] in {"QNX_BUILDID", "NAME", "DATE", "TAGID", "PACKAGE"}})
    (args.output / "environment.json").write_text(json.dumps(environment, indent=2)+"\n")
    made = execute(f"mkdir -p {REMOTE}")
    require_success(made)
    for fixture in sorted((root / "fixtures").glob("*.xml")):
        response = subprocess.run(ssh + [f"cat > {REMOTE}/{fixture.name}"], input=fixture.read_bytes(), capture_output=True, timeout=12)
        if response.returncode:
            raise RuntimeError("Fixture transfer failed")
        exact = subprocess.check_output(ssh + [f"cat {REMOTE}/{fixture.name}"], timeout=12)
        if exact != fixture.read_bytes():
            raise RuntimeError("Transferred fixture bytes differ")

    cases = [("missing", "none", 0.0), ("cycle", "none", 0.0),
             ("module", "bw-matrix-group", 0.8), ("delay", "none", 3.2),
             ("pathname", "none", 3.0), ("external", "bw-matrix-included", 0.8)]
    all_completed = True
    for name, startup, observe_seconds in cases:
        fixture = root / "fixtures" / f"{name}.xml"
        record = {"case": name, "fixture": f"fixtures/{fixture.name}",
                  "fixture_sha256": hashlib.sha256(fixture.read_bytes()).hexdigest(),
                  "recorder_sha256": environment["recorder_sha256"], "endpoint": ENDPOINT,
                  "completed": False, "audit": [], "snapshots": []}
        audit = record["audit"]
        daemon = None
        owned = {}
        launch_attempted = False

        def run(command, allowed_codes=(0,)):
            response = execute(command)
            audit.append(response)
            require_success(response, allowed_codes)
            return response

        def find_daemon():
            response = run("pidin -p slm ar")
            matches = []
            for line in pidin_rows(response["stdout"]):
                if f"-n {ENDPOINT} " in line:
                    matches.append(int(line.split()[0]))
            if len(matches) > 1:
                raise RuntimeError("Multiple daemons match the dedicated matrix endpoint")
            return matches[0] if matches else None

        def snapshot(start):
            control = run(shlex.join(["/data/bootweave-lab/slmctl", "-n", ENDPOINT, "listall -v"]))
            os_table = run("pidin -p sleep ar")
            processes = process_query(os_table)
            owned.update(processes)
            record["snapshots"].append({"seconds_since_control": round(time.monotonic()-start, 3),
                                        "slm": control, "os_processes": os_table,
                                        "owned_sleep_processes": processes})

        try:
            run(f"test ! -e {ENDPOINT}")
            if process_query(run("pidin -p sleep ar")):
                raise RuntimeError("Reserved fixture process present before this case")
            total_wait = 4000 if name == "delay" else 1200
            launch = f"/data/bootweave-lab/slm -n {ENDPOINT} -s {startup} -t 50 -T {total_wait} -VVV {REMOTE}/{fixture.name} > {REMOTE}/{name}-console.txt 2>&1 < /dev/null &"
            launch_attempted = True
            run(launch)
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                daemon = find_daemon()
                if daemon:
                    break
                time.sleep(.15)
            record["daemon_identified"] = daemon is not None
            if daemon is None and name not in {"missing", "cycle"}:
                raise RuntimeError("Expected dedicated SLM daemon was not identified")
            start = time.monotonic()
            if daemon:
                if startup == "none":
                    run(shlex.join(["/data/bootweave-lab/slmctl", "-n", ENDPOINT, "start all"]))
                while True:
                    snapshot(start)
                    if time.monotonic()-start >= observe_seconds:
                        break
                    time.sleep(.15)
            record["console"] = run(f"cat {REMOTE}/{name}-console.txt")
            if name == "missing" and "Unknown dependency 'bw-matrix-absent'" not in record["console"]["stdout"]:
                raise RuntimeError("Missing-prerequisite rejection was not present in native console evidence")
            if name == "cycle" and "Circular dependency detected" not in record["console"]["stdout"]:
                raise RuntimeError("Cycle rejection was not present in native console evidence")
            record["capture_completed"] = True
        except Exception as error:
            record["error"] = str(error)
        finally:
            record["cleanup_verified"] = False
            try:
                if not launch_attempted:
                    raise RuntimeError("Preflight failed; no case ownership established, so existing processes were left untouched")
                if daemon is None:
                    daemon = find_daemon()
                # Kill only the actual dedicated daemon; never a shell background PID.
                if daemon:
                    run(f"kill -9 {daemon}", allowed_codes=(0, 1))
                processes = process_query(run("pidin -p sleep ar"))
                # Membership is established by reserved arguments with an empty
                # reserved set required before this experiment starts.
                owned.update(processes)
                for pid in sorted(processes):
                    if pid in owned:
                        run(f"kill {pid}", allowed_codes=(0, 1))
                time.sleep(.2)
                remaining = process_query(run("pidin -p sleep ar"))
                for pid in sorted(remaining):
                    run(f"kill -9 {pid}", allowed_codes=(0, 1))
                if remaining:
                    time.sleep(.2)
                    remaining = process_query(run("pidin -p sleep ar"))
                run(f"test ! -e {ENDPOINT}")
                record["cleanup_verified"] = not remaining
                record["remaining_owned_processes"] = remaining
            except Exception as error:
                record["cleanup_error"] = str(error)
                record["remaining_owned_processes"] = None
            record["completed"] = bool(record.get("capture_completed")) and record["cleanup_verified"]
            all_completed = all_completed and record["completed"]
            (args.output / f"{name}-observation.json").write_text(json.dumps(record, indent=2)+"\n")
            print(json.dumps({"case": name, "completed": record["completed"],
                              "daemon_identified": record.get("daemon_identified"),
                              "snapshots": len(record["snapshots"]), "cleanup_verified": record["cleanup_verified"]}), flush=True)
            if not record["cleanup_verified"]:
                raise RuntimeError("Matrix cleanup failed; stopping before another case")
    return 0 if all_completed else 1


if __name__ == "__main__":
    raise SystemExit(main())
