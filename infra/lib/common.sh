#!/usr/bin/env bash
# common.sh — shared helpers for the infra/ shell scripts.
#
# Source at the top of a script, AFTER the shebang and header comment:
#   set -euo pipefail
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   # shellcheck source=../lib/common.sh
#   . "$SCRIPT_DIR/../lib/common.sh"
#
# NOTE: infra/backup.sh and infra/disk-watchdog.sh are deployed to the VPS
# STANDALONE by their ansible playbooks (ansible.builtin.copy of the single
# file to /usr/local/bin/), so they must NOT source this file — the lib is
# not deployed with them. Only scripts that run from the repo checkout
# (apply.sh, ops.sh, ...) may source it.
#
# Every helper is a no-op-safe, POSIX-ish function: it only prints to
# stdout/stderr and exits — it never changes the caller's state.

# log_info <msg...> — timestamped info line to stdout.
log_info() {
  printf '%s INFO %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# log_warn <msg...> — timestamped warning line to stderr.
log_warn() {
  printf '%s WARN %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

# log_error <msg...> — timestamped error line to stderr.
log_error() {
  printf '%s ERROR %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

# assert_command <name> [hint] — fail with a clear message when the binary
# is not on PATH. The optional hint is appended to the error line.
assert_command() {
  local name="$1" hint="${2:-}"
  if ! command -v "$name" >/dev/null 2>&1; then
    log_error "$name is not on PATH.$hint"
    exit 1
  fi
}

# require_env <var> — fail with a clear message when the named environment
# variable is unset or empty. The variable name is printed, never its value.
require_env() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    log_error "$var is not set (or is empty) — refusing to continue."
    exit 1
  fi
}
