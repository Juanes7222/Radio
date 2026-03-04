#!/usr/bin/env bash
# First-time VPS setup: installs dependencies, builds all apps, configures PM2 and nginx.
set -euo pipefail

DEPLOY_DIR="/var/www/radio"
NGINX_CONF="/etc/nginx/sites-available/radio"
WEB_BUILD_DIR="$DEPLOY_DIR/apps/web/dist"

# ─── 1. System packages ───────────────────────────────────────────────────────
echo ">>> Installing system packages..."
apt-get update -y
apt-get install -y curl git nginx

# ─── 2. Node.js 20 via NodeSource ─────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo ">>> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "Node: $(node -v) | npm: $(npm -v)"

# ─── 3. PM2 ───────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo ">>> Installing PM2..."
  npm install -g pm2
fi

# ─── 4. Clone / update repo ───────────────────────────────────────────────────
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  echo ">>> Cloning repository into $DEPLOY_DIR ..."
  git clone https://github.com/Juanes7222/Radio.git "$DEPLOY_DIR"
else
  echo ">>> Repository already exists, pulling latest..."
  git -C "$DEPLOY_DIR" pull --ff-only
fi

cd "$DEPLOY_DIR"

# ─── 5. Install npm dependencies ──────────────────────────────────────────────
echo ">>> Installing npm workspaces dependencies..."
npm ci --ignore-scripts

# ─── 6. Build backend ─────────────────────────────────────────────────────────
echo ">>> Building backend..."
npm run build --workspace=backend

# ─── 7. Build web app ─────────────────────────────────────────────────────────
echo ">>> Building web app..."
npm run build --workspace=@radio/web

# ─── 8. Nginx configuration ───────────────────────────────────────────────────
echo ">>> Configuring nginx..."
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name _;                  # Replace with your domain

    root $WEB_BUILD_DIR;
    index index.html;

    # Web app – SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/radio
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ─── 9. Install and enable systemd service ────────────────────────────────────
echo ">>> Installing radio-backend.service..."
mkdir -p /var/log/pm2
cp "$DEPLOY_DIR/scripts/radio-backend.service" /etc/systemd/system/radio-backend.service
systemctl daemon-reload
systemctl enable radio-backend
systemctl start radio-backend

echo ""
echo "Setup complete."
echo "  Backend : http://localhost:3000"
echo "  Web     : http://$(hostname -I | awk '{print $1}')"
echo ""
echo "Systemd service status:"
systemctl status radio-backend --no-pager
echo ""
echo "Next steps:"
echo "  1. Copy backend/.env with real credentials."
echo "  2. Replace 'server_name _' with your domain in $NGINX_CONF."
echo "  3. Run: certbot --nginx -d yourdomain.com  (for HTTPS)"
