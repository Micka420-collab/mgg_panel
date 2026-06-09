# ── MGG daemon (Docker control plane) ─────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Only the workspaces this image needs (shared + daemon). No lockfile is committed,
# so npm resolves just these workspaces' deps — fast, and devDeps (tsc) hoist fine.
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/daemon ./apps/daemon
RUN npm install --include=dev --no-audit --no-fund
RUN npm run build:shared && npm run build --workspace @mgg/daemon

# ── Runtime ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/daemon
EXPOSE 8080
CMD ["node", "dist/index.js"]
