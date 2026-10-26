#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"

# Use an installed Node 24 when Finder starts with an older shell PATH.
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=24?0:1)' 2>/dev/null; then
  for apphub_node in "$HOME"/.nvm/versions/node/v24.*/bin/node; do
    if [ -x "$apphub_node" ]; then
      export PATH="$(dirname -- "$apphub_node"):$PATH"
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Installeer Node.js 24 via https://nodejs.org/en/download en start dit bestand opnieuw.'
  exit 1
fi
node scripts/setup-apphub.mjs "${1:-setup}"
