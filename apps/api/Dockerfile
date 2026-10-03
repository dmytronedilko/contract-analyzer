# syntax=docker/dockerfile:1
# API image, built from the repository root: docker buildx bake api

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
# pnpm comes from the packageManager field via corepack (bundled with Node 24).
RUN corepack enable

# Reduce the monorepo to the API and the workspace packages it depends on.
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.4 prune @repo/api --docker

FROM base AS builder
WORKDIR /repo
# Dependency manifests first, so the install layer is cached until they change. No install
# scripts run here: the root `prepare` (git hooks) needs git, and nothing this build uses needs one.
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /repo/out/full/ .
# Root files that turbo prune doesn't carry over.
COPY tsconfig.base.json ./
RUN pnpm turbo run build --filter=@repo/api
# A self-contained copy with production dependencies only, including the built @repo/db
# (and its drizzle/ migrations, used by the migrate service).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @repo/api deploy --prod --ignore-scripts /prod/api

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runner
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    PORT=3001 \
    GIT_SHA=${GIT_SHA}
# Debian security fixes the pinned base image doesn't include yet. npm and corepack only matter at
# build time: removing them keeps their bundled dependencies, and their vulnerabilities, out.
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
    /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=builder --chown=node:node /prod/api .
USER node
EXPOSE 3001
# No curl in the image: the healthcheck uses Node's fetch.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
