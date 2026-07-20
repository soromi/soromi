# Self-host image for the Soromi web PWA.
# Build from the repo root: `docker build -f packages/web/Dockerfile -t soromi-web .`

# --- build: compile the workspace bundle with pnpm ---
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

# Manifests first so `pnpm install` caches until a dependency actually changes. Every workspace
# package.json must be present for the lockfile to validate, even though the filter installs only, Add new packages here.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/client/package.json ./packages/client/
COPY packages/ui/package.json ./packages/ui/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/gui/package.json ./packages/gui/
COPY packages/relay/package.json ./packages/relay/
COPY apps/desktop/package.json ./apps/desktop/

RUN pnpm install --frozen-lockfile --filter @soromi/web...

# Source for the four packages the bundle needs. client and ui are consumed as source (Vite
# transforms them); protocol has a real build step.
COPY packages/protocol ./packages/protocol
COPY packages/client ./packages/client
COPY packages/ui ./packages/ui
COPY packages/web ./packages/web

RUN pnpm --filter @soromi/protocol build && pnpm --filter @soromi/web build

# --- runtime: the built bundle plus the Express server's own deps only ---
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install the two serve-time deps fresh so the frontend libraries never enter the runtime image.
RUN npm install --omit=dev --no-audit --no-fund express@^5 compression@^1

COPY packages/web/server.mjs ./server.mjs
COPY --from=build /app/packages/web/dist ./dist

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O- "http://127.0.0.1:${PORT:-8080}/" >/dev/null || exit 1

USER node

CMD ["node", "server.mjs"]
