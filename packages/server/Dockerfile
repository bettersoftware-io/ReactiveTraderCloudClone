# Single-stage build. The monorepo's pnpm workspace symlinks (@rtc/domain,
# @rtc/shared resolved from their dist/) resolve at runtime, so we keep the
# whole installed workspace rather than risk a fragile cross-stage copy. Image
# size is irrelevant for a demo server.
FROM node:26-slim

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
