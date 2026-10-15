#!/usr/bin/env bash
# Short demo. Uses a real LLM if a key is set in .env, otherwise the offline replay.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d node_modules ] || npm install
npm run build --silent

if grep -qsE '^(GEMINI|OPENAI|GROQ)_API_KEY=.+' .env; then
  MODE=()
  echo ">> Using real LLM providers from .env"
else
  MODE=(--mock)
  echo ">> No API key in .env, using the offline mock replay"
fi

echo; echo "=== 1) Dry run: plan and decide, change nothing ==="
node dist/cli.js "${MODE[@]}" --dry-run

echo; echo "=== 2) Live run, production changes denied by policy (no human present) ==="
node dist/cli.js "${MODE[@]}" --approve deny

echo; echo "=== Outbox (simulated side effects) ==="
ls -1 .agent/outbox
