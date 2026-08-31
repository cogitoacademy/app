#!/usr/bin/env bash
# Lint-error baseline gate — errors fail CI unless documented in the baseline.
#
# Context: the repo pin was oxlint 1.78/0.63; #143 bumped to 1.80/0.65 whose
# stricter React rules flag 62 pre-existing apps/web findings. The user
# descoped web lint fixes (2026-08-31, CI-SANITY F13) so those specific
# findings live in .github/lint/baseline.txt and are ALLOWED — everything
# else fails. Rule: the baseline may only SHRINK without ceremony; growing
# it requires a plan-doc entry (AGENTS.md rule 11).
#
# Usage: .github/lint/check-baseline.sh   (CI lint job runs this)
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BASELINE="$DIR/baseline.txt"
RAW="$(mktemp)"
sort -u "$BASELINE" > "$BASELINE.sorted"
trap 'rm -f "$RAW" "$BASELINE.sorted"' EXIT

# CI pins oxlint via package.json (1.80.0 since #143) — plain `bunx oxlint`
# uses it. GitHub-annotation format: one line per error/warning; errors are
# `::error file=<path>,line=N,endLine=…,col=…,endColumn=…,title=<rule>::<msg>`.
bunx oxlint@1.80.0 --format=github 2>/dev/null > "$RAW.github" || true
grep '^::error ' "$RAW.github" \
  | sed -E 's/^::error file=([^,]+),line=([0-9]+),endLine=[0-9]+,col=([0-9]+),endColumn=[0-9]+,title=([^:]+)::.*$/\1:\2:\3:\4/' \
  | sort -u > "$RAW"

if [ ! -s "$RAW" ]; then
  echo "No lint errors found."
  exit 0
fi

NEW=$(comm -13 "$BASELINE.sorted" "$RAW" || true)
FIXED=$(comm -23 "$BASELINE.sorted" "$RAW" || true)

if [ -n "$NEW" ]; then
  echo "::error title=New lint errors::$(echo "$NEW" | grep -c . ) error(s) not in .github/lint/baseline.txt — CI-SANITY F13 requires fixing them or documenting the descope:"
  echo "$NEW"
  exit 1
fi

if [ -n "$FIXED" ]; then
  echo "::notice title=Lint baseline shrank::$(echo "$FIXED" | grep -c .) baseline entr(ies) no longer present — please delete them from .github/lint/baseline.txt in this PR (baseline may only shrink)."
fi

echo "All $(grep -c . < "$RAW") errors are documented baseline findings (CI-SANITY F13)."