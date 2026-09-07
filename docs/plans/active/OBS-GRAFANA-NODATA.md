# Grafana No-Data + cAdvisor Blind Spot

| Field   | Value                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Status  | Active — dashboards/alerts, rotation, folder unification, and pipeline repairs all merged + applied; single Cogito folder verified live; REMAINS: one UI Redeploy of cogito-alloy, then container-label verification |
| Created | 2026-09-06                                                                                     |
| Branch  | `fix/obs-grafana-no-data` (merged #214) + follow-ups #216/#217/#218/#219/#221 (merged)          |
| Workers | `obs-panels` (dashboards/alerts, `agent/obs-panels-fix` 453625d8) · `obs-host` (diagnosis + image bump, `agent/obs-cadvisor-fix` f4c5efd2) |

## 1. Symptom (live, 2026-09-06)

Three Grafana panels showed No Data while the system was healthy; all 3
Prometheus targets were UP (`cogito-api`, `node-exporter`, `cadvisor`):

1. **Error rate (% 5xx)** (App RED #2, Delivery #4): numerator
   `sum(rate(http_requests_total{status=~"5.."}[5m]))` is an empty vector
   when zero 5xx occur, so the ratio is empty → No Data instead of 0%.
2. **Breaker state** (App RED #4B, Delivery #3): healthy servers return `{}` breakers
   (no `cogito:cb:*` Redis keys → exposition omits the section), so Prometheus
   holds no `breaker_state` samples → No Data.
3. **Container memory (top)** (Infra #4): cAdvisor exposed 114
   `container_memory_working_set_bytes` series with labels
   `__name__,id,instance,job` ONLY — zero `name`, zero `container_label_*`.
   No label fix can restore this; the exporter is blind (see §3).

## 2. Landed in this PR

- Zero-safe PromQL: `(sum(rate(...5..)) or vector(0)) / sum(...)` for both
  5xx panels + the ApiErrors alert expr (`noDataState: OK` kept).
- Healthy-safe breakers: `breaker_state or on() vector(0)` (timeseries,
  per-breaker series preserved) and `max(breaker_state) or vector(0)` (stat).
- Infra panel: query unchanged (the #212 label fix is correct); added a
  description noting data resumes after the host fix.
- `cadvisor_image`: `gcr.io/cadvisor/cadvisor:v0.52.1` →
  `ghcr.io/google/cadvisor:v0.60.5` (2 lines + comment, §3).
- Grafana admin rotation: fresh 32-byte password, now **SOPS-encrypted**
  (`GRAFANA_ADMIN_PASSWORD=ENC[...]`, regex metadata fixed), live reset
  verified (new 200 / old 401). Prior plaintext values remain in git history.

## 3. Root cause: cAdvisor vs containerd snapshotter

cAdvisor `v0.52.1` predates upstream containerd-snapshotter support (fix
#3709, shipped `v0.54.0`). Docker `29.7.2` uses
`driver-type: io.containerd.snapshotter.v1`, so the legacy probe
`/var/lib/docker/image/overlayfs/layerdb/mounts/<id>/mount-id` never exists
and every container fails registration (`manager.go:1116`, once a minute).
Any `≥v0.54` works; `v0.60.5` is the fleet-measured tag on Docker 29 with
our exact mounts, on the canonical `ghcr.io` registry. Rejected: explicit
`docker.sock` mount (already present via `/var/run`, wrong layer) and daemon
`containerd-snapshotter:false` (restarts all containers — fallback only).

## 4. Remaining: operator apply (NOT done from here)

```bash
# 0. Pre-flight (read-only): new image resolves
docker pull ghcr.io/google/cadvisor:v0.60.5
# record digest: docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/google/cadvisor:v0.60.5

# 1. Tunnel + apply (Play 1 PATCHes cogito-alloy compose drift — enforced
#    since the drift-detection repair: GET never returns docker_compose_raw,
#    so absence now means enforce-declared-state instead of silent no-drift)
ssh -i ~/.ssh/cogito_vps -f -N -L 8000:127.0.0.1:8000 ubuntu@<tailnet-ip>
./infra/apply.sh observability   # or: ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml --ask-become-pass

# 2. Redeploy cogito-alloy in the Coolify UI (compose drift needs a redeploy;
#    the Play 2 handler restarts only on provisioned-file change)

# 3. Coolify UI: set GF_SECURITY_ADMIN_PASSWORD on cogito-grafana to the
#    rotated vault value (keeps fresh volumes consistent with live)

# 4. Restart cogito-grafana: NOT a separate step — Play 2's tree-sync handler
#    restarts it automatically during apply (pipeline or manual); file-provisioned
#    alert rules load at startup, dashboards hot-reload.
```

Verify (expect 2–3 min after redeploy):

```bash
ssh -i ~/.ssh/cogito_vps -f -N -L 9090:127.0.0.1:9090 ubuntu@<tailnet-ip>
curl -s 'http://localhost:9090/api/v1/series?match[]=container_memory_working_set_bytes' \
 | python3 -c "import json,sys; d=json.load(sys.stdin); s=d['data']; print(len(s), sorted({k for x in s for k in x})); print('with_name=', sum(1 for x in s if 'name' in x))"
# expect: total >114, keys include name + container_label_*, with_name > 40
# + targets UP at :9090/targets; cAdvisor log free of 'read-write layer' errors
```

Rollback: `git revert` the image bump, re-apply + redeploy (or set the image
back in the Coolify UI and redeploy). Same blast radius: stateless cadvisor
container only (~1–2 min container-metrics gap; host/API/log metrics unaffected).

## 5. Provisioning re-home behavior (learned 2026-09-07 — #216/#217)

Grafana file provisioning only re-saves dashboards whose FILE CONTENT
changed; a provider `folderUid` re-pin alone moves nothing (verified live:
#216 re-pin left App RED/Delivery/Infra stranded in the duplicate folder
while Logs & Traces, already in the true folder, stayed). Moving boards
between folders therefore needs a content touch per file (#217: dashboard
`description` noting the home folder). Rule of thumb: any future folder
change must ride with a content change, then apply, then confirm each board
via `/api/search`, then delete the empty duplicate via
`DELETE /api/folders/<uid>` (verify empty first). Play 3 stays
create-when-missing so it never recreates a deleted duplicate while one
`Cogito` folder exists.

## 6. SSH/tailnet flakiness notes (2026-09-07)

Mid-session the tailnet path started dropping large packets: new SSH
handshakes stalled at `expecting SSH2_MSG_KEX_ECDH_REPLY` (post-quantum
`sntrup761x25519` KEX messages) and idle tunnels died, while small packets
(tailscale ping, banners) passed. Workaround for all manual SSH/scp/tunnel
commands: `-oKexAlgorithms=curve25519-sha256 -o HostKeyAlgorithms=ssh-ed25519
-o Ciphers=aes128-ctr -o MACs=hmac-sha2-256`. Ansible Play 2 was bypassed
once because of this (its multiplexed bursts hit sshd throttling
`Connection closed by port 22`); the manual equivalent (copy tree files,
0644, restart consumers via the same Coolify endpoints) was performed
instead — the next normal apply converges to a no-op. Never `pkill -f` a
tunnel pattern that matches your own command line; kill by PID.

## 7. Close-out

When §4 verifies green: move this file to `docs/plans/completed/`, fold the
resolved digest next to `cadvisor_image`, and note the Infra panel rendering
in `docs/CONTEXT.md`.
