#!/usr/bin/env bash
set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────
DEPLOY_DIR="/var/www/radio"
NGINX_CONF="/etc/nginx/sites-available/radio"
SSH_PORT="${SSH_PORT:-2222}"
DOMAINS="lavozverdad.com,www.lavozverdad.com,panel.lavozverdad.com,vozyverdad.com,www.vozyverdad.com"

# PANEL_PASS must be provided via environment — no insecure default
if [[ -z "${PANEL_PASS:-}" ]]; then
  echo "ERROR: PANEL_PASS environment variable is not set." >&2
  echo "  Usage: PANEL_PASS=your_secure_password bash setup.sh" >&2
  exit 1
fi

# ─── 1. System packages ───────────────────────────────────────────────────────
apt-get update -y
apt-get install -y \
  curl git nginx apache2-utils ufw fail2ban \
  unattended-upgrades apt-listchanges \
  certbot python3-certbot-nginx \
  aide

# ─── 2. Node.js 22 ────────────────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
echo "Node: $(node -v) | npm: $(npm -v)"

# ─── 3. Clone / update repo ───────────────────────────────────────────────────
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  git clone https://github.com/Juanes7222/Radio.git "$DEPLOY_DIR"
else
  git -C "$DEPLOY_DIR" pull --ff-only
fi
cd "$DEPLOY_DIR"

# ─── 4. Dependencies & build ──────────────────────────────────────────────────
rm -rf "$DEPLOY_DIR/node_modules" "$DEPLOY_DIR/package-lock.json"
npm install
npm run build --workspace=backend
npm run build --workspace=@radio/web

# ─── 5. Panel password ────────────────────────────────────────────────────────
htpasswd -cb /etc/nginx/.htpasswd admin "$PANEL_PASS"
chmod 640 /etc/nginx/.htpasswd

# ─── 6. Nginx + SSL certificates ─────────────────────────────────────────────

# Global rate-limiting and SSL directives go into conf.d so they are loaded
# automatically inside nginx's http{} block without editing nginx.conf directly.
cat > /etc/nginx/conf.d/radio-global.conf <<'EOF'
limit_req_zone  $binary_remote_addr zone=api:10m     rate=10r/s;
limit_req_zone  $binary_remote_addr zone=general:10m rate=30r/m;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
ssl_session_cache   shared:SSL:10m;
ssl_session_timeout 10m;
EOF

# Phase 1: deploy a minimal HTTP-only config so Certbot can complete its ACME
# challenge without needing certificates that do not exist yet.
mkdir -p /var/www/html
cat > "$NGINX_CONF" <<'EOF'
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
EOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/radio
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Phase 2: obtain certificates non-interactively
certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  -d lavozverdad.com \
  -d www.lavozverdad.com \
  -d panel.lavozverdad.com

certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  -d vozyverdad.com \
  -d www.vozyverdad.com

# Auto-renewal hook: reloads Nginx after each renewal so new certificates are
# picked up without dropping active stream connections.
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/usr/bin/env bash
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Phase 3: deploy the full HTTPS config now that certificates exist
cp "$DEPLOY_DIR/scripts/radio.nginx.conf" "$NGINX_CONF"
nginx -t && systemctl reload nginx

# ─── 7. Systemd service ───────────────────────────────────────────────────────
mkdir -p /var/log/pm2
cp "$DEPLOY_DIR/scripts/radio-backend.service" /etc/systemd/system/radio-backend.service
systemctl daemon-reload
systemctl enable radio-backend
systemctl start radio-backend

# ─── 8. Firewall ──────────────────────────────────────────────────────────────
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT/tcp"  # non-standard SSH port
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 8080/tcp          # AzuraCast must only be reachable internally via Nginx
ufw --force enable

# ─── 9. SSH hardening ─────────────────────────────────────────────────────────
SSHD_CONFIG="/etc/ssh/sshd_config"
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak"

sed -i "s/^#*Port .*/Port $SSH_PORT/"                "$SSHD_CONFIG"
sed -i "s/^#*PermitRootLogin .*/PermitRootLogin no/" "$SSHD_CONFIG"
sed -i "s/^#*MaxAuthTries .*/MaxAuthTries 3/"        "$SSHD_CONFIG"
sed -i "s/^#*X11Forwarding .*/X11Forwarding no/"     "$SSHD_CONFIG"

# Append options that may not exist in the file
grep -q "^ClientAliveInterval" "$SSHD_CONFIG" \
  || echo "ClientAliveInterval 300" >> "$SSHD_CONFIG"
grep -q "^ClientAliveCountMax" "$SSHD_CONFIG" \
  || echo "ClientAliveCountMax 2"   >> "$SSHD_CONFIG"

# Disable password authentication only if an authorized public key already exists.
# Disabling it before a key is in place would lock you out of the server.
AUTHORIZED_KEYS="${HOME}/.ssh/authorized_keys"
if [[ -f "$AUTHORIZED_KEYS" ]] && [[ -s "$AUTHORIZED_KEYS" ]]; then
  sed -i "s/^#*PasswordAuthentication .*/PasswordAuthentication no/" "$SSHD_CONFIG"
  echo "  SSH: password authentication disabled (public key found)."
else
  echo ""
  echo "  WARNING: no public key found at $AUTHORIZED_KEYS."
  echo "  Password authentication has been left enabled to avoid lockout."
  echo "  Once your public key is on the server, run:"
  echo "    sed -i 's/^#*PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config"
  echo "    systemctl restart ssh"
  echo ""
fi

systemctl restart ssh

# ─── 10. Fail2ban ─────────────────────────────────────────────────────────────
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
port     = $SSH_PORT
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/error.log

[nginx-badbots]
enabled  = true
port     = http,https
filter   = nginx-badbots
logpath  = /var/log/nginx/access.log
maxretry = 2
bantime  = 86400

[nginx-4xx]
enabled  = true
port     = http,https
filter   = nginx-4xx
logpath  = /var/log/nginx/access.log
maxretry = 20
findtime = 60
bantime  = 3600
EOF

# Filter for repeated 4xx errors
cat > /etc/fail2ban/filter.d/nginx-4xx.conf <<'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD).*" (4[0-9]{2}|444) 
ignoreregex =
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# ─── 11. Automatic security updates ──────────────────────────────────────────
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Packages "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# ─── 12. AIDE — filesystem integrity monitoring ───────────────────────────────
aideinit
mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Daily check at 3 AM — reports are mailed to root
echo "0 3 * * * root aide --check 2>&1 | mail -s 'AIDE report $(hostname)' root" \
  >> /etc/crontab

# ─── 13. App directory permissions ───────────────────────────────────────────
chown -R www-data:www-data "$DEPLOY_DIR/apps/web/dist"
chmod -R 750 "$DEPLOY_DIR/apps/web/dist"

# ─── 14. Protect sensitive config files ──────────────────────────────────────
if [ -f "$DEPLOY_DIR/backend/.env" ]; then
  chmod 600 "$DEPLOY_DIR/backend/.env"
  chown root:root "$DEPLOY_DIR/backend/.env"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
SERVER_IP="$(hostname -I | awk '{print $1}')"

echo ""
echo "========================================"
echo "  Setup complete"
echo "========================================"
echo "  Web   : https://lavozverdad.com"
echo "  Panel : https://panel.lavozverdad.com"
echo "  SSH   : port $SSH_PORT (port 22 is closed)"
echo ""
echo "Next steps:"
echo "  1. Add your public SSH key before closing this session:"
echo "     ssh-copy-id -p $SSH_PORT user@$SERVER_IP"
echo ""
echo "  2. Fill in /var/www/radio/backend/.env:"
echo "     AZURACAST_URL=http://127.0.0.1:8080"
echo ""
echo "  3. Verify Fail2ban:"
echo "     fail2ban-client status"
echo ""
echo "  4. Verify certificate auto-renewal:"
echo "     certbot renew --dry-run"
echo ""
echo "  WARNING: do NOT close this SSH session until you have verified"
echo "  you can connect on port $SSH_PORT in a second terminal."
echo "========================================"