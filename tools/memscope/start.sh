#!/usr/bin/env sh
# MemScope on Linux. The first run creates .venv and installs the requirements.
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt || { rm -rf .venv; exit 1; }
fi
exec .venv/bin/python -m memscope "$@"
