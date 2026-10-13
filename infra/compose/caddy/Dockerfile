# Build the web SPA and bake it into the Caddy image that serves it, so
# `docker compose up --build` is fully reproducible with no host build step.
# Build context is the repo root (see docker-compose.yml).

FROM node:24-alpine AS web
WORKDIR /app
COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml ./
RUN npm install --global "$(node -p "require('./package.json').packageManager")" && \
    pnpm install --frozen-lockfile
COPY apps/web/ ./
RUN pnpm run build

FROM caddy:2
COPY --from=web /app/dist /srv
