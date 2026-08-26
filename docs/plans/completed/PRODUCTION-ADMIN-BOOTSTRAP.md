# Production Admin Bootstrap

| Field  | Value                                                                             |
| ------ | --------------------------------------------------------------------------------- |
| Status | Completed                                                                         |
| Date   | 2026-08-27                                                                        |
| Scope  | Deterministic production/staging admin bootstrap with configurable trusted emails |

## Delivered

- `itcogitoacademy01@gmail.com` is the default production/staging operator
  email through `ADMIN_EMAILS`.
- Existing matching accounts are promoted during server boot; matching
  accounts created after boot are promoted by the Better Auth signup hook.
- `ADMIN_EMAILS` accepts a comma-separated, case-insensitive list for other
  trusted bootstrap accounts.
- Existing admins are preserved, and normal admin role management remains
  available for addresses outside the bootstrap list.
- Local/test seed behavior remains unchanged so deterministic E2E accounts
  continue using `admin@cogitoacademy.id`.

## Verification

- Focused env, auth, server bootstrap, and seed tests pass.
- Production-like behavior is covered for case-insensitive matching and
  non-demotion of an existing admin.
