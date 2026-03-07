#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/var/www/radio"
NGINX_CONF="/etc/nginx/sites-available/radio"
WEB_BUILD_DIR="$DEPLOY_DIR/apps/web/dist"
PANEL_PASS="${PANEL_PASS:-admin123}"  # override con variable de entorno

# ─── 1. System packages ───────────────────────────────────────────────────────
apt-get update -y
apt-get install -y curl git nginx apache2-utils

# ─── 2. Node.js 22 ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# ─── 3. Clone / update repo ───────────────────────────────────────────────────
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  git clone https://github.com/Juanes7222/Radio.git "$DEPLOY_DIR"
else
  git -C "$DEPLOY_DIR" pull --ff-only
fi
cd "$DEPLOY_DIR"

# ─── 4. Dependencies & build ──────────────────────────────────────────────────
npm install --ignore-scripts
npm run build --workspace=backend
npm run build --workspace=@radio/web

# ─── 5. Panel password ────────────────────────────────────────────────────────
htpasswd -cb /etc/nginx/.htpasswd admin "$PANEL_PASS"

# ─── 6. Nginx ─────────────────────────────────────────────────────────────────
cp "$DEPLOY_DIR/scripts/radio.nginx.conf" "$NGINX_CONF"
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/radio
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ─── 7. Systemd service ───────────────────────────────────────────────────────
mkdir -p /var/log/pm2
cp "$DEPLOY_DIR/scripts/radio-backend.service" /etc/systemd/system/radio-backend.service
systemctl daemon-reload
systemctl enable radio-backend
systemctl start radio-backend

# ─── 8. Firewall ──────────────────────────────────────────────────────────────
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 8080/tcp
ufw --force enable

echo ""
echo "Setup complete."
echo "  Web   : http://$(hostname -I | awk '{print $1}')"
echo "  Panel : http://panel.lavozverdad.com  (user: admin / pass: $PANEL_PASS)"
echo ""
echo "Next steps:"
echo "  1. Fill /var/www/radio/backend/.env with real credentials"
echo "     AZURACAST_URL=http://127.0.0.1:8080   (direct, avoids panel auth)"
echo "  2. Run: certbot --nginx -d lavozverdad.com -d www.lavozverdad.com -d panel.lavozverdad.com"