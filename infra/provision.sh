#!/bin/bash
set -euo pipefail

echo "=== Updating system ==="
apt update && apt upgrade -y

# W4: install unattended-upgrades so security patches apply without manual
# intervention on a public server.
DEBIAN_FRONTEND=noninteractive apt install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "=== Installing Docker ==="
# W4: the get.docker.com script is not pinned to a version. For a production
# server, prefer pinning: install a specific docker-ce version from
# download.docker.com/linux/ubuntu (see RUNBOOK) or verify the script's
# checksum before running. The script remains the documented quick path.
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "=== Installing utility packages ==="
apt install -y git curl wget ufw fail2ban

echo "=== Configuring firewall ==="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
# W4: the Coolify UI (port 8000) is the control plane for the whole server —
# it must NOT be exposed to the world. Restrict it to your admin IP
# (replace <ADMIN_IP> with your static IP / VPN egress) or bind it to
# localhost and tunnel via SSH. Leaving 8000 open to 0.0.0.0 lets anyone
# reach the Coolify login page and brute-force it.
#   ufw allow from <ADMIN_IP> to any port 8000 proto tcp
#   ufw allow from 127.0.0.1 to any port 8000 proto tcp
ufw --force enable

echo "=== Hardening SSH ==="
# W4: a public production server must not allow root login or password auth.
# fail2ban (below) is a second layer, not a substitute for these.
sshd_config=/etc/ssh/sshd_config
if ! grep -q "^PermitRootLogin no" "$sshd_config"; then
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' "$sshd_config"
fi
if ! grep -q "^PasswordAuthentication no" "$sshd_config"; then
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$sshd_config"
fi
# Only apply the sshd changes if the config is valid — never lock yourself out.
if sshd -t; then
  systemctl reload ssh
else
  echo "WARNING: sshd config invalid, NOT reloading — fix manually" >&2
fi

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
# W4: enable the sshd jail explicitly (the default config ships it disabled
# on some distros) and restart so the jail is active immediately.
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "=== Done! ==="
echo "Next steps:"
echo "1. Access Coolify at http://<server-ip>:8000 (restrict port 8000 to your admin IP first!)"
echo "2. Create admin account in Coolify UI"
echo "3. Add GitHub Container Registry as a Docker registry in Coolify"
echo "4. Create services for PostgreSQL, Redis, server, and web"
echo "5. Configure domains: api.cogitoacademy.id, app.cogitoacademy.id"
echo "6. Configure DNS: api/app.cogitoacademy.id → this server IP"
echo "7. Set up environment variables for each service in Coolify UI"
