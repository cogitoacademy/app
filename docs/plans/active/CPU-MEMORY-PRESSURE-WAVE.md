# CPU/Memory Pressure Wave

| Field   | Value                                                                                 |
| ------- | ------------------------------------------------------------------------------------- |
| Status  | **Active** (created 2026-09-07)                                                       |
| Branch  | `w/cpu-memory-pressure-wave` (merges `w/cpu-pressure-platform`, `w/cpu-pressure-alerts`) |
| Workers | 2 (platform + alerts; lead owns docs tail)                                            |
| Entry   | Operator commands live in [INFRA-PLAYBOOK.md](../../INFRA-PLAYBOOK.md); detail behind it in [RUNBOOK.md](../../RUNBOOK.md) |

Grill-round decisions (user-locked 2026-09-07): KeepLast on **all 12** rules;
mem-limit + network-attach enforcement runs in-wave (operator clicks, lead
verifies); backup-log shipping approved (single-file read-only mount, within
A3); Kuma `/metrics` canary approved; escape hatches confirmed (retention cut
below 30d headroom, drop Prometheus first below 500MB available).

## 1. Live diagnosis (lead, read-only SSH 2026-09-07 — no guessing)

- Load 2.75 on 2 cores with `wa` up to 84% + ~690MB swap churning = **swap-thrash**,
  not app burn (API at 0.5% CPU / 177MB; disk 54%, no disk emergency).
- cAdvisor OOM-cycled on its 128m cgroup (dmesg `CONSTRAINT_MEMCG` proof),
  back at 97.9% → each kill/restart churns CPU and gaps container metrics.
- Alloy `unhealthy` = missing `wget` in-image (Alloy ships fine); Loki/Grafana
  probes valid. Prometheus at 78% of 256m — next OOM candidate.

## 2. Tasks

| ID | Task | Lands in |
| -- | ---- | -------- |
| P1 | cAdvisor 128m → 256m + `--disable_metrics=disk,diskIO` (disk panels use node-exporter — verified, no `container_fs_*` refs) | `observability.yml` |
| P2 | Delete Alloy wget probe; add Prometheus `alloy:12345` self-scrape (liveness via TargetDown + telemetry; closes prior O7) | `observability.yml`, `prometheus.yml` |
| P3 | Ship `/var/log/cogito-backup.log` to Loki as `{service="cogito-backup",job="backup"}` (single-file `:ro` mount) | `observability.yml`, `config.alloy` |
| O1 | `noDataState: KeepLast` on all 12 rules + stale-comment reconciliation | `rules.yaml` |
| O2 | Saturation P5 swap panel; P9 `(UNVERIFIED)` note until live check | `saturation.json`, `infra.json` |
| D1 | RUNBOOK incident + KeepLast notes; CONTEXT plan row + order #22; this file | `docs/` (lead) |

## 3. Operator apply + verify (post-merge, in order)

1. `touch /var/log/cogito-backup.log` on the VPS **before** redeploy (else Docker
   makes the bind-mount a directory and the Alloy tail breaks).
2. Merge → infra-apply re-runs `observability.yml` (PATCHes `cogito-alloy`
   compose; Play 2 syncs `prometheus.yml` + `config.alloy`; handler restarts
   Prometheus + Alloy).
3. Verify: Prometheus `/targets` — new `alloy` UP (if DOWN while the container
   runs, the listener binds loopback-only → follow-up: Alloy `server` block);
   `{service="cogito-backup"}` lines in Explore; `docker inspect` Alloy shows
   no healthcheck; cAdvisor RSS <200m; swap trending down over 24h.
4. Enforcement (in-wave): Coolify UI api 512m / web 256m (177MB observed →
   safe) + `docker inspect` paste; `docker network connect --alias cogito-api
   cogito-obs <api-container>`; Kuma `/metrics` canary with Bearer token;
   enable secret scanning + push protection.
5. 24h later: paste `docker stats` + `free -m` for the pressure-released check;
   P9 verdict via `container_start_time_seconds` (delete panel + rule if NoData).

## 4. Out of scope / next session

Restore drill, origin cutover, retention cuts (only on Saturation evidence),
`coolify-realtime` ~5% CPU curiosity, Alloy stale-target inspect noise.
