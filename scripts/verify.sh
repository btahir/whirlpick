#!/usr/bin/env bash
# `pnpm verify`: every check in order (PLAN §1.4); stops at the first failure.
# Heavy steps (web build, Playwright, Lighthouse) go through scripts/heavy.sh via their scripts.
set -euo pipefail
cd "$(dirname "$0")/.."
start=$(date +%s)
step() { printf '\n==> %s\n' "$*"; }

step typecheck;        pnpm typecheck
step lint;             pnpm lint
step check:pure;       pnpm check:pure
step licenses:check;   pnpm licenses:check --credits
step test;             pnpm test
step test:ref;         pnpm test:ref
step build:web;        pnpm build:web
step check:budget;     pnpm check:budget
step seo:check;        pnpm seo:check

step "static server on 4324"
# Playwright reuses any server already on the port, which would test a different build.
if curl -fsS -o /dev/null --max-time 1 http://127.0.0.1:4324/ 2>/dev/null; then
  echo "Port 4324 is already in use; stop that server first so e2e tests this build." >&2
  exit 1
fi
node apps/web/scripts/serve-static.mjs apps/web/dist 4324 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -fsS -o /dev/null http://127.0.0.1:4324/ && break; sleep 0.2; done

step test:e2e;         PW_SKIP_BUILD=1 bash scripts/heavy.sh pnpm --filter @whirlpick/web exec playwright test --project=chrome --workers=2
step lighthouse;       pnpm lighthouse

kill "$server" 2>/dev/null || true
trap - EXIT
printf '\nverify passed in %ss\n' "$(( $(date +%s) - start ))"
