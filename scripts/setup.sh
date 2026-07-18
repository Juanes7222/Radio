#!/usr/bin/env bash
# ==============================================================================
# setup.sh — One-time environment provisioning
#
# Prepares the server to run the radio stack: installs system packages,
# Node.js, creates the service user, clones the repo, configures Nginx
# with SSL, and registers the backend systemd service.
#
# After this script completes, run deploy.sh to build and start the app.
#
# USAGE:
#   sudo bash setup.sh --panel-pass <password> --certbot-email <email> [OPTIONS]
#
# REQUIRED:
#   --panel-pass <password>    htpasswd password for the panel
#   --certbot-email <email>    email for Let's Encrypt registration
#
# OPTIONAL:
#   --ssh-port <port>          SSH port to configure (default: 2222)
#   --service-user <user>      system user for the backend service (default: radio)
#   --deploy-dir <path>        root directory of the app (default: /var/www/radio)
# ==============================================================================

set -euo pipefail
IFS=$'\n\t'

# setup.sh runs before the repo exists and cannot source lib.sh.
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,2\}//'
  exit 0
}

PANEL_PASS=""
CERTBOT_EMAIL=""
SSH_PORT="2222"
SERVICE_USER="radio"
DEPLOY_DIR="/var/www/radio"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel-pass)     PANEL_PASS="$2";    shift 2 ;;
    --panel-pass=*)   PANEL_PASS="${1#*=}"; shift ;;
    --certbot-email)  CERTBOT_EMAIL="$2"; shift 2 ;;
    --certbot-email=*) CERTBOT_EMAIL="${1#*=}"; shift ;;
    --ssh-port)       SSH_PORT="$2";      shift 2 ;;
    --ssh-port=*)     SSH_PORT="${1#*=}"; shift ;;
    --service-user)   SERVICE_USER="$2";  shift 2 ;;
    --service-user=*) SERVICE_USER="${1#*=}"; shift ;;
    --deploy-dir)     DEPLOY_DIR="$2";    shift 2 ;;
    --deploy-dir=*)   DEPLOY_DIR="${1#*=}"; shift ;;
    --help|-h)        usage ;;
    *) error "Unknown option: $1"; exit 1 ;;
  esac
done

MISSING_FLAGS=()
[[ -z "$PANEL_PASS"    ]] && MISSING_FLAGS+=("--panel-pass")
[[ -z "$CERTBOT_EMAIL" ]] && MISSING_FLAGS+=("--certbot-email")

if [[ ${#MISSING_FLAGS[@]} -gt 0 ]]; then
  error "Missing required flags:"
  for f in "${MISSING_FLAGS[@]}"; do
    error "  $f"
  done
  error "Run with --help for usage."
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root (sudo bash setup.sh ...)."
  exit 1
fi

BACKEND_DIR="$DEPLOY_DIR/backend"
SCRIPTS_DIR="$DEPLOY_DIR/scripts"

NGINX_CONF="/etc/nginx/sites-available/radio"
NGINX_GLOBAL_CONF="/etc/nginx/conf.d/radio-global.conf"
BACKEND_SERVICE="radio-backend"
SERVICE_FILE="/etc/systemd/system/${BACKEND_SERVICE}.service"

# ------------------------------------------------------------------------------
# Step 1 — System packages
# ------------------------------------------------------------------------------
info "Step 1/8 — Installing system packages..."
apt-get update -y
apt-get install -y \
  curl git nginx apache2-utils ufw fail2ban \
  unattended-upgrades apt-listchanges \
  certbot python3-certbot-nginx \
  aide mailutils logrotate

# ------------------------------------------------------------------------------
# Step 2 — Node.js and pnpm
# ------------------------------------------------------------------------------
info "Step 2/8 — Installing Node.js 22..."
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
npm install -g pnpm

# ------------------------------------------------------------------------------
# Step 3 — Service user
# ------------------------------------------------------------------------------
info "Step 3/8 — Creating service user '$SERVICE_USER'..."
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin \
    --comment "Backend service account" "$SERVICE_USER"
fi

# ------------------------------------------------------------------------------
# Step 4 — Repository
# ------------------------------------------------------------------------------
info "Step 4/8 — Syncing repository..."
if [[ ! -d "$DEPLOY_DIR/.git" ]]; then
  git clone https://github.com/Juanes7222/Radio.git "$DEPLOY_DIR"
else
  git -C "$DEPLOY_DIR" fetch origin
  git -C "$DEPLOY_DIR" reset --hard "@{u}"
fi
git -C "$DEPLOY_DIR" submodule update --init --recursive

# ------------------------------------------------------------------------------
# Step 5 — Panel basic-auth password
# ------------------------------------------------------------------------------
info "Step 5/8 — Configuring panel password..."
echo "$PANEL_PASS" | htpasswd -ci /etc/nginx/.htpasswd admin
chmod 640 /etc/nginx/.htpasswd
chown root:www-data /etc/nginx/.htpasswd
unset PANEL_PASS

# ------------------------------------------------------------------------------
# Step 6 — Nginx base config and SSL certificates
# ------------------------------------------------------------------------------
info "Step 6/8 — Configuring Nginx and SSL..."

if ! grep -q "server_tokens off" /etc/nginx/nginx.conf; then
  sed -i '/http {/a \\tserver_tokens off;' /etc/nginx/nginx.conf
fi

cp "$SCRIPTS_DIR/radio-global.conf" "$NGINX_GLOBAL_CONF"

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

cp "$SCRIPTS_DIR/radio.nginx.conf" "$NGINX_CONF"
nginx -t && systemctl reload nginx

# ------------------------------------------------------------------------------
# Step 7 — systemd service unit
# ------------------------------------------------------------------------------
info "Step 7/8 — Configuring backend systemd service..."

REPO_SERVICE="$SCRIPTS_DIR/radio-backend.service"

if [[ -f "$REPO_SERVICE" ]]; then
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
WorkingDirectory=${BACKEND_DIR}
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=${DEPLOY_DIR} /var/log/${BACKEND_SERVICE}

[Install]
WantedBy=multi-user.target
UNIT
fi

mkdir -p "/var/log/$BACKEND_SERVICE"
chown "$SERVICE_USER:$SERVICE_USER" "/var/log/$BACKEND_SERVICE"

systemctl daemon-reload
systemctl enable "$BACKEND_SERVICE"

# ------------------------------------------------------------------------------
# Step 8 — Hand off to deploy
# ------------------------------------------------------------------------------
info "Step 8/8 — Running initial deploy..."
bash "$SCRIPTS_DIR/deploy.sh" --backend --frontend

info ""
info "Setup complete. The radio stack is provisioned and running."
info "Use deploy.sh for all subsequent releases."