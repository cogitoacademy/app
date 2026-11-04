# @cogito-app/db

Drizzle ORM schema and migrations for Cogito, driven by the `postgres` (postgres.js) driver.

## Schema (`src/schema/`)

Current schema: 71 `pgTable` definitions across 31 schema modules. `src/schema/index.ts`
re-exports the full schema (used by Better Auth's Drizzle adapter via
`@cogito-app/db/schema`).

## Migrations (`src/migrations/`)

Generated SQL migrations in `src/migrations/` (currently through `0090`) via `drizzle-kit generate`, applied with:

```
bun run db:migrate
```

The driver is `postgres` (postgres.js) with `drizzle-orm/postgres-js`; the client config in `src/index.ts` sets `statement_timeout: 30_000` and redacts credential-shaped values from logged connection details. `DB_SSL_ENABLED` / `DB_SSL_REJECT_UNAUTHORIZED` control TLS, with a boot warning when SSL verification is disabled in production-like envs (`warnIfInsecureProductionSsl`).

## Scripts

| Script                             | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `db:migrate`                       | Apply migrations (`drizzle-kit migrate`)                  |
| `db:generate`                      | Generate a new migration from schema changes              |
| `db:push`                          | Push schema without migrations (dev)                      |
| `db:studio`                        | Drizzle Studio UI                                         |
| `db:start` / `db:stop` / `db:down` | Local Postgres via docker compose (test DB via `db:test`) |

Export surface: `@cogito-app/db` (client + helpers) and `@cogito-app/db/schema`.
