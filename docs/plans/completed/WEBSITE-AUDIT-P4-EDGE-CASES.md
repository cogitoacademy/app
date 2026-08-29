# Website Audit P4 Edge Cases

Status: Completed  
Date: 2026-08-29  
Branch: `f/website-audit-hardening`

## Delivered

- Safely parse Better Auth email-signup JSON before password-policy validation and return HTTP 400 for malformed input.
- Align both room-conflict query paths with the database's half-open `[start,end)` exclusion constraint.
- Allow a room session to begin exactly when the previous one ends while continuing to reject every genuinely overlapping interval.
- Add focused parser and room repository/service regression coverage.

## Verification

- Focused auth/room tests: 52 passed, 0 failed.
