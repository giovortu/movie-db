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
  FRONTEND_PID=$!
  echo $FRONTEND_PID > "$DIR/frontend.pid"
  echo "[movie-db] Backend PID: $BACKEND_PID, Frontend PID: $FRONTEND_PID"
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
