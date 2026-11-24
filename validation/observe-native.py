#!/usr/bin/env python3
"""Record an isolated SLM experiment through an existing local QNX SSH tunnel.

Run on the Ubuntu lab host after building/booting its licensed image. This
records observations; it does not classify them as successful model validation.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lab", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--operation", choices=("plain", "stateless-option"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    lab = args.lab.resolve()
    ssh = ["ssh", "-p", "2222", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", f"UserKnownHostsFile={lab / 'guest-known-hosts'}", "-i",
           str(Path.home() / ".ssh/bootweave-qnx-lab"), "root@127.0.0.1"]
    audit = []
    result = {"operation": args.operation, "fixture_sha256": hashlib.sha256(args.fixture.read_bytes()).hexdigest(),
              "recorder_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "snapshots": {}, "audit": audit, "completed": False}
    endpoint = "/dev/bootweave-slm-observe"
    daemon = None
    started = False
    owned = set()

    def run(command, check=True):
        try:
            response = subprocess.run(ssh + [command], capture_output=True, text=True, timeout=20)
        except (subprocess.TimeoutExpired, OSError) as error:
            audit.append({"command": command, "transport_error": str(error)})
            if check:
                raise
            return ""
        audit.append({"command": command, "exit_code": response.returncode,
                      "stdout": response.stdout, "stderr": response.stderr})
        if check and response.returncode:
            raise RuntimeError(f"Guest command failed: {command}: {response.stderr}")
        return response.stdout

    def control(command):
        return run(shlex.join(["/data/bootweave-lab/slmctl", "-n", endpoint, command]))

    def find_daemon():
        for line in run("pidin -p slm ar", check=False).splitlines():
            if f"-n {endpoint} " in line:
                return int(line.split()[0])
        return None

    def snapshot():
        text = control("listall -v")
        rows = {}
        for line in text.splitlines():
            match = re.fullmatch(r"(bw-\S+)\s+\S+\s+(ACTIVE|INACTIVE)\s+(\w+)\s*(\d+)?\s*", line)
            if match:
                name, active, state, pid = match.groups()
                rows[name] = {"active": active, "state": state, "pid": int(pid) if pid else None}
                if pid:
                    owned.add(int(pid))
        processes = {}
        for line in run("pidin -p sleep ar").splitlines():
            match = re.fullmatch(r"\s*(\d+)\s+(?:\S*/)?sleep\s+(600|601|602|603)\s*", line)
            if match:
                processes[int(match[1])] = int(match[2])
        return {"slm": rows, "os_sleep_processes": processes}

    def settled(previous_prerequisite=None):
        previous = None
        deadline = time.monotonic() + 20
        expected = {"bw-prerequisite": 600, "bw-session": 601,
                    "bw-stateless": 602, "bw-unspecified": 603}
        while time.monotonic() < deadline:
            current = snapshot()
            rows = current["slm"]
            ready = set(rows) == set(expected) and len(current["os_sleep_processes"]) == 4
            ready = ready and all(r["active"] == "ACTIVE" and r["state"] == "INITIALIZED"
                                  and current["os_sleep_processes"].get(r["pid"]) == expected[n]
                                  for n, r in rows.items())
            if previous_prerequisite is not None:
                ready = ready and rows.get("bw-prerequisite", {}).get("pid") != previous_prerequisite
            if ready and current == previous:
                return current
            previous = current
            time.sleep(.25)
        raise RuntimeError("Fixture did not reach two matching SLM/OS snapshots within 20 seconds")

    try:
        result["qnx_uname"] = run("uname -a").strip()
        result["utility_builds"] = run("use -i /data/bootweave-lab/slm /data/bootweave-lab/slmctl")
        if run(f"test -e {endpoint}; echo $?", check=False).strip() != "1":
            raise RuntimeError("Dedicated observation endpoint already exists")
        if run("pidin -p sleep ar").splitlines()[1:]:
            raise RuntimeError("Fresh experiment requires no existing sleep processes")
        remote_fixture = "/data/bootweave-lab/lifecycle-distinct.xml"
        subprocess.run(ssh + [f"cat > {remote_fixture}"], input=args.fixture.read_bytes(), check=True, timeout=20)
        actual = subprocess.check_output(ssh + [f"cat {remote_fixture}"], timeout=20)
        if actual != args.fixture.read_bytes():
            raise RuntimeError("Guest fixture differs from host fixture")
        started = True
        run(f"/data/bootweave-lab/slm -n {endpoint} -s none -VVV {remote_fixture} "
            "> /data/bootweave-lab/observe-console.txt 2>&1 < /dev/null &")
        deadline = time.monotonic() + 10
        while daemon is None and time.monotonic() < deadline:
            daemon = find_daemon()
            if daemon is None:
                time.sleep(.25)
        if daemon is None:
            raise RuntimeError("Cannot identify the dedicated SLM daemon")
        control("start all")
        result["snapshots"]["before"] = settled()
        command = "restart bw-prerequisite" if args.operation == "plain" else "restart -s bw-prerequisite"
        result["exact_operation"] = command
        control(command)
        result["snapshots"]["after"] = settled(result["snapshots"]["before"]["slm"]["bw-prerequisite"]["pid"])
        before = result["snapshots"]["before"]["slm"]
        after = result["snapshots"]["after"]
        result["pid_observations"] = {
            n: {"old_pid": r["pid"], "new_pid": after["slm"][n]["pid"],
                "old_pid_still_present": r["pid"] in after["os_sleep_processes"],
                "new_pid_present": after["slm"][n]["pid"] in after["os_sleep_processes"]}
            for n, r in before.items()}
        result["completed"] = True
    finally:
        result["daemon_console"] = run("cat /data/bootweave-lab/observe-console.txt", check=False)
        # The experiment owns this endpoint and the exact PIDs collected above.
        # Stop the daemon first so cleanup cannot trigger its recovery actions.
        if started and daemon is None:
            daemon = find_daemon()
        if daemon:
            run(f"kill -9 {daemon}", check=False)
        remaining = set()
        for line in run("pidin -p sleep ar", check=False).splitlines():
            match = re.fullmatch(r"\s*(\d+)\s+(?:\S*/)?sleep\s+(600|601|602|603)\s*", line)
            if match and int(match[1]) in owned:
                remaining.add(int(match[1]))
        for pid in sorted(remaining):
            run(f"kill {pid}", check=False)
        time.sleep(.25)
        result["cleanup_processes"] = run("pidin -p sleep ar", check=False)
        result["cleanup_endpoint_absent"] = run(f"test ! -e {endpoint}; echo $?", check=False).strip() == "0"
        result["cleanup_verified"] = result["cleanup_endpoint_absent"] and bool(
            re.fullmatch(r"\s*pid\s+Arguments\s*", result["cleanup_processes"]))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({k: result.get(k) for k in ("operation", "completed", "pid_observations",
                                                    "cleanup_processes", "cleanup_endpoint_absent")}, indent=2))


if __name__ == "__main__":
    main()
