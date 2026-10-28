# syntax=docker/dockerfile:1.7
# One image per app, three targets from one install: `api`, `worker`, `dashboard`. The API and the worker run from
# the TypeScript sources exactly as `pnpm api` and `pnpm worker` do (swc-node and tsx with the @zenthos/source
# condition): the Temporal workflow bundle resolves the libraries' sources the same way (libs/adapters/temporal), so
# a compiled copy would need a second resolution path. Built by .github/workflows/images.yml, pulled by
# infra/hetzner/zenthos/compose.yaml (ADR 017).

FROM node:24-bookworm-slim AS base
ENV CI=true NX_DAEMON=false
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@11.5.0 --activate
WORKDIR /app
# The store first, from the lockfile alone, so a source change does not download the world again.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile

FROM base AS dashboard-build
RUN pnpm nx build @zenthos/dashboard --configuration production --skip-nx-cache --output-style=static

# Static files behind nginx; the API is reached at /api on the same origin (environment.production.ts).
FROM nginx:1.27-alpine AS dashboard
COPY infra/hetzner/zenthos/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=dashboard-build /app/dist/apps/dashboard/browser /usr/share/nginx/html
EXPOSE 80

FROM base AS api
ENV SWC_NODE_PROJECT=apps/api/tsconfig.lib.json NODE_ENV=production
USER node
EXPOSE 3200
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:3200/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--import", "@swc-node/register/esm-register", "--conditions=@zenthos/source", "apps/api/src/main.ts"]

# The worker clones repositories, runs their allowed commands and Claude Code (the Agent SDK's bundled binary, on
# node). Toolchains the repository profiles' commands need are added here: bun for Legal Connect.
FROM base AS worker
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
ENV NODE_ENV=production HOME=/home/node
RUN mkdir -p /srv/sandboxes /srv/claude-code && chown -R node:node /srv/sandboxes /srv/claude-code
USER node
CMD ["node_modules/.bin/tsx", "--conditions=@zenthos/source", "apps/worker/src/main.ts"]
