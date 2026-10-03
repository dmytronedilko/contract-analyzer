# syntax=docker/dockerfile:1
# Web image, built from the repository root: docker buildx bake web

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.4 prune @repo/web --docker

FROM base AS builder
WORKDIR /repo
# No install scripts: the root `prepare` (git hooks) needs git, and the build needs none.
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /repo/out/full/ .
# Root files that turbo prune doesn't carry over.
COPY tsconfig.base.json ./
# NEXT_PUBLIC_* values are inlined into the client bundle at build time; everything else
# (BACKEND_URL, DATABASE_URL, secrets) is read at runtime, so one image serves every environment.
ARG NEXT_PUBLIC_MAX_UPLOAD_MB=25
ENV NEXT_PUBLIC_MAX_UPLOAD_MB=${NEXT_PUBLIC_MAX_UPLOAD_MB}
RUN pnpm turbo run build --filter=@repo/web

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Debian security fixes the pinned base image doesn't include yet. npm and corepack only matter at
# build time: removing them keeps their bundled dependencies, and their vulnerabilities, out.
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
    /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
# output: 'standalone' traces exactly the files the server needs, workspace packages included.
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
