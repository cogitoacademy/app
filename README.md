# cogito-app

Monorepo for the Cogito tutoring platform. Backend (Elysia + oRPC + PostgreSQL) and frontend (React 19 + TanStack Router + Selia UI).

## Stack

- **Bun** — runtime, test runner, package manager
- **TypeScript** — type safety across all workspaces
- **Elysia** — HTTP server (port 3001)
- **oRPC** — end-to-end type-safe API (POST convention, OpenAPI integration)
- **Drizzle ORM** + **PostgreSQL 16** — database (Docker, port 6767)
- **Better Auth 1.6.11** — email/password + optional Google OAuth
- **React 19** + **TanStack Router/Query/Form** — frontend (Vite, port 3000)
- **Selia UI** — component library on TailwindCSS v4 + @base-ui/react (see `AGENTS.md`)
- **Turborepo** — monorepo build orchestration
- **Oxlint + Oxfmt** — linting and formatting
- **Lefthook** — pre-commit (oxlint + oxfmt), pre-push (typecheck)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (runtime)
- [Docker Desktop](https://docker.com) (for PostgreSQL + Redis)

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Start PostgreSQL + Redis (Docker; PostgreSQL on 6767, Redis on 6379 — Redis is mandatory)
bun run db:start

# 3. Apply migrations
bun run db:migrate

# 4. Configure environment
cp .env.example .env                       # root (used by tests)
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
# Edit BETTER_AUTH_SECRET to a 32+ character string

# 5. (Optional) Seed package data for local/test setup; migration 0041 installs defaults automatically
bun run seed-packages
```

### Run

```bash
bun run dev            # web (3000) + server (3001)
bun run dev:web        # web only
bun run dev:server     # server only
```

Open [http://localhost:3000](http://localhost:3000) for the web app.
The API is at [http://localhost:3001](http://localhost:3001).
API docs (dev only) at [http://localhost:3001/api-reference](http://localhost:3001/api-reference).

For production provisioning, Coolify setup, the normal GitHub Actions release,
and the manual GHCR fallback when CI quota is unavailable, see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Testing

```bash
bun run test:api       # unit + integration (requires DB running)
bun test               # all tests
bun run test:coverage  # with coverage gate (90% api / 80% overall)
```

## Quality Gates

```bash
bun run check          # oxlint + oxfmt
bun run check-types    # TypeScript across all workspaces
bun run build          # production build
```

## Database

```bash
bun run db:start       # start postgres container
bun run db:stop        # stop container
bun run db:migrate     # apply migrations
bun run db:generate    # generate migration from schema changes
bun run db:studio      # Drizzle Studio UI
```

## Project Structure

```
cogito-app/
├── apps/
│   ├── server/        # Elysia HTTP server (port 3001)
│   └── web/           # Vite + React 19 + TanStack Router (port 3000)
├── packages/
│   ├── api/           # Business logic (4-layer: Router → Handler → Service → Repo)
│   ├── auth/          # Better Auth config
│   ├── config/        # Shared TS config
│   ├── db/            # Drizzle schema + migrations (postgres.js driver)
│   ├── env/           # Zod-validated env vars
│   └── ui/            # Selia component library (22 components)
├── docs/              # Architecture context + plans
│   ├── CONTEXT.md     # Single source of truth for architecture
│   ├── DEPLOYMENT.md  # Local/prod setup and deployment runbook
│   └── plans/         # Active + completed plans (see plans/README.md)
└── designs/           # .pen design files
```

See [`docs/CONTEXT.md`](docs/CONTEXT.md) for full architecture details and [`AGENTS.md`](AGENTS.md) for UI component conventions.

## Available Scripts

| Script                  | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `bun run dev`           | Start web + server in dev mode                           |
| `bun run build`         | Build all apps                                           |
| `bun run dev:web`       | Web only                                                 |
| `bun run dev:server`    | Server only                                              |
| `bun run check`         | Oxlint + Oxfmt                                           |
| `bun run check-types`   | TypeScript check (all workspaces)                        |
| `bun run test`          | Run tests                                                |
| `bun run test:api`      | API tests (unit + integration, needs DB)                 |
| `bun run test:coverage` | Tests with coverage gate                                 |
| `bun run db:start`      | Start PostgreSQL Docker container                        |
| `bun run db:stop`       | Stop PostgreSQL container                                |
| `bun run db:migrate`    | Apply migrations                                         |
| `bun run db:generate`   | Generate migration from schema changes                   |
| `bun run db:studio`     | Drizzle Studio UI                                        |
| `bun run seed-packages` | Seed mark package data (local/test or approved recovery) |
