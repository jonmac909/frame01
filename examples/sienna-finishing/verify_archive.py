"""Check archived source identity and syntax without importing or executing it."""
import ast
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
files = manifest["files"]
if len(files) != 9 or len({row["archive"] for row in files}) != len(files):
    raise SystemExit("Expected nine distinct archived source files")
for row in files:
    target = (root / row["archive"]).resolve()
    if not target.is_relative_to(root) or not target.name.endswith(".py.txt"):
        raise SystemExit("Invalid archive path")
    raw = target.read_bytes()
    if len(raw) != row["bytes"] or hashlib.sha256(raw).hexdigest() != row["sha256"]:
        raise SystemExit(f"Archive changed: {row['archive']}")
    ast.parse(raw.decode("utf-8-sig"), filename=row["original"])
print(json.dumps({"sourceFilesVerified": len(files), "syntax": "passed", "executedHistoricalScripts": False}))
