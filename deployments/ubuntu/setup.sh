#!/usr/bin/env bash
# =============================================================================
# setup.sh — InspectorRAGet deployment on Ubuntu 24 LTS (EC2 + Elastic IP)
#
# Run as the ubuntu user (sudo privileges required for system steps).
# Safe to re-run — each step is idempotent.
#
# Usage:
#   chmod +x deployments/ubuntu/setup.sh
#   ./deployments/ubuntu/setup.sh
# =============================================================================

set -euo pipefail

# Verify this is running on Ubuntu
if ! grep -qi "ubuntu" /etc/os-release 2>/dev/null; then
  echo "ERROR: This script is intended for Ubuntu only. Exiting." >&2
  exit 1
fi

APP_DIR="/home/ubuntu/InspectorRAGet"
LOG_DIR="/home/ubuntu/logs"
CERT_DIR="/etc/ssl/certs"
KEY_DIR="/etc/ssl/private"
CERT_FILE="$CERT_DIR/inspectorraget-selfsigned.crt"
KEY_FILE="$KEY_DIR/inspectorraget-selfsigned.key"
NGINX_CONF="/etc/nginx/sites-available/inspectorraget"

echo ""
echo "============================================================"
echo " InspectorRAGet — Ubuntu deployment setup"
echo "============================================================"
echo ""
echo "  IMPORTANT: This script is designed exclusively for"
echo "  Ubuntu EC2 instances behind an Nginx reverse proxy."
echo "  Do not run it on a local dev machine or any other"
echo "  platform — steps like swap, ufw, and certificate"
echo "  generation assume that environment."
echo ""
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# 1. Prerequisites — nginx, git, Node.js (via nvm), PM2
# ---------------------------------------------------------------------------
echo "[1/7] Installing prerequisites..."

# Collect missing apt packages
PKGS=()
command -v nginx >/dev/null 2>&1 || PKGS+=(nginx)
command -v git   >/dev/null 2>&1 || PKGS+=(git)

if [ ${#PKGS[@]} -gt 0 ]; then
  echo "       apt-get install: ${PKGS[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y "${PKGS[@]}"
else
  echo "       nginx and git already installed — skipping."
fi

# Node.js via nvm
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "       Installing nvm v0.40.4..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
fi
# shellcheck disable=SC1091
\. "$NVM_DIR/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "       Installing Node.js 24 LTS via nvm..."
  nvm install 24
  nvm alias default 24
else
  echo "       Node.js $(node -v) already installed — skipping."
fi

# PM2 (requires node)
if ! command -v pm2 >/dev/null 2>&1; then
  echo "       Installing PM2 globally..."
  npm install -g pm2
else
  echo "       PM2 $(pm2 -v) already installed — skipping."
fi

echo "       Prerequisites ready."

# ---------------------------------------------------------------------------
# 2. Swap space (guards against OOM during Next.js build on 1 GB instances)
# ---------------------------------------------------------------------------
echo "[2/7] Configuring swap space..."
if [ ! -f /swapfile ]; then
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  # Persist across reboots
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "       1 GB swapfile created and enabled."
else
  echo "       Swapfile already exists — skipping."
fi

# ---------------------------------------------------------------------------
# 3. Self-signed TLS certificate (valid 2 years)
#    CN is set to the server's public IP automatically.
# ---------------------------------------------------------------------------
echo "[3/7] Generating self-signed TLS certificate..."
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || echo "localhost")

if [ ! -f "$CERT_FILE" ]; then
  sudo openssl req -x509 -nodes -days 730 \
    -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=US/ST=NY/L=Yorktown Heights/O=InspectorRAGet/CN=$PUBLIC_IP" \
    -addext "subjectAltName=IP:$PUBLIC_IP"
  sudo chmod 600 "$KEY_FILE"
  echo "       Certificate generated at $CERT_FILE"
else
  echo "       Certificate already exists — skipping."
fi

# ---------------------------------------------------------------------------
# 4. Nginx configuration
# ---------------------------------------------------------------------------
echo "[4/7] Configuring Nginx..."
if ! cmp -s "$APP_DIR/deployments/ubuntu/nginx.conf" "$NGINX_CONF" 2>/dev/null; then
  sudo cp "$APP_DIR/deployments/ubuntu/nginx.conf" "$NGINX_CONF"
  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/inspectorraget
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl enable nginx
  sudo systemctl restart nginx
  echo "       Nginx configured and restarted."
else
  echo "       Nginx config unchanged — skipping."
fi

# ---------------------------------------------------------------------------
# 5. Firewall (ufw)
# ---------------------------------------------------------------------------
echo "[5/7] Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # opens 80 + 443
sudo ufw --force enable
sudo ufw status

# ---------------------------------------------------------------------------
# 6. Application — install dependencies and build
# ---------------------------------------------------------------------------
echo "[6/7] Installing dependencies and building Next.js app..."
mkdir -p "$LOG_DIR"
cd "$APP_DIR"

# Stop PM2 before building to free RAM (Next.js build can spike ~800 MB)
pm2 stop inspectorraget 2>/dev/null || true

export NEXT_TELEMETRY_DISABLED=1

# Only re-run npm ci when package-lock.json has changed since the last install.
# The hash of the lockfile is stored in .npm-install-hash; if it matches, the
# existing node_modules is reused and the build is significantly faster.
LOCKFILE_HASH=$(sha256sum "$APP_DIR/package-lock.json" | awk '{print $1}')
HASH_FILE="$APP_DIR/.npm-install-hash"
if [ ! -d "$APP_DIR/node_modules" ] || [ ! -f "$HASH_FILE" ] || [ "$(cat "$HASH_FILE")" != "$LOCKFILE_HASH" ]; then
  echo "       package-lock.json changed (or first run) — running npm ci..."
  npm ci
  echo "$LOCKFILE_HASH" > "$HASH_FILE"
else
  echo "       package-lock.json unchanged — skipping npm ci."
fi

npm run build

# ---------------------------------------------------------------------------
# 7. PM2 — start application
# ---------------------------------------------------------------------------
echo "[7/7] Starting application with PM2..."

pm2 flush inspectorraget 2>/dev/null || true
pm2 delete inspectorraget 2>/dev/null || true
pm2 start "$APP_DIR/deployments/ubuntu/pm2.config.js"
pm2 save

# Enable PM2 to start on reboot
echo ""
echo "  Run the command printed below to enable PM2 auto-start on reboot:"
pm2 startup | tail -n 1
echo ""

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo " Setup complete!"
echo ""
echo " Application: https://$PUBLIC_IP"
echo " PM2 status:  pm2 status"
echo " App logs:    pm2 logs inspectorraget"
echo " Nginx logs:  sudo tail -f /var/log/nginx/error.log"
echo ""
echo " NOTE: Browsers will show a security warning for the"
echo " self-signed certificate. Users must click 'Advanced'"
echo " and proceed to continue."
echo "============================================================"
echo ""
