#!/bin/bash
# Wrapper: run a command with this spike's venv + rootless shared libs on
# LD_LIBRARY_PATH (see fetch_system_libs.sh for what these are and why).
# Usage: ./run_with_libs.sh python3 path_a_searchable_pdf.py ...
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LD_LIBRARY_PATH="$HERE/.rootless-libs/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PATH="$HERE/.venv/bin:$PATH"
exec "$@"
