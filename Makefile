.PHONY: dev dev-web dev-server build install lint format check typecheck \
       test test-api test-e2e test-e2e-ui test-coverage test-coverage-html \
       db-push db-studio db-generate db-migrate db-start db-stop db-down \
       seed seed-packages clean help

.DEFAULT_GOAL := help

help:            ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Development ────────────────────────────────────────────────────────────────

dev:             ## Start all dev servers (web + server)
		bun run dev

dev-web:         ## Start web dev server only
		bun run dev:web

dev-server:      ## Start server dev server only
		bun run dev:server

# ── Build ───────────────────────────────────────────────────────────────────────

install:         ## Install dependencies
		bun install

build:           ## Build all packages
		bun run build

# ── Lint & Format ───────────────────────────────────────────────────────────────

lint:            ## Lint code (oxlint)
		bun run lint

lint-fix:        ## Lint and auto-fix
		bun run lint:fix

format:          ## Format code (oxfmt)
		bun run format

check:           ## Lint + format check
		bun run check

typecheck:       ## Type-check all packages
		bun run check-types

# ── Tests ────────────────────────────────────────────────────────────────────────

test:            ## Run unit tests only
		bun test packages/api/src/tests/unit/ apps/server/src/openapi.test.ts

test-api:        ## Run all API tests (unit + integration) with env
		bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts

test-e2e:        ## Run E2E tests (Playwright)
		bun run test:e2e

test-e2e-ui:     ## Run E2E tests with Playwright UI
		bun run test:e2e:ui

test-coverage:   ## Run unit tests with coverage
		bun test --coverage packages/api/src/tests/unit/ apps/server/src/openapi.test.ts

test-coverage-html: ## Run unit tests with HTML coverage report
		bun test --coverage --env-file apps/server/.env packages/api/src/tests/unit/ apps/server/src/openapi.test.ts && \
		bunx coverage-istanbul report --include=coverage/coverage-final.json --reporter=html --dir=coverage/html

# ── Database ──────────────────────────────────────────────────────────────────────

db-push:         ## Push schema to database
		bun run db:push

db-studio:       ## Open Drizzle Studio
		bun run db:studio

db-generate:     ## Generate migrations
		bun run db:generate

db-migrate:      ## Run migrations
		bun run db:migrate

db-start:        ## Start database container
		bun run db:start

db-stop:         ## Stop database container
		bun run db:stop

db-down:         ## Tear down database container
		bun run db:down

# ── Seed ──────────────────────────────────────────────────────────────────────────

seed:            ## Seed the database
		bun run -F server seed

seed-packages:   ## Seed packages data
		bun run seed-packages

# ── Clean ─────────────────────────────────────────────────────────────────────────

clean:           ## Remove build artifacts and caches
		rm -rf packages/*/dist apps/*/dist apps/web/dist coverage .turbo node_modules/.cache