FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
COPY packages/env/package.json packages/env/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/e2e/package.json packages/e2e/
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS builder
COPY . .
ENV VITE_SERVER_URL=/rpc
RUN bun run build:web

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
