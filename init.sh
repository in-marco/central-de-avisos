#!/usr/bin/env bash
set -euo pipefail

REQUIRED_FILES=(
  "AGENTS.md"
  "PROGRESS.md"
  "feature_list.json"
  "CONTEXT.md"
  "docs/build-brief.md"
  "docs/domain-model.md"
  "docs/risks-and-open-questions.md"
)

echo "Repository: $(pwd)"
echo "Harness status: pre-bootstrap"

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

echo "Harness files: OK"
echo "Application stack is not initialized yet."
echo "Next step: read PROGRESS.md, choose the first ready feature from feature_list.json and implement it."
echo
echo "Expected future commands after bootstrap:"
echo "  npm install"
echo "  npm run lint"
echo "  npm run typecheck"
echo "  npm test"
echo "  npm run dev"
echo
echo "This pre-bootstrap check exits successfully by design."
