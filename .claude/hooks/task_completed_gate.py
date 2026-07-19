#!/usr/bin/env python3
"""Conservative TaskCompleted gate for Claude Code.

Task subjects may start with [CODE], [UI], [DOCS], [RESEARCH], or [REVIEW].
Only code/UI tasks trigger the repository test suite. The script never deploys,
commits, pushes, or reads sensitive files.
"""
import json, os, subprocess, sys
from pathlib import Path

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)
subject = str(payload.get("task_subject", ""))
if not (subject.startswith("[CODE]") or subject.startswith("[UI]")):
    sys.exit(0)
root = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())).resolve()
app = root / "architect"
commands = [
    ["node", "--check", "app.js"],
    ["node", "build.mjs", "--combined", "dist/app.html"],
    ["npm", "test"],
]
for cmd in commands:
    result = subprocess.run(cmd, cwd=app, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode != 0:
        print(f"Task cannot close: {' '.join(cmd)} failed.\n{result.stdout[-8000:]}", file=sys.stderr)
        sys.exit(2)
sys.exit(0)
