---
name: code-review
description: Rigorous universal code review for correctness, security, reliability, maintainability, observability, performance, testing, database safety, and production failure modes. Use when reviewing diffs, PRs, existing code, or proposed architecture.
compatibility: opencode
metadata:
  audience: ai-coding-agent
  workflow: review
---

# Code Review

Review the system, not just the changed lines.

## Review Order

1. Correctness
2. Security
3. Data integrity
4. Failure handling
5. Concurrency
6. Reliability
7. Maintainability
8. Observability
9. Performance
10. Tests
11. Documentation

## Correctness

Check:

- invariants;
- edge cases;
- null/empty values;
- state transitions;
- off-by-one behavior;
- ordering;
- race conditions;
- incorrect assumptions;
- API contract compatibility.

## Error and Failure Review

For each external operation:

- timeout?
- error propagation?
- retry policy?
- retry safety?
- idempotency?
- partial failure?
- cancellation?
- resource cleanup?

Check process-level failures:

- panic/crash;
- OOM;
- graceful shutdown;
- connection pool exhaustion;
- file descriptor exhaustion.

Check infrastructure-level assumptions:

- what if the host dies?
- what if DNS fails?
- what if a dependency is unavailable?
- what if storage is full?

## Database

Check:

- transaction boundary;
- atomicity;
- isolation requirements;
- locks;
- race conditions;
- indexes;
- N+1 queries;
- unbounded queries;
- pagination;
- migration safety;
- backward compatibility;
- rollback strategy;
- duplicate writes;
- idempotency.

For destructive migrations, require a clear recovery strategy.

## Security

Check:

- authentication;
- authorization;
- tenant/resource isolation;
- input validation;
- output encoding;
- SQL/command/template injection;
- SSRF;
- CSRF;
- path traversal;
- secret handling;
- sensitive logging;
- insecure dependencies;
- unsafe defaults;
- rate limiting where necessary.

Never assume authenticated means authorized.

## Observability

Determine whether the change needs:

- structured logs;
- metrics;
- traces;
- alerts.

Avoid noisy alerts.

A normal client error should generally not page an engineer. Repeated infrastructure failures, crashes, integrity violations, and availability-impacting conditions should be observable and alertable.

## Concurrency

Look for:

- shared mutable state;
- race conditions;
- duplicate workers;
- double processing;
- deadlocks;
- lock contention;
- non-atomic check-then-act sequences;
- unsafe retries.

## Maintainability

Check:

- cohesion;
- coupling;
- naming;
- abstraction quality;
- duplication;
- dependency direction;
- testability;
- complexity;
- unnecessary indirection.

Prefer a simple correct abstraction over a generic framework.

## Performance

Look for concrete issues, not hypothetical micro-optimizations.

Pay attention to:

- N+1;
- O(n²) accidental behavior;
- unbounded memory;
- unnecessary serialization;
- excessive network round trips;
- blocking operations;
- missing indexes;
- uncontrolled concurrency.

## Testing

Require tests for:

- new behavior;
- important failure paths;
- regression cases;
- security-sensitive behavior;
- data integrity;
- concurrency-sensitive behavior where applicable.

Reject tests that merely assert implementation details without protecting behavior.

## Review Output

Report findings by severity:

- CRITICAL: immediate security/data-loss/system-integrity risk.
- HIGH: likely production failure or serious security/reliability issue.
- MEDIUM: meaningful maintainability/reliability issue.
- LOW: minor improvement.
- NOTE: optional observation.

Every finding should include:

- location;
- problem;
- why it matters;
- concrete remediation.

Do not invent problems. If no meaningful issue exists, say so and summarize what was verified.
