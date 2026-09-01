#!/usr/bin/env bash
# runner-prep.sh — one-time preparation of the cogito-prod self-hosted
# GitHub Actions runner (on the VPS) so `.github/workflows/infra-apply.yml`
# can run the Ansible playbooks unattended.
#
# What it does (idempotent — safe to re-run):
#   1. Installs sops (official .deb) system-wide.
#   2. Installs python3-pip + a pinned ansible-core venv for github-runner.
#   3. Grants github-runner passwordless sudo (required by the host
#      playbooks' become tasks — backup-cron, disk-watchdog write /etc and
#      root crontabs). The runner service already holds deploy authority
#      (CD's deploy job runs on it) and collaborators are internal-only
#      (security table in docs/plans/active/INFRA-AUTOMATION.md).
#   4. Puts the ansible venv on github-runner's PATH via .bashrc.
#
# Run on the VPS (or over SSH):
#   sudo bash infra/runner-prep.sh
#
# Remaining manual step after this script (GitHub console, operator):
#   gh secret set SOPS_AGE_KEY < ~/.config/sops/age/keys.txt
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "run as root (sudo)"; exit 1; }
RUNNER_USER=github-runner

echo "=== 1. sops ==="
if ! command -v sops >/dev/null 2>&1; then
  curl -fsSL -o /tmp/sops.deb https://github.com/getsops/sops/releases/download/v3.13.0/sops_3.13.0_amd64.deb
  dpkg -i /tmp/sops.deb && rm -f /tmp/sops.deb
fi
sops --version

echo "=== 2. pip + pinned ansible-core venv for $RUNNER_USER ==="
if ! command -v pip3 >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq python3-pip
fi
if ! sudo -u "$RUNNER_USER" test -x "/home/$RUNNER_USER/ansible-venv/bin/ansible-playbook"; then
  sudo -u "$RUNNER_USER" python3 -m venv "/home/$RUNNER_USER/ansible-venv"
  sudo -u "$RUNNER_USER" "/home/$RUNNER_USER/ansible-venv/bin/pip" install \
    --disable-pip-version-check -q "ansible-core==2.21.3"
  sudo -u "$RUNNER_USER" "/home/$RUNNER_USER/ansible-venv/bin/ansible-galaxy" collection install community.general
fi

echo "=== 3. passwordless sudo for the runner (become tasks need it) ==="
if [ ! -f /etc/sudoers.d/github-runner ]; then
  echo "$RUNNER_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/github-runner
  chmod 440 /etc/sudoers.d/github-runner
  visudo -c
else
  echo "sudoers entry already present"
fi

echo "=== 4. PATH for the runner (login shells) ==="
BASHRC="/home/$RUNNER_USER/.bashrc"
if ! grep -q "ansible-venv/bin" "$BASHRC" 2>/dev/null; then
  printf '\n# infra-apply runner tooling (added by infra/runner-prep.sh)\nexport PATH="/home/%s/ansible-venv/bin:$PATH"\n' "$RUNNER_USER" >> "$BASHRC"
fi

echo "=== 5. verify: runner can run ansible + sudo ==="
sudo -u "$RUNNER_USER" env PATH="/home/$RUNNER_USER/ansible-venv/bin:$PATH" ansible-playbook --version | head -1

echo "DONE."
echo "Remaining (GitHub console, operator only):"
echo "  gh secret set SOPS_AGE_KEY < ~/.config/sops/age/keys.txt"