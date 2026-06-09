# ── MGG Discord control bot ──────────────────────────────────────────────
# Self-contained image. Build context is this directory (apps/discord-bot):
#   docker build -t mgg/discord-bot apps/discord-bot
#
# Multi-stage: compile the TypeScript in a build stage, then ship only the
# runtime (node_modules + dist) in a slim final image.

# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install all deps (incl. typescript) using the lockfile when present.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Compile src/*.ts -> dist/*.js
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production

# Production-only dependencies.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Compiled output.
COPY --from=build /app/dist ./dist

# The bot registers its global slash commands on boot, then logs in.
CMD ["node", "dist/index.js"]
