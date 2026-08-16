FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/env/package.json packages/env/
COPY packages/config/package.json packages/config/
COPY packages/e2e/package.json packages/e2e/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS builder
COPY . .
RUN bun run build:server

FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
# C5: run as the unprivileged bun user (rootless container).
USER bun
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD bun -e "const r = await fetch('http://localhost:3001/health'); if (!r.ok) process.exit(1)"

CMD ["bun", "run", "apps/server/dist/index.mjs"]
