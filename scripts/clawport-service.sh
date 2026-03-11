#!/bin/bash
set -euo pipefail

ROOT="/Users/zyh/Code/clawport-ui"
NPM_BIN="/Users/zyh/.nvm/versions/node/v24.13.1/bin/npm"
PLIST="$HOME/Library/LaunchAgents/com.zyh.clawport-ui.plist"
LABEL="com.zyh.clawport-ui"
LOG_DIR="$HOME/Library/Logs/clawport-ui"

mkdir -p "$LOG_DIR"

is_loaded() {
  launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1
}

build() {
  cd "$ROOT"
  rm -rf .next
  "$NPM_BIN" run build
}

start() {
  if is_loaded; then
    launchctl kickstart -k "gui/$UID/$LABEL"
  else
    launchctl bootstrap "gui/$UID" "$PLIST"
  fi
}

stop() {
  if is_loaded; then
    launchctl bootout "gui/$UID/$LABEL"
  fi
}

status() {
  if is_loaded; then
    echo "service=loaded"
  else
    echo "service=not-loaded"
  fi

  if curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null; then
    echo "http=ok"
  else
    echo "http=down"
  fi
}

logs() {
  tail -n "${2:-80}" "$LOG_DIR/stdout.log" "$LOG_DIR/stderr.log"
}

case "${1:-}" in
  build)
    build
    ;;
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    build
    start
    ;;
  status)
    status
    ;;
  logs)
    logs "$@"
    ;;
  *)
    echo "Usage: $0 {build|start|stop|restart|status|logs [lines]}" >&2
    exit 1
    ;;
esac
