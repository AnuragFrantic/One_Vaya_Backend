#!/usr/bin/env bash
# One-time server setup, safe to run again. Needs root.
#   sudo bash bootstrap-server.sh "<CI public key>"
# Expects deploy/nginx/ next to this script.
set -euo pipefail

CI_PUBLIC_KEY="$1"
NODE_MAJOR=24 # same major version as node-version in .github/workflows/deploy.yml
DOMAIN=api.onevaya.ae
DEPLOY_USER=deploy
APP_DIR=/var/www/onevaya-api
HERE="$(cd "$(dirname "$0")" && pwd)"
cd / # the deploy user can't read the calling user's home, which breaks commands run as deploy

echo "── Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx xz-utils

echo "── Node $NODE_MAJOR"
if [[ "$(node -v 2>/dev/null || true)" != v$NODE_MAJOR.* ]]; then
  tmp="$(mktemp -d)"
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file="$(grep -oE "node-v[0-9.]+-linux-x64\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c -)
  # --no-same-owner: the tarball's numeric owner would otherwise match the deploy user, handing it /usr/local/bin.
  tar -xJf "$tmp/$file" -C /usr/local --strip-components=1 --no-same-owner --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md
  rm -rf "$tmp"
fi
command -v pm2 >/dev/null || npm install -g --no-audit --no-fund pm2

echo "── Deploy user"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
# `restrict` turns off forwarding and terminals: this key only runs commands and copies files.
echo "restrict $CI_PUBLIC_KEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

echo "── App folders"
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/releases" "$APP_DIR/incoming" "$APP_DIR/shared" "$APP_DIR/shared/uploads"

echo "── PM2 on boot"
pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" >/dev/null
sudo -u "$DEPLOY_USER" -H pm2 install pm2-logrotate >/dev/null

echo "── Nginx"
install -m 644 "$HERE/nginx/00-default.conf" /etc/nginx/sites-available/00-default.conf
ln -sfn /etc/nginx/sites-available/00-default.conf /etc/nginx/sites-enabled/00-default.conf
rm -f /etc/nginx/sites-enabled/default
# Certbot adds its HTTPS block to this file, so it is only written before the certificate exists.
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  install -m 644 "$HERE/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN.conf"
  ln -sfn "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
fi
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "── HTTPS certificate"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect --keep-until-expiring
systemctl enable --now certbot.timer

echo "✅ Server ready"
