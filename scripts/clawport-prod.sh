#!/bin/bash
set -euo pipefail

ROOT="/Users/zyh/Code/clawport-ui"
NODE_BIN="/Users/zyh/.nvm/versions/node/v24.13.1/bin/node"
NPM_BIN="/Users/zyh/.nvm/versions/node/v24.13.1/bin/npm"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"

cd "$ROOT"

if [ ! -f ".next/BUILD_ID" ]; then
  "$NPM_BIN" run build
fi

exec "$NODE_BIN" node_modules/next/dist/bin/next start --hostname "$HOST" --port "$PORT"
