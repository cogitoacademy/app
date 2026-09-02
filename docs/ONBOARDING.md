# Cogito Onboarding Guide

Last updated: 2026-08-12

## Prerequisites

- **Bun** ≥ 1.0 (install from https://bun.sh)
- **Docker** (for PostgreSQL and Redis)
- **Node.js** ≥ 20 (for some tooling)
- **Git** (with SSH keys configured)

## Clone and Setup

```bash
git clone git@github.com:your-org/cogito-app.git
cd cogito-app
bun install
```

## Environment Configuration

```bash
# Copy the example env file
cp apps/server/.env.example apps/server/.env

# Optional: create a local test override
cp apps/server/.env.test.example apps/server/.env.test

# Edit with your values:
# DATABASE_URL=postgresql://cogito:cogito@localhost:6767/cogito
# BETTER_AUTH_SECRET=<generate with: openssl rand -hex 32>
# BETTER_AUTH_URL=http://localhost:3001
# CORS_ORIGIN=http://localhost:3000
# PAYMENT_WEBHOOK_SECRET=<generate with: openssl rand -hex 32>
# REDIS_URL=redis://localhost:6379 (required — Redis is mandatory)
```

## Start Development

```bash
# Start PostgreSQL + Redis (db:start brings up both)
bun run db:start

# Optional: start isolated PostgreSQL + Redis for tests
bun run db:test

# Run migrations
bun run db:migrate

# Default mark packages are installed by migration 0041. Optional local/test seed:
bun run seed-packages

# Start dev server (web + server)
bun run dev
```

The server runs on `http://localhost:3001` and the web app on `http://localhost:3000`.

## Running Tests

```bash
# Full test harness against isolated test DB
bun run test

# API tests only
bun run test:api

# Single API test file
bun scripts/run-test-suite.mjs api packages/api/src/tests/unit/booking.service.test.ts

# With coverage
bun run test:coverage

# E2E (uses isolated ports 3100/3101)
bun run test:e2e

# Type checking
bun run check-types

# Linting + formatting
bun run check

# Build
bun run build
```

### Integration Tests

Integration and e2e tests use the isolated test database and ports:

```bash
bun run db:test
bun run test:api
```

The harness migrates `cogito-test` automatically and blocks execution if
`DATABASE_URL` points at a non-test database.

## Project Structure

```
cogito-app/
├── apps/
│   ├── server/              # Elysia HTTP server (port 3001)
│   │   └── src/
│   │       ├── index.ts     # Bootstrap → init logger → create server → listen
│   │       ├── routes.ts    # Mount: evlog + cors + /api/auth + /rpc + /health
│   │       └── middleware.ts # identifyUser (evlog/better-auth)
│   └── web/                 # Vite + React 19 + TanStack Router
├── packages/
│   ├── api/                 # Business logic (4-layer modules)
│   │   └── src/
│   │       ├── procedures.ts # publicProcedure, protectedProcedure, adminProcedure
│   │       ├── routers.ts    # appRouter composition
│   │       ├── services.ts   # Composition root: createModule() calls
│   │       ├── context.ts    # Per-request: { session, services }
│   │       ├── lib/          # errors, db, tx, idempotency, circuit-breaker, rate-limit
│   │       └── modules/      # 18 domain modules (4-layer each)
│   ├── auth/                # Better Auth config
│   ├── config/              # Shared TS config
│   ├── db/                  # Drizzle schema + migrations
│   ├── env/                 # Zod-validated env vars
│   └── ui/                  # Selia component library (22+ components)
├── docs/                    # PRD, plans, context
└── designs/                 # .pen design files
```

## 4-Layer Architecture

Every module follows: **Router → Handler → Service → Repository**

| Layer      | Responsibility                                 | DB? | File                  |
| ---------- | ---------------------------------------------- | --- | --------------------- |
| Router     | oRPC route definition, Zod validation, auth    | No  | `{module}.router.ts`  |
| Handler    | DI factory, adapts `{ context, input }`        | No  | `{module}.handler.ts` |
| Service    | Pure business logic + consumer port interfaces | No  | `{module}.service.ts` |
| Repository | Data access (SQL queries only)                 | Yes | `{module}.repo.ts`    |

### Adding a New API Endpoint

1. **Define types** in `{module}.types.ts`:

   ```ts
   import { z } from "zod";
   export const createThingInput = z.object({ name: z.string().min(1) });
   export type CreateThingInput = z.infer<typeof createThingInput>;
   ```

2. **Add repo method** in `{module}.repo.ts`:

   ```ts
   async function findThingById(conn: DbOrTx, id: string) {
     const [row] = await conn
       .select()
       .from(thing)
       .where(eq(thing.id, id))
       .limit(1);
     return row ?? null;
   }
   ```

3. **Add service method** in `{module}.service.ts`:

   ```ts
   async function getThing(thingId: string) {
     const thing = await repo.findThingById(db, thingId);
     if (!thing) throw new ThingNotFoundError(thingId);
     return thing;
   }
   ```

4. **Add handler method** in `{module}.handler.ts`:

   ```ts
   get: async ({ context }: { context: Context }) => {
     const thing = await service.getThing(context.session.user.id);
     return { id: thing.id, name: thing.name };
   },
   ```

5. **Add router route** in `{module}.router.ts`:

   ```ts
   export function createThingRouter(handler: ThingHandler) {
     return {
       get: protectedProcedure.handler(handler.get),
     };
   }
   ```

6. **Wire in services.ts** and **routers.ts**

### Adding a New Module

1. Create directory: `packages/api/src/modules/{module}/`
2. Create files: `types`, `errors`, `repo`, `service`, `handler`, `router`, `index.ts`
3. Define consumer-driven port interfaces in the service (e.g., `BookingWalletPort`)
4. Add to `ServiceRegistry` type and `services.ts` factory
5. Add to `appRouter` in `routers.ts`
6. Add DB schema and migration if needed (see `packages/db/src/schema/`)
7. Add tests: `tests/unit/{module}.service.test.ts`

### Adding a New Database Table

1. Define table in `packages/db/src/schema/{module}.ts`:
   ```ts
   import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
   export const thing = pgTable("thing", {
     id: uuid("id").primaryKey().defaultRandom(),
     name: text("name").notNull(),
     createdAt: timestamp("created_at").defaultNow().notNull(),
   });
   ```
2. Export from `packages/db/src/schema/index.ts`
3. Run migration: `bun run db:generate`
4. Apply: `bun run db:migrate`

## Git Workflow

- **Main branch:** `main` — production-ready code
- **Feature branches:** `feature/{name}` — new features
- **Improvement branches:** `improvement/{name}` — refactoring, performance, security
- **Hotfix branches:** `hotfix/{name}` — urgent fixes from `main`

### Commit Messages

Use conventional commits:

- `feat(scope): description` — New feature
- `fix(scope): description` — Bug fix
- `test(scope): description` — Test changes
- `docs: description` — Documentation changes
- `chore: description` — Maintenance

### Pre-commit Hooks

Lefthook runs on commit:

- **oxlint** + **oxfmt** for linting and formatting
- Pre-push: typecheck

### CI

GitHub Actions runs on PRs:

- Lint
- TypeCheck
- Build
- Test + Coverage (90% packages/api, 80% overall)

## Debugging

### VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Bun: Debug Server",
  "runtimeExecutable": "bun",
  "runtimeArgs": ["run", "dev:server"],
  "cwd": "${workspaceFolder}"
}
```

### Database

```bash
bun run db:studio    # Opens Drizzle Studio at localhost:4983
```

### Logs

The server uses structured JSON logging via `evlog`. In development, logs are pretty-printed. In production, they're JSON formatted.

### Common Issues

- **Port 3001 already in use:** Kill existing process or change `PORT` env var
- **Port 3100/3101 already in use during tests:** Stop prior test servers or change `WEB_PORT` / `PORT` in `.env.test`
- **Database connection refused:** Run `bun run db:start` first
- **Test database connection refused:** Run `bun run db:test` first
- **Migration errors:** Check `DATABASE_URL` and run `bun run db:migrate`
- **Type errors after schema changes:** Run `bun run db:generate` then `bun run check-types`
