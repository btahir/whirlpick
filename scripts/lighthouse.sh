#!/usr/bin/env bash
# Lighthouse 13 (mobile preset) against the static build on 127.0.0.1:4324, installed Chrome.
# Run through research/heavy.sh (`pnpm lighthouse`). Starts the static server if none is running.
# Reports: test-results/lighthouse/<page>.report.{json,html}. Fails below the ACCEPTANCE M4 bars.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=test-results/lighthouse
mkdir -p "$OUT"
BASE=${LH_BASE:-http://127.0.0.1:4324}
CHROME=${CHROME_PATH:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
started=""
if ! curl -sf -o /dev/null "$BASE/"; then
  node apps/web/scripts/serve-static.mjs apps/web/dist 4324 >/dev/null 2>&1 &
  started=$!
  trap '[ -n "$started" ] && kill "$started" 2>/dev/null || true' EXIT
  for _ in $(seq 1 50); do curl -sf -o /dev/null "$BASE/" && break; sleep 0.2; done
fi
LH=apps/web/node_modules/.bin/lighthouse
for path in / /verify/ /random-team-generator/ /is-the-wheel-rigged/; do
  name=$(echo "$path" | tr -c 'a-z0-9\n' '_' | sed 's/^_*//;s/_*$//'); name=${name:-home}
  CHROME_PATH="$CHROME" "$LH" "$BASE$path" --quiet --output=json --output=html --output-path="$OUT/$name" \
    --chrome-flags="--headless=new --no-first-run --disable-extensions" --form-factor=mobile --screenEmulation.mobile \
    --only-categories=performance,accessibility,best-practices,seo >/dev/null
done
node -e '
const fs = require("fs");
const dir = process.argv[1];
let fail = false;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".report.json"))) {
  const r = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"));
  const c = r.categories, a = r.audits;
  const s = { perf: Math.round(c.performance.score * 100), a11y: Math.round(c.accessibility.score * 100), bp: Math.round(c["best-practices"].score * 100), seo: Math.round(c.seo.score * 100), cls: a["cumulative-layout-shift"].numericValue, tbt: Math.round(a["total-blocking-time"].numericValue), lcp: Math.round(a["largest-contentful-paint"].numericValue) };
  const bad = s.perf < 90 || s.a11y < 95 || s.bp < 95 || s.seo < 95 || s.cls > 0.02 || s.tbt > 150;
  if (bad) fail = true;
  console.log(`${bad ? "FAIL" : "ok  "} ${f.replace(".report.json", "").padEnd(22)} perf ${s.perf} a11y ${s.a11y} bp ${s.bp} seo ${s.seo} cls ${s.cls.toFixed(3)} tbt ${s.tbt}ms lcp ${s.lcp}ms`);
}
process.exit(fail ? 1 : 0);
' "$OUT"
