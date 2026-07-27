#!/bin/bash
set -euo pipefail

echo "=== Updating system ==="
apt update && apt upgrade -y

echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "=== Installing utility packages ==="
apt install -y git curl wget ufw fail2ban

echo "=== Configuring firewall ==="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8000/tcp
ufw --force enable

echo "=== Installing Coolify ==="
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

echo "=== Creating deploy user ==="
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys 2>/dev/null || true
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

echo "=== Setting up fail2ban ==="
systemctl enable fail2ban
systemctl start fail2ban

echo "=== Done! ==="
echo "Next steps:"
echo "1. Access Coolify at http://<server-ip>:8000"
echo "2. Create admin account in Coolify UI"
echo "3. Add GitHub Container Registry as a Docker registry in Coolify"
echo "4. Create services for PostgreSQL, Redis, server, and web"
echo "5. Configure domains: cogitoacademy.id, app.cogitoacademy.id"
echo "6. Configure DNS: cogitoacademy.id → this server IP"
echo "7. Set up environment variables for each service in Coolify UI"