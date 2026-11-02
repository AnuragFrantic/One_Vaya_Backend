#!/usr/bin/env bash
# Runs on the server as the `deploy` user, from inside a release that has just been unpacked.
# Installs it, switches `current` to it, restarts the API and rolls back if the health check fails.
set -euo pipefail

RELEASE="$1"
APP_DIR=/var/www/onevaya-api
RELEASE_DIR="$APP_DIR/releases/$RELEASE"
HEALTH_URL=http://127.0.0.1:9877/api/health
KEEP_RELEASES=5

healthy() {
  # The API only listens once MongoDB is connected, so a healthy answer covers the database too.
  for _ in $(seq 1 30); do
    curl -fsS -m 3 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

activate() {
  ln -sfn "$1" "$APP_DIR/current"
  pm2 startOrReload "$APP_DIR/current/ecosystem.config.js" --update-env
}

cd "$RELEASE_DIR"
ln -sfn "$APP_DIR/shared/.env" .env
npm ci --omit=dev --no-audit --no-fund

PREVIOUS="$(readlink "$APP_DIR/current" || true)"
activate "$RELEASE_DIR"

if ! healthy; then
  echo "❌ Release $RELEASE failed its health check. Last log lines:"
  pm2 logs onevaya-api --nostream --lines 30 || true
  if [ -n "$PREVIOUS" ]; then
    echo "↩️  Rolling back to $(basename "$PREVIOUS")"
    activate "$PREVIOUS"
    healthy && pm2 save --force
  else
    pm2 delete onevaya-api || true
    rm -f "$APP_DIR/current"
  fi
  cd "$APP_DIR"
  rm -rf "$RELEASE_DIR"
  exit 1
fi

pm2 save --force
echo "✅ Release $RELEASE is live"

# Failed releases remove themselves above, so the newest here is always the live one.
ls -1dt "$APP_DIR"/releases/* | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
