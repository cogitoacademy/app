## PR B — Local Dev / Test Parity

### Task B1: Reconcile DB URLs to one default

**Files:**

- Modify: `apps/server/.env`
- Modify: `packages/api/src/tests/test-setup.ts`

**Interfaces:**

- Produces: `docker compose up -d` (in `packages/db`) yields a DB that `.env` and tests both use, so integration tests run locally.

- [ ] **Step 1:** Align the committed `.env` with `.env.example` + `docker-compose.yml` (which already agree on `localhost:6767/cogito-app`).

Edit `apps/server/.env` line 1:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/cogito-test
```

→

```
DATABASE_URL=postgresql://postgres:password@localhost:6767/cogito-app
```

Verify rest of `.env` matches `.env.example` (PORT 3001, CORS_ORIGIN http://localhost:3000, PAYMENT_PROVIDER=stub, NODE_ENV=development).

- [ ] **Step 2:** Align `test-setup.ts` default so tests can run without a `.env` override.

Edit `packages/api/src/tests/test-setup.ts` line 1:

```
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
```

→

```
process.env.DATABASE_URL ??= "postgresql://postgres:password@localhost:6767/cogito-app";
```

- [ ] **Step 3:** Verify local DB works end to end.

Run:

```bash
bun run db:start
bun run db:migrate
bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-solo.test.ts
```

Expected: integration test passes against local Postgres on 6767.

- [ ] **Step 4: Commit**

```bash
git add apps/server/.env packages/api/src/tests/test-setup.ts
git commit -m "fix(dev): reconcile DB URLs across .env, docker-compose, and test setup"
```

### Task B2: Add test database compose file (DEFERRED-OPS 1.8)

**Files:**

- Create: `docker-compose.test.yml` (repo root)

**Interfaces:**

- Produces: isolated Postgres+Redis for tests, mirrors CI services.

- [ ] **Step 1:** Create `docker-compose.test.yml`:

```yaml
name: cogito-app-test

services:
  postgres:
    image: postgres:16-alpine
    container_name: cogito-app-postgres-test
    environment:
      POSTGRES_DB: cogito-app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "6767:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: cogito-app-redis-test
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  cogito-app_postgres_data:
```

- [ ] **Step 2:** Add script to `packages/db/package.json` (match existing `db:start` style):

```json
"db:test": "docker compose -f ../../docker-compose.test.yml up -d"
```

Verify: `bun run db:test`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.test.yml packages/db/package.json
git commit -m "test: add docker-compose.test.yml for local Postgres + Redis"
```

---

## PR C — Correctness Bugs
