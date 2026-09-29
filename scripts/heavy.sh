#!/usr/bin/env bash
# Runs a heavy command (production build, Playwright, Lighthouse).
# On the maintainer's machine it goes through the shared job limiter at ../research/heavy.sh;
# everywhere else (a fresh clone) it simply runs the command.
set -euo pipefail
limiter="$(cd "$(dirname "$0")/.." && pwd)/../research/heavy.sh"
if [ -x "$limiter" ]; then exec "$limiter" "$@"; fi
exec "$@"
