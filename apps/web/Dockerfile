FROM oven/bun:1.4.0 AS deps
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
# W4: the API lives on a different origin than the frontend (api.cogitoacademy.id
# vs app.cogitoacademy.id) and nginx.conf has no /rpc proxy, so VITE_SERVER_URL
# MUST be an absolute URL. A relative value like /rpc would (a) fail the
# z.url() env validation at bundle load and (b) resolve against the frontend
# origin (app.cogitoacademy.id/rpc), which the static nginx container does not
# route to the API.
# CI passes the per-environment value via --build-arg (cd-prod/cd-staging).
ARG VITE_SERVER_URL=https://api.cogitoacademy.id
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN bun run build:web

# C5: pin the nginx base to a digest and run as the unprivileged nginx user.
# The pid/cache dirs are made writable by nginx so the master can drop
# privileges after startup.
FROM nginx:alpine@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3 AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
RUN touch /var/run/nginx.pid \
  && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /etc/nginx/conf.d /usr/share/nginx/html
USER nginx
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
