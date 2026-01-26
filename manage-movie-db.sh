#!/bin/bash

# Script per avviare backend e frontend

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

start() {
  echo "[movie-db] Avvio backend..."
  cd "$DIR/backend" && npm run dev &
  BACKEND_PID=$!
  echo $BACKEND_PID > "$DIR/backend.pid"
  echo "[movie-db] Avvio frontend..."
  cd "$DIR/frontend" && npm start &
  NPM_PID=$!
  # Attendi che il vero processo React sia avviato
  sleep 3
  FRONTEND_PID=$(pgrep -P $NPM_PID node | head -n1)
  if [ -z "$FRONTEND_PID" ]; then
    # fallback: prendi il processo node più recente avviato da npm
    FRONTEND_PID=$(ps --sort=-start_time -eo pid,ppid,cmd | grep "react-scripts start" | grep -v grep | awk '{print $1}' | head -n1)
  fi
  echo $FRONTEND_PID > "$DIR/frontend.pid"
  echo "[movie-db] Backend PID: $BACKEND_PID, Frontend PID: $FRONTEND_PID (npm: $NPM_PID)"
}

stop() {
  if [ -f "$DIR/backend.pid" ]; then
    kill $(cat "$DIR/backend.pid") && rm "$DIR/backend.pid"
    echo "[movie-db] Backend fermato."
  fi
  if [ -f "$DIR/frontend.pid" ]; then
    kill $(cat "$DIR/frontend.pid") && rm "$DIR/frontend.pid"
    echo "[movie-db] Frontend fermato."
  fi
}

case "$1" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    sleep 1
    start
    ;;
  *)
    echo "Uso: $0 {start|stop|restart}"
    exit 1
    ;;
esac
