---
name: production-reliability
description: Production engineering guidance for designing, deploying, operating, observing, and recovering software. Covers statelessness, HA, backups, migrations, timeouts, retries, idempotency, graceful degradation, telemetry, incident readiness, and rollback.
compatibility: opencode
metadata:
  audience: ai-coding-agent
  workflow: production
---

# Production Reliability

Use this skill for production-facing changes, infrastructure, persistence, external integrations, deployment, or reliability reviews.

## 1. Model the System

Identify:

- compute;
- network;
- storage;
- database;
- cache;
- queues;
- external APIs;
- secrets;
- DNS;
- load balancing;
- observability;
- deployment mechanism.

Classify components as stateful or stateless.

Stateless application instances should be replaceable where HA is required.

## 2. Failure Domains

Consider failures at:

- function;
- process;
- container;
- host;
- network;
- dependency;
- database;
- storage;
- region/provider where relevant.

Do not claim HA if a critical single point of failure remains.

## 3. Health Checks

Distinguish:

- liveness: is the process functioning?
- readiness: can it safely receive traffic?
- startup: has initialization completed?

A health check must not declare a service healthy merely because the process exists if critical dependencies make it unable to serve.

Avoid health checks that cause cascading failure by overwhelming dependencies.

## 4. Timeouts

Every network dependency needs a bounded timeout appropriate to its operation.

Use different time budgets where appropriate:

- connection;
- request;
- database query;
- queue operation.

Never allow an external dependency to hang indefinitely.

## 5. Retries

Retry only when:

- the error is plausibly transient;
- retry is bounded;
- backoff is used where appropriate;
- the operation is idempotent or otherwise safe;
- retry does not amplify an outage.

Avoid retry storms.

## 6. Idempotency

Any operation that may be retried after an ambiguous network outcome must have a deliberate duplicate-prevention strategy when duplicates are harmful.

Examples:

- idempotency keys;
- unique constraints;
- deduplication tables;
- state-machine checks;
- transactional outbox/inbox patterns.

## 7. Graceful Shutdown

Processes should:

1. stop accepting new work;
2. allow in-flight work to finish within a deadline;
3. close resources;
4. flush important telemetry;
5. exit with an appropriate status.

Workers should stop safely and avoid acknowledging work that was not completed.

## 8. Data and Backups

Do not confuse:

- HA;
- replication;
- backups;
- disaster recovery.

Replication improves availability/durability but does not replace independent backups.

Backups require:

- retention;
- encryption where appropriate;
- access controls;
- monitoring;
- restore testing.

A backup that has never been restored is an assumption, not proven recovery.

## 9. Database Changes

For schema changes:

- consider old and new application versions during rollout;
- prefer backward-compatible migrations for rolling deployments;
- separate destructive changes into later steps;
- consider lock duration and table size;
- provide rollback or recovery strategy;
- verify data integrity.

## 10. Deployment

Prefer:

Build immutable artifact -> verify -> deploy -> health check -> observe -> rollback if necessary.

Do not mutate production servers manually when automation can provide a repeatable deployment.

For migrations, define:

- preconditions;
- migration;
- verification;
- rollback/recovery;
- compatibility window.

## 11. Observability

At minimum, production services should expose enough evidence to answer:

- Is the service healthy?
- Is traffic failing?
- Is latency increasing?
- Which dependency is failing?
- Which version is running?
- What happened to a particular request?

Use logs, metrics, and traces according to operational need.

Alerts must be actionable and tied to a response.

## 12. Incident Readiness

For critical services, maintain runbooks for:

- service crash;
- database failure;
- disk exhaustion;
- certificate expiration;
- dependency outage;
- deployment rollback;
- backup restore.

A good runbook says:

- how to detect;
- how to diagnose;
- safe mitigation;
- verification;
- escalation;
- recovery.

## 13. Migration Mindset

When moving infrastructure:

- recreate infrastructure from configuration where practical;
- migrate persistent state explicitly;
- do not assume logs or caches must move;
- keep an independent backup;
- validate the destination before cutover;
- use a final sync/maintenance window or replication strategy;
- switch traffic only after verification;
- retain rollback capability.

Treat application code, persistent data, configuration, secrets, observability, and ephemeral state as different migration categories.
