#!/usr/bin/env bash
# Resolve a Coolify-private PostgreSQL hostname from the VPS host without
# publishing the database port. The rewritten URL is masked and exported only
# for the current GitHub Actions job.
set -euo pipefail

: "${PROD_DATABASE_URL:?PROD_DATABASE_URL is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

database_host="$({ DATABASE_URL="$PROD_DATABASE_URL" python3 - <<'PY'
import os
from urllib.parse import urlsplit

url = urlsplit(os.environ["DATABASE_URL"])
if not url.hostname:
    raise SystemExit("PROD_DATABASE_URL does not contain a hostname")
print(url.hostname)
PY
})"

if getent hosts "$database_host" >/dev/null 2>&1; then
  resolved_url="$PROD_DATABASE_URL"
else
  command -v docker >/dev/null 2>&1 || {
    echo "ERROR: database host '$database_host' is unresolved and docker is unavailable" >&2
    exit 1
  }

  if database_ip="$(docker inspect \
    --format '{{with index .NetworkSettings.Networks "coolify"}}{{.IPAddress}}{{end}}' \
    "$database_host" 2>/dev/null)"; then
    :
  else
    database_ip="$(sudo -n docker inspect \
      --format '{{with index .NetworkSettings.Networks "coolify"}}{{.IPAddress}}{{end}}' \
      "$database_host")"
  fi
  if [[ -z "$database_ip" ]]; then
    echo "ERROR: Coolify database container '$database_host' has no IP on the coolify network" >&2
    exit 1
  fi

  resolved_url="$({ DATABASE_URL="$PROD_DATABASE_URL" DATABASE_HOST_OVERRIDE="$database_ip" python3 - <<'PY'
import os
from urllib.parse import urlsplit, urlunsplit

url = urlsplit(os.environ["DATABASE_URL"])
host = os.environ["DATABASE_HOST_OVERRIDE"]
userinfo = ""
if url.username is not None:
    userinfo = url.username
    if url.password is not None:
        userinfo += f":{url.password}"
    userinfo += "@"
port = f":{url.port}" if url.port is not None else ""
print(urlunsplit((url.scheme, f"{userinfo}{host}{port}", url.path, url.query, url.fragment)))
PY
  })"
  echo "Resolved private Coolify database host '$database_host' through its current VPS-local container IP."
fi

printf '::add-mask::%s\n' "$resolved_url"
printf 'PROD_DATABASE_URL=%s\n' "$resolved_url" >> "$GITHUB_ENV"
