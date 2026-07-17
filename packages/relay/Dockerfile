# syntax=docker/dockerfile:1

# Self-host image for the Soromi relay: a stateless, content-blind WebSocket pipe.
# Build from the repo root: `docker build -f packages/relay/Dockerfile -t soromi-relay .`

# --- build: compile TypeScript to JS, isolated from the monorepo ---
FROM node:22-alpine AS build
WORKDIR /app
# The relay's tsconfig extends the repo base, so mirror that layout for tsc to resolve it.
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/relay/package.json packages/relay/tsconfig.json ./packages/relay/
WORKDIR /app/packages/relay
# Runtime deps plus a compiler (typescript lives at the monorepo root, not in the relay package).
RUN npm install --no-audit --no-fund \
  && npm install --no-save --no-audit --no-fund typescript@5
COPY packages/relay/src ./src
RUN npm run build

# --- runtime: production deps + compiled output only ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY packages/relay/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/packages/relay/dist ./dist

# The relay listens on 8787 by default; PORT overrides it.
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O- "http://127.0.0.1:${PORT:-8787}/health" || exit 1
USER node
CMD ["node", "dist/index.js"]
