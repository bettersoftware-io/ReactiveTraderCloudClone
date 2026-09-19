# Single-stage build. The monorepo's pnpm workspace symlinks (@rtc/domain,
# @rtc/shared resolved from their dist/) resolve at runtime, so we keep the
# whole installed workspace rather than risk a fragile cross-stage copy. Image
# size is irrelevant for a demo server.
# Pinned by DIGEST as well as tag: a tag is mutable (node:26-slim is re-pushed on
# every Debian base refresh), a digest is not — so the image Fly builds from is
# the one that was reviewed. This is the multi-arch INDEX digest, so it resolves
# on linux/amd64 (Fly) and linux/arm64 (a local build on Apple silicon) alike.
# Renovate's docker manager bumps a pinned digest like any other dependency,
# behind the same 24h cooldown. (OpenSSF Scorecard PinnedDependencies; ADR-007.)
FROM node:26-slim@sha256:3a771f83944bb763050c23c0225c260638c4b7899e7a72485ef75e5e570499e5

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

# node:26-slim no longer bundles Corepack, so install it first (pinned to the
# same version CI uses), then enable it to provide the pnpm version pinned in
# package.json's packageManager field.
RUN npm install -g corepack@0.35.0 && corepack enable

# Copy the whole repo (the .dockerignore keeps it lean), install, build server.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@rtc/server

ENV PORT=4000
ENV HOSTNAME=0.0.0.0
EXPOSE 4000

CMD ["node", "packages/server/dist/index.js"]
