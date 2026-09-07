#!/usr/bin/env bash
# ops.sh — Cogito production ops toolbox: DB, Redis, Drizzle Studio, DLQ,
# backups, logs, health — all through a single command. No long command
# chains to remember; credentials are resolved from the live environment on
# the VPS, never hardcoded and never logged.
#
# Usage (all commands run against production via SSH):
#   ./ops.sh health           # /health + scheduler + DLQ summary
#   ./ops.sh status           # containers, RAM, health, DLQ at a glance
#   ./ops.sh db               # psql shell into the production database
#   ./ops.sh db "SELECT 1"    # run one SQL query
#   ./ops.sh redis            # redis-cli shell (no auth prompt)
#   ./ops.sh redis LLEN cogito:dlq   # run one redis command
#   ./ops.sh dlq              # show the DLQ entries (what failed)
#   ./ops.sh dlq-clear        # clear the DLQ ledger (DEL cogito:dlq)
#   ./ops.sh cb               # circuit breaker states (cogito:cb:*)
#   ./ops.sh studio           # Owned cogito-studio gateway UI via SSH tunnel (local 4983)
#   ./ops.sh grafana          # Grafana dashboards via SSH tunnel (tailnet MagicDNS)
#   ./ops.sh prometheus       # Prometheus targets UI via SSH tunnel
#   ./ops.sh logs [lines]     # tail the API container logs
#   ./ops.sh backup           # run the nightly backup script manually
#   ./ops.sh disk             # disk usage at a glance (df, docker system df,
#                             # top containers by size)
#   ./ops.sh deploy-retry     # re-run the last CD deploy (gh run rerun, or
#                             # POST the Coolify deploy webhook with Bearer)
#   ./ops.sh tunnel 5433      # forward a port (default 5433→5432 local)
#   ./ops.sh trace <traceId>  # Grafana Explore URL for a trace (tailnet-only,
#                             # no log-grepping; e.g. ./ops.sh trace req_abc)
#
# Env (optional overrides):
#   OPS_VPS       VPS host (default: 15.235.186.159)
#   OPS_SSH_KEY   SSH private key (default: ~/.ssh/cogito_vps)
#   OPS_SSH_USER  SSH user (default: ubuntu)
#   GRAFANA_URL   Tailnet Grafana base URL for `trace`
#                 (default: http://cogito-vps.tail674634.ts.net:3000)
set -euo pipefail

OPS_VPS="${OPS_VPS:-cogito-vps.tail674634.ts.net}"
OPS_SSH_KEY="${OPS_SSH_KEY:-$HOME/.ssh/cogito_vps}"
OPS_SSH_USER="${OPS_SSH_USER:-ubuntu}"
SSH=(ssh -i "$OPS_SSH_KEY" -o ConnectTimeout=8 -o BatchMode=yes "$OPS_SSH_USER@$OPS_VPS")

# Container names — resolved live so drift doesn't break the toolbox.
api_container() { "${SSH[@]}" "sudo -n docker ps --format '{{.Names}}' | grep -E '^6ophpbzmsblhvetxi47gqd7e' | head -1"; }
redis_container() { "${SSH[@]}" "sudo -n docker ps --format '{{.Names}}' | grep -E '^qyzco4bhefhtet1luvpfwsnx' | head -1"; }
db_container() { "${SSH[@]}" "sudo -n docker ps --format '{{.Names}}' | grep -E '^noxeaeuxfreq0axa9unpew5r' | head -1"; }

redis_auth() {
  # Redis password lives in the container env — resolve it on the VPS, never show it.
  "${SSH[@]}" "sudo -n docker exec $(redis_container) env 2>/dev/null | grep -iE 'REDIS_PASSWORD|requirepass' | head -1 | cut -d= -f2-"
}

health() {
  echo "=== /health ==="
  curl -s --max-time 8 https://api.cogitoacademy.id/health | python3 -m json.tool 2>/dev/null || curl -s --max-time 8 https://api.cogitoacademy.id/health
}

status() {
  health
  echo ""
  echo "=== containers ==="
  "${SSH[@]}" "sudo -n docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | head -15"
  echo ""
  echo "=== RAM ==="
  "${SSH[@]}" "free -m | head -3"
  echo ""
  echo "=== DLQ ==="
  local pass
  pass="$(redis_auth)"
  "${SSH[@]}" "sudo -n docker exec $(redis_container) redis-cli -a \"$pass\" LLEN cogito:dlq 2>/dev/null"
}

db() {
  local dbc dbname
  dbc="$(db_container)"
  dbname="${OPS_DB_NAME:-postgres}"
  if [[ $# -eq 0 ]]; then
    "${SSH[@]}" "sudo -n docker exec -it $dbc psql -U postgres -d $dbname"
  else
    "${SSH[@]}" "sudo -n docker exec $dbc psql -U postgres -d $dbname -c \"$*\""
  fi
}

redis() {
  local rc pass
  rc="$(redis_container)"
  pass="$(redis_auth)"
  if [[ $# -eq 0 ]]; then
    "${SSH[@]}" "sudo -n docker exec -it $rc redis-cli -a \"$pass\" 2>/dev/null"
  else
    "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" $* 2>/dev/null"
  fi
}

dlq() {
  local rc pass
  rc="$(redis_container)"
  pass="$(redis_auth)"
  echo "=== DLQ depth ==="
  "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" LLEN cogito:dlq 2>/dev/null"
  echo "=== entries (most recent first) ==="
  "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" LRANGE cogito:dlq 0 -1 2>/dev/null | python3 -c \"
import json,sys
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    try:
        j=json.loads(line)
        print('job:', j.get('originalJobId','?'), '| attempts:', j.get('attemptsMade','?'))
        print('  reason:', (j.get('failedReason','') or '')[:200])
    except Exception:
        print(line[:200])
\""
}

dlq_clear() {
  local rc pass
  rc="$(redis_container)"
  pass="$(redis_auth)"
  echo "Clearing cogito:dlq"
  "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" DEL cogito:dlq 2>/dev/null"
}

cb() {
  local rc pass
  rc="$(redis_container)"
  pass="$(redis_auth)"
  echo "=== circuit breaker states (cogito:cb:*) ==="
  "${SSH[@]}" "sudo -n docker exec $rc redis-cli -a \"$pass\" --scan --pattern 'cogito:cb:*' 2>/dev/null | while read -r k; do echo \"\$k: \$(sudo -n docker exec $rc redis-cli -a \"$pass\" HGET \"\$k\" state 2>/dev/null)\"; done"
  echo "(no keys = all breakers closed/never tripped)"
}

logs() {
  local lines="${1:-200}"
  "${SSH[@]}" "sudo -n docker logs --tail $lines $(api_container) 2>&1"
}

backup() {
  "${SSH[@]}" "sudo -n /usr/local/bin/cogito-backup.sh 2>/dev/null || echo 'backup script not installed yet — run the backup-cron playbook first (see ops/README.md or docs/RUNBOOK.md)'"
}

disk() {
  echo "=== df -h / ==="
  "${SSH[@]}" "df -h /"
  echo ""
  echo "=== docker system df ==="
  "${SSH[@]}" "sudo -n docker system df 2>/dev/null"
  echo ""
  echo "=== top containers by size ==="
  "${SSH[@]}" "sudo -n docker ps -a --format '{{.Names}}\t{{.Size}}' 2>/dev/null | sort -k2 -hr | head -10"
}

deploy_retry() {
  # Re-run the last CD deploy. Two paths:
  #   1. gh run rerun for the most recent failed CD run (the 'CD red but box
  #      recovered' case — re-running is SAFE: snapshot/migrate/deploy are
  #      idempotent, see docs/RUNBOOK.md → Monitoring → Redeploy/retry).
  #   2. If no CD run is available (or gh is not authed), POST the Coolify
  #      deploy webhook directly with the Bearer token from the SOPS vault.
  #      The webhook URL is a GitHub secret (COOLIFY_PROD_SERVER_WEBHOOK) —
  #      resolve it from the vault COOLIFY_API_TOKEN + the resource UUID via
  #      the Coolify API; never echo the token.
  local run_id
  run_id="$(gh run list --workflow=cd-prod.yml --limit 1 --json databaseId,conclusion --jq '.[0].databaseId' 2>/dev/null || true)"
  if [[ -n "$run_id" ]]; then
    echo "Re-running the last CD run (id=$run_id) — snapshot/migrate/deploy are idempotent, safe to re-run."
    gh run rerun "$run_id"
    return 0
  fi
  echo "No CD run found via gh — falling back to the Coolify deploy webhook."
  local token uuid
  token="$(sops -d infra/secrets/prod.env 2>/dev/null | grep '^COOLIFY_API_TOKEN=' | cut -d= -f2- || true)"
  if [[ -z "$token" ]]; then
    echo "ERROR: COOLIFY_API_TOKEN not in the SOPS vault — cannot retry the deploy." >&2
    return 1
  fi
  # Resolve the cogito-api resource UUID live (never hardcode it).
  uuid="$(curl -s --max-time 8 http://localhost:8000/api/v1/applications -H "Authorization: Bearer $token" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print([a['uuid'] for a in d if a.get('name')=='cogito-api'][0])" 2>/dev/null || true)"
  if [[ -z "$uuid" ]]; then
    echo "ERROR: could not resolve the cogito-api UUID (is the Coolify tunnel up? ssh -L 8000:127.0.0.1:8000 ...)." >&2
    return 1
  fi
  echo "POSTing the deploy webhook for cogito-api (uuid=$uuid) — token never echoed."
  curl --fail --silent --show-error --max-time 30 \
    -X POST "https://cl.cogitoacademy.id/api/v1/deploy?uuid=$uuid&force=false" \
    -H "Authorization: Bearer $token"
  echo ""
  echo "Deploy queued — verify: curl -s https://api.cogitoacademy.id/health (version must match the intended sha)."
}

studio() {
  # Owned cogito-studio service (see infra/ansible/studio.yml): the
  # drizzle-gateway container serves the Studio UI on VPS 127.0.0.1:4983
  # (tailnet-only, no public domain by design). Access is a straight TCP
  # forward onto that gateway — there is deliberately NO direct-DB
  # drizzle-kit path here (it bypassed the owned service and needed the DB
  # password on the operator machine).
  local ssh_cmd="ssh -i $OPS_SSH_KEY -o ConnectTimeout=8 -o BatchMode=yes -N -L 4983:127.0.0.1:4983 $OPS_SSH_USER@$OPS_VPS"
  echo "=== Owned cogito-studio via SSH tunnel ==="
  echo "SSH: $ssh_cmd"
  echo "Forward: localhost:4983 -> VPS 127.0.0.1:4983 (cogito-studio gateway)"
  # shellcheck disable=SC2086
  ssh -i "$OPS_SSH_KEY" -o ConnectTimeout=8 -o BatchMode=yes -N -L "4983:127.0.0.1:4983" "$OPS_SSH_USER@$OPS_VPS" &
  local tunnel_pid=$!
  trap 'kill $tunnel_pid 2>/dev/null' EXIT
  # Preflight: wait for the local gateway port before pointing the browser.
  local i
  for i in $(seq 1 15); do
    if python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1',4983)); s.close()" 2>/dev/null; then
      echo "Studio is up: open http://localhost:4983 in your browser (Ctrl+C stops the tunnel)."
      wait $tunnel_pid
      return 0
    fi
    sleep 1
  done
  echo "ERROR: nothing answers on localhost:4983 after 15s — the tunnel is up but VPS 127.0.0.1:4983 is not." >&2
  echo "HINT: the owned gateway is down or its port publish drifted (see infra/ansible/studio.yml):" >&2
  echo "  1. Coolify UI (via the :8000 tunnel) -> cogito-studio -> Start/Restart, wait ~2 min, retry: ./infra/ops.sh studio" >&2
  echo "  2. Or verify declaratively: ansible-playbook -i infra/ansible/inventory.ini infra/ansible/studio.yml" >&2
  return 1
}

tunnel() {
  local port="${1:-5433}"
  echo "Tunneling localhost:$port → VPS → postgres:5432 (Ctrl+C to stop)"
  ssh -i "$OPS_SSH_KEY" -o ConnectTimeout=8 "$OPS_SSH_USER@$OPS_VPS" -N -L "$port:localhost:5432"
}

obs_tunnel() {
  # Open a tailnet dashboard in one command: foreground SSH tunnel + the URL.
  # Grafana/Prometheus publish on VPS loopback only; MagicDNS ($OPS_VPS)
  # resolves over the tailnet so no raw IP is needed. Ctrl+C stops the tunnel.
  local name="${1:?usage: obs_tunnel <grafana|prometheus>}"
  local local_port remote_port
  case "$name" in
    grafana) local_port=3000; remote_port=3000 ;;
    prometheus) local_port=9090; remote_port=9090 ;;
    *) echo "Unknown dashboard: $name (grafana|prometheus)" >&2; return 1 ;;
  esac
  echo "Opening $name: tunnel localhost:$local_port → $OPS_VPS:127.0.0.1:$remote_port (Ctrl+C to stop)"
  echo "Then open: http://localhost:$local_port"
  ssh -i "$OPS_SSH_KEY" -o ConnectTimeout=8 "$OPS_SSH_USER@$OPS_VPS" -N -L "$local_port:127.0.0.1:$remote_port"
}

trace() {
  # Print the tailnet Grafana Explore URL for a traceId — no SSH
  # log-grepping. Grafana is tailnet-only (no public log UI); open the URL
  # over the tailnet, or via `ssh -L 3000:127.0.0.1:3000 ...` first.
  local trace_id="${1:-}"
  if [[ -z "$trace_id" ]]; then
    echo "Usage: $0 trace <traceId>  (e.g. $0 trace req_abc123)" >&2
    return 1
  fi
  local grafana="${GRAFANA_URL:-http://cogito-vps.tail674634.ts.net:3000}"
  local query left
  query="{service=\"cogito-api\"} |= \"$trace_id\""
  left="$(TRACE_QUERY="$query" python3 -c 'import json,os,urllib.parse; print(urllib.parse.quote(json.dumps({"datasource":"Loki","queries":[{"expr":os.environ["TRACE_QUERY"],"refId":"A"}]}), safe=""))')"
  echo "Grafana Explore (tailnet-only): $grafana/explore?orgId=1&left=$left"
  echo "LogQL: $query"
}

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

case "${1:-}" in
  health) health ;;
  status) status ;;
  db) shift; db "$@" ;;
  redis) shift; redis "$@" ;;
  dlq) dlq ;;
  dlq-clear) dlq_clear ;;
  cb) cb ;;
  logs) shift; logs "${1:-}" ;;
  backup) backup ;;
  disk) disk ;;
  deploy-retry) deploy_retry ;;
  studio) shift; studio "${1:-}" ;;
  grafana) obs_tunnel grafana ;;
  prometheus) obs_tunnel prometheus ;;
  tunnel) shift; tunnel "${1:-}" ;;
  trace) shift; trace "${1:-}" ;;
  help|-h|--help) usage ;;
  *) echo "Unknown command: ${1:-}"; usage; exit 1 ;;
esac
