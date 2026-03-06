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
cat > "$NGINX_CONF" <<'NGINX'
server {
    listen 80;
    server_name lavozverdad.com www.lavozverdad.com;

    root /var/www/radio/apps/web/dist;
    index index.html;

    location /listen/la_voz_de_la_verdad/ {
        proxy_pass         http://127.0.0.1:8080/listen/la_voz_de_la_verdad/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_buffering    off;
        proxy_read_timeout 3600s;
    }

    location /azura-api/ {
        proxy_pass         http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }

    location /admin-api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}

server {
    listen 80;
    server_name panel.lavozverdad.com;

    client_max_body_size 512M;

    auth_basic "Acceso restringido";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX

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
echo "  1. Fill /var/www/radio/apps/backend/.env with real credentials"
echo "  2. Run: certbot --nginx -d lavozverdad.com -d www.lavozverdad.com -d panel.lavozverdad.com"