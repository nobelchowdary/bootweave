#!/usr/bin/env bash
# Run on the Ubuntu SDK host. Artifacts stay in this lab's working directory.
set -euo pipefail
native_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
lab_dir=$(dirname -- "$native_dir")
command -v qcc >/dev/null || {
    printf 'Source your licensed QNX SDP environment before running this script.\n' >&2
    exit 1
}
revision=${1:-}
if [[ -z $revision ]]; then
    revision=$(git -C "$lab_dir" rev-parse HEAD)
fi
[[ $revision =~ ^[0-9a-f]{40}$ ]] || {
    printf 'Pass the 40-character base repository revision.\n' >&2
    exit 1
}
qcc -V > "$lab_dir/compiler-version.txt" 2>&1
make -C "$native_dir" clean all 2>&1 | tee "$lab_dir/build-log.txt"
python3 - "$lab_dir" "$revision" <<'PY'
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
files = sorted(path for path in (root / "native").rglob("*")
               if path.is_file() and not {"build", "__pycache__"}.intersection(path.parts)
               and "evidence" not in path.relative_to(root / "native").parts
               and path.name != "source-manifest.json")
manifest = {
    "base_repository_revision": sys.argv[2],
    "provenance_note": "The base revision identifies the surrounding checkout. Exact authored source bytes are identified by this manifest and the per-run source snapshot; do not infer every source file was committed in that revision.",
    "files": [{"name": path.relative_to(root).as_posix(),
               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in files],
}
(root / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
PY
printf 'Built three QNX binaries and recorded exact source hashes. No target has been started.\n'
