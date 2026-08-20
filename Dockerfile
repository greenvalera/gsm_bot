# syntax=docker/dockerfile:1
FROM node:24.19-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json ./
RUN DATABASE_URL=postgresql://build-only:build-only@localhost:5432/gsmbot npm run db:generate

COPY src ./src
RUN npm run build:runtime
RUN test -d node_modules/geo-tz/data \
  && node --input-type=module -e 'import { find } from "geo-tz/dist/find-now"; const zones = find(47.650499, -122.350070); if (!Array.isArray(zones) || zones.length === 0) process.exit(1)'

# Compose uses this unpruned build stage for the one-shot committed migration.
FROM build AS migrate

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:24.19-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system gsmbot \
  && useradd --system --gid gsmbot --home-dir /app --no-create-home gsmbot

COPY --from=production-dependencies --chown=gsmbot:gsmbot /app/package.json ./
COPY --from=production-dependencies --chown=gsmbot:gsmbot /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=gsmbot:gsmbot /app/dist ./dist

# geo-tz loads its polygon boundary data from disk; prove the runtime copy kept it.
RUN test -d node_modules/geo-tz/data \
  && node --input-type=module -e 'import { find } from "geo-tz/dist/find-now"; const zones = find(47.650499, -122.350070); if (!Array.isArray(zones) || zones.length === 0) process.exit(1)'

USER gsmbot

CMD ["node", "dist/app/main.js"]
