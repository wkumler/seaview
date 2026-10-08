#!/usr/bin/env bash
# Set up, or update, the cruise map server (Ubuntu 24.04, e.g. AWS Lightsail).
#
#   sudo bash /opt/seaview/server/install.sh
#
# Safe to re-run: it pulls the latest code, rebuilds the tile job image and
# refreshes the web files. Tiles, the Copernicus login and the HTTPS setup
# are kept.
set -euo pipefail

DOMAIN="${DOMAIN:-cruise.obviewer.com}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB=/srv/cruise

step() { printf '\n==> %s\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
    echo "Please run with sudo: sudo bash $0" >&2
    exit 1
fi

step "Installing packages (nginx, certbot, docker)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx certbot python3-certbot-nginx docker.io docker-buildx rsync git
systemctl enable --now docker

if ! swapon --show | grep -q .; then
    step "Adding 2 GB of swap space (protects against running out of memory)"
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Updating code in $REPO_DIR"
git -C "$REPO_DIR" pull --ff-only

step "Building the tile job image (first time takes 5-10 minutes)"
docker build -q -f "$REPO_DIR/server/Dockerfile" -t seaview-daily "$REPO_DIR"
docker image prune -f >/dev/null

step "Copying web files to $WEB"
mkdir -p "$WEB/tiles" /var/lib/seaview/data /etc/seaview
# tiles/, colorbars/ and layer_config/ belong to the daily job: never overwrite or delete them.
rsync -a --delete \
    --exclude 'tiles/' --exclude 'colorbars/' --exclude 'layer_config/' \
    --exclude 'README.md' --exclude '*.py' \
    "$REPO_DIR/web/" "$WEB/"

step "Configuring nginx for $DOMAIN"
if [[ -f /etc/nginx/sites-available/cruise ]]; then
    echo "Keeping the existing /etc/nginx/sites-available/cruise (it may contain certbot's HTTPS settings)."
else
    sed "s/__DOMAIN__/$DOMAIN/" "$REPO_DIR/server/nginx-cruise.conf" > /etc/nginx/sites-available/cruise
fi
ln -sf /etc/nginx/sites-available/cruise /etc/nginx/sites-enabled/cruise
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

step "Copernicus Marine login"
if [[ -s /etc/seaview/cmems.env ]]; then
    echo "Keeping the existing login in /etc/seaview/cmems.env (delete that file and re-run to change it)."
else
    read -rp "Copernicus Marine username: " cm_user </dev/tty
    read -rsp "Copernicus Marine password (nothing shows while typing): " cm_pass </dev/tty
    echo
    (umask 077; printf 'SEAVIEW_CMEMS_LOGIN=%s\nSEAVIEW_CMEMS_PASSWORD=%s\n' "$cm_user" "$cm_pass" \
        > /etc/seaview/cmems.env)
    echo "Saved to /etc/seaview/cmems.env (readable by root only)."
fi

step "Scheduling the daily job (06:00 and 18:00 UTC)"
cp "$REPO_DIR/server/seaview-daily.service" "$REPO_DIR/server/seaview-daily.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now seaview-daily.timer

step "Done"
systemctl list-timers seaview-daily.timer --no-pager
echo
echo "Map:   http://$DOMAIN/  (or http://<this server's IP>/ until DNS is set up)"
echo "Run the job now:   sudo systemctl start --no-block seaview-daily"
echo "Follow its log:    sudo journalctl -u seaview-daily -f"
