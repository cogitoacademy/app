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
# Coolify's localhost server connects back to this VPS over SSH using its
# generated key in /root/.ssh/authorized_keys. Keep root password login off,
# while allowing that key-only connection for Coolify's server validation and
# deployments. The early-numbered drop-in wins over distro/cloud-init defaults.
install -d -m 755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/00-cogito-coolify.conf <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
# Only apply the sshd changes if the config is valid — never lock yourself out.
if sshd -t; then
  systemctl reload ssh
else
  echo "WARNING: sshd config invalid, NOT reloading — fix manually" >&2
fi

echo "=== Installing Coolify ==="
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

echo "=== Restricting Coolify control ports ==="
# Docker-published ports can bypass UFW. Keep the dashboard, realtime channel,
# and web terminal on loopback; operators reach them through SSH forwarding.
cat > /data/coolify/source/docker-compose.custom.yml <<'EOF'
services:
  coolify:
    ports: !override
      - "127.0.0.1:8000:8080"
  soketi:
    ports: !override
      - "127.0.0.1:6001:6001"
      - "127.0.0.1:6002:6002"
EOF
compose_files=(
  -f /data/coolify/source/docker-compose.yml
  -f /data/coolify/source/docker-compose.prod.yml
  -f /data/coolify/source/docker-compose.custom.yml
)
if [ -f /data/coolify/source/docker-compose.postgres-upgrade.yml ]; then
  compose_files+=(
    -f /data/coolify/source/docker-compose.postgres-upgrade.yml
  )
fi
docker compose --env-file /data/coolify/source/.env "${compose_files[@]}" up -d

echo "=== Creating deploy user ==="
if ! id -u deploy >/dev/null 2>&1; then
  useradd -m -s /bin/bash deploy
fi
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
# Preserve the key of the non-root account that invoked this script through
# sudo. Falling back to root's authorized_keys keeps direct root execution
# working too. This also makes the bootstrap safe to re-run from Terraform.
bootstrap_user="${SUDO_USER:-}"
bootstrap_home=""
if [ -n "$bootstrap_user" ] && [ "$bootstrap_user" != "root" ]; then
  bootstrap_home="$(getent passwd "$bootstrap_user" | cut -d: -f6 || true)"
fi
if [ -n "$bootstrap_home" ] && [ -f "$bootstrap_home/.ssh/authorized_keys" ]; then
  install -o deploy -g deploy -m 600 \
    "$bootstrap_home/.ssh/authorized_keys" \
    /home/deploy/.ssh/authorized_keys
elif [ -f /root/.ssh/authorized_keys ]; then
  install -o deploy -g deploy -m 600 \
    /root/.ssh/authorized_keys \
    /home/deploy/.ssh/authorized_keys
else
  echo "WARNING: no authorized_keys found for deploy; add one before disabling password SSH" >&2
fi
chown deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
if [ -f /home/deploy/.ssh/authorized_keys ]; then
  chmod 600 /home/deploy/.ssh/authorized_keys
fi

echo "=== Setting up fail2ban ==="
# W4: enable the sshd jail explicitly (the default config ships it disabled
# on some distros) and restart so the jail is active immediately.
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "=== Done! ==="
echo "Next steps:"
echo "1. Access Coolify through an SSH tunnel to http://localhost:8000 (port 8000 is not public)"
echo "2. Create admin account in Coolify UI"
echo "3. Add GitHub Container Registry as a Docker registry in Coolify"
echo "4. Create services for PostgreSQL, Redis, server, and web"
echo "5. Configure domains: api.cogitoacademy.id, app.cogitoacademy.id"
echo "6. Configure DNS: api/app.cogitoacademy.id → this server IP"
echo "7. Set up environment variables for each service in Coolify UI"
