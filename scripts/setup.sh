#!/usr/bin/env bash
# ==============================================================================
# setup.sh — Deployment and hardening script
#
# USAGE:
#   PANEL_PASS=<password> CERTBOT_EMAIL=<email> bash setup.sh
#
# REQUIRED ENV VARS:
#   PANEL_PASS
#   CERTBOT_EMAIL
#
# OPTIONAL ENV VARS:
#   SSH_PORT     (default: 2222)
#   SERVICE_USER (default: radio)
#   DEPLOY_DIR   (default: /var/www/radio)
# ==============================================================================

set -euo pipefail
IFS=$'\n\t'

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root."
  error "Usage: sudo PANEL_PASS=... CERTBOT_EMAIL=... bash setup.sh"
  exit 1
fi

DEPLOY_DIR="${DEPLOY_DIR:-/var/www/radio}"
NGINX_CONF="/etc/nginx/sites-available/radio"
NGINX_GLOBAL_CONF="/etc/nginx/conf.d/radio-global.conf"
SSH_PORT="${SSH_PORT:-2222}"
SERVICE_USER="${SERVICE_USER:-radio}"

MISSING_VARS=()
[[ -z "${PANEL_PASS:-}"    ]] && MISSING_VARS+=("PANEL_PASS")
[[ -z "${CERTBOT_EMAIL:-}" ]] && MISSING_VARS+=("CERTBOT_EMAIL")

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  error "Missing required environment variables:"
  for v in "${MISSING_VARS[@]}"; do
    error "  - $v"
  done
  exit 1
fi

info "Step 1/14 — Installing system packages..."
apt-get update -y
apt-get install -y \
  curl git nginx apache2-utils ufw fail2ban \
  unattended-upgrades apt-listchanges \
  certbot python3-certbot-nginx \
  aide mailutils logrotate

info "Step 2/14 — Installing Node.js 22..."
NODESOURCE_SCRIPT="$(mktemp)"
curl -fsSL https://deb.nodesource.com/setup_22.x -o "$NODESOURCE_SCRIPT"

if [[ ! -s "$NODESOURCE_SCRIPT" ]]; then
  error "Downloaded NodeSource script is empty. Aborting."
  rm -f "$NODESOURCE_SCRIPT"
  exit 1
fi

bash "$NODESOURCE_SCRIPT"
rm -f "$NODESOURCE_SCRIPT"
apt-get install -y nodejs
info "Node: $(node -v) | npm: $(npm -v)"

info "Step 3/14 — Creating service user '$SERVICE_USER'..."
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin \
    --comment "Backend service account" "$SERVICE_USER"
fi

info "Step 4/14 — Syncing repository..."
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  git clone https://github.com/Juanes7222/Radio.git "$DEPLOY_DIR"
else
  git -C "$DEPLOY_DIR" pull --ff-only
fi
cd "$DEPLOY_DIR"

info "Step 5/14 — Installing dependencies and building..."
rm -rf node_modules package-lock.json
npm install

# FIX: Abort on high/critical vulnerabilities
if ! npm audit --audit-level=high; then
  error "High severity vulnerabilities found."
  exit 1
fi

npm run build --workspace=backend
npm run build --workspace=@radio/web
npm prune --omit=dev

info "Step 6/14 — Configuring panel password..."
echo "$PANEL_PASS" | htpasswd -ci /etc/nginx/.htpasswd admin
chmod 640 /etc/nginx/.htpasswd
chown root:www-data /etc/nginx/.htpasswd
unset PANEL_PASS

info "Step 7/14 — Configuring Nginx and SSL..."

if ! grep -q "server_tokens off" /etc/nginx/nginx.conf; then
  sed -i '/http {/a \\tserver_tokens off;' /etc/nginx/nginx.conf
fi

cp "$DEPLOY_DIR/scripts/radio-global.conf" "$NGINX_GLOBAL_CONF"

mkdir -p /var/www/html
cat > "$NGINX_CONF" <<'NGINX'
server {
    listen 80;
    server_name lavozverdad.com www.lavozverdad.com panel.lavozverdad.com vozyverdad.com www.vozyverdad.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 200 'ok';
        add_header Content-Type text/plain;
    }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/radio
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot certonly --nginx --non-interactive --agree-tos \
  --email "$CERTBOT_EMAIL" --no-eff-email \
  -d lavozverdad.com -d www.lavozverdad.com -d panel.lavozverdad.com

certbot certonly --nginx --non-interactive --agree-tos \
  --email "$CERTBOT_EMAIL" --no-eff-email \
  -d vozyverdad.com -d www.vozyverdad.com

unset CERTBOT_EMAIL

mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/usr/bin/env bash
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

cp "$DEPLOY_DIR/scripts/radio.nginx.conf" "$NGINX_CONF"
nginx -t && systemctl reload nginx

info "Step 8/14 — Configuring backend systemd service..."

SERVICE_FILE="/etc/systemd/system/radio-backend.service"
REPO_SERVICE="$DEPLOY_DIR/scripts/radio-backend.service"

if [ -f "$REPO_SERVICE" ]; then
  cp "$REPO_SERVICE" "$SERVICE_FILE"
else
  cat > "$SERVICE_FILE" <<UNIT
[Unit]
Description=Radio Backend
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${DEPLOY_DIR}/apps/backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=${DEPLOY_DIR} /var/log/radio-backend

[Install]
WantedBy=multi-user.target
UNIT
fi

mkdir -p /var/log/radio-backend
chown "$SERVICE_USER:$SERVICE_USER" /var/log/radio-backend

systemctl daemon-reload
systemctl enable radio-backend
systemctl start radio-backend