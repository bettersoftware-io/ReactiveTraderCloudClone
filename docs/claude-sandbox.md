# Dev environment: macOS WebStorm + Linux claude-sandbox container

This repo is commonly worked on from **two places at once**:

- **macOS / WebStorm** — editing, IntelliSense, git.
- **A Linux Docker container** (the "claude-sandbox") — where long agent-driven
  runs, installs, builds, and browser tests happen.

Both point at the **same source tree** via a Docker bind mount, so edits made in
the container appear live in WebStorm and vice-versa. The friction is everything
that is **not** source: `node_modules`, `dist`, and caches are either
OS-specific (native binaries) or large build outputs, and a single shared copy
cannot serve both a Linux container and the macOS host. This doc explains how to
keep them separated so both environments work independently against one source
tree.

> Scope note: the sandbox launcher itself lives **outside this repo** (on the
> Mac, e.g. `~/claude-sandbox/`), so it can't be edited from inside the
> container. This doc is the reference to apply those host-side changes from the
> Mac.

---

## The core idea

A Docker volume mounted at a sub-path **shadows the bind mount underneath it —
but only inside the container.** So the *same* host path resolves to two
different places:

| Path | macOS (WebStorm) sees | Container sees |
|---|---|---|
| `packages/client/node_modules` | the real host-FS dir (darwin install) | its own ext4 Docker volume (linux install) |
| `src/**/*.ts`, configs (no volume) | shared host file | the same shared host file |

Neither side can observe or clobber the other's `node_modules`/`dist`, while
source stays shared and live. That is the entire pattern.

### Why a shared `node_modules` can't work

`node_modules` contains **OS-specific native binaries** — in this repo, the
linux-arm64 builds of `@esbuild/*`, `@rollup/rollup-linux-arm64-gnu`,
`@turbo/linux-arm64`, `lightningcss-linux-arm64`, `rolldown`, plus Cypress's
Electron. These **cannot run on macOS**. A `node_modules` installed inside the
container is therefore not a valid macOS install (and vice-versa). They must be
separate.

### What is NOT OS-specific

TypeScript itself (`tsserver.js`) and all `.d.ts` files (including `@types/*`)
are plain JavaScript/text. WebStorm's IntelliSense only reads those and never
executes the native binaries — which is why type-checking can work cross-OS even
against a linux-installed tree, as long as the resolver can follow the symlinks.

---

## Current state (what's already isolated)

The sandbox already mounts a Docker volume over the **root** `node_modules`
(visible as an `ext4` filesystem inside the container; empty on the Mac). The
gap is the rest of the monorepo, which is still on the shared bind mount:

| Path | Status |
|---|---|
| `node_modules` (root) | ✅ already a container-only volume |
| `packages/*/node_modules` (domain, shared, client, server) | ❌ shared → isolate |
| `packages/*/dist` (×4) | ❌ shared → isolate |
| `.turbo` | ❌ shared → isolate |

All of these are gitignored, so isolating them creates no commit noise.

Verify at any time from inside the container — `ext4` = isolated volume,
`fakeowner` = shared host bind mount:

```bash
for d in node_modules packages/*/node_modules packages/*/dist .turbo; do
  [ -e "$d" ] && echo "$d -> $(df -T "$d" | awk 'NR==2{print $2}')"
done
```

---

## The change: extend volume isolation to the whole workspace

Add this to the sandbox launcher (on the Mac) before its `docker run`. Use
**named** volumes so they persist across launches (no reinstall every time) —
same style as the existing global-npm volume:

```bash
REPO=/Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone

# Container-only volumes: Linux deps/builds never touch the Mac's copies.
RTC_VOLS=(
  "rtc-nm-root:$REPO/node_modules"                  # may already exist
  "rtc-nm-domain:$REPO/packages/domain/node_modules"
  "rtc-nm-shared:$REPO/packages/shared/node_modules"
  "rtc-nm-client:$REPO/packages/client/node_modules"
  "rtc-nm-server:$REPO/packages/server/node_modules"
  "rtc-dist-domain:$REPO/packages/domain/dist"
  "rtc-dist-shared:$REPO/packages/shared/dist"
  "rtc-dist-client:$REPO/packages/client/dist"
  "rtc-dist-server:$REPO/packages/server/dist"
  "rtc-turbo:$REPO/.turbo"
)
VOL_ARGS=()
for v in "${RTC_VOLS[@]}"; do VOL_ARGS+=( -v "$v" ); done

# then: docker run ... "${VOL_ARGS[@]}" ...
```

When a new package is added (e.g. `packages/mobile`), add two lines — its
`node_modules` and `dist`.

### One-time setup after wiring it

1. **In the container** (the new per-package volumes start empty):
   `pnpm install` once to repopulate the workspace symlinks into the isolated
   dirs.
2. **On the Mac, natively:** `pnpm install` (and `pnpm build` if you want
   `dist`). This writes the **darwin** binaries and a real `node_modules` to the
   host-FS directories — exactly what WebStorm reads. The container keeps its
   linux-arm64 builds. No interference.

---

## WebStorm: making IntelliSense resolve modules

Symptom: `TS2307: Cannot find module 'react'` (or most modules) across files,
while the CLI build is green.

Root cause is usually one of:

1. **No Mac-side `node_modules`.** If the root `node_modules` is a container-only
   volume and you've never run a native `pnpm install`, the Mac side is empty and
   nothing resolves. Fix: the native `pnpm install` above.
2. **The TypeScript service points at the wrong TS.** This repo uses
   `moduleResolution: "bundler"` (see `tsconfig.base.json`) with a recent
   TypeScript. Under `bundler`, the TS *language service* is the sole resolver,
   so WebStorm's older bundled TS can report phantom errors. Point it at the
   workspace TypeScript: **Settings → Languages & Frameworks → TypeScript →
   TypeScript:** field.
   - pnpm makes `node_modules/typescript` a **symlink**, and WebStorm's directory
     picker won't descend into it. **Paste the real resolved path** instead
     (⌘⇧G in the macOS file dialog lets you paste):
     ```
     <repo>/node_modules/.pnpm/typescript@<version>/node_modules/typescript
     ```
   - Then restart the TS service (TS widget in the status bar → Restart).
3. **Stale index** after an install: File → Invalidate Caches… → Invalidate and
   Restart. Ensure `node_modules` isn't marked *Excluded*.

Also set **Settings → Languages & Frameworks → Node.js** → Node interpreter +
**Package manager = pnpm**, and open the project at the **repo root** so it sees
the workspace and all per-package `tsconfig.json`s.

---

## Things to avoid

- **Don't set `node-linker=hoisted` in `.npmrc`** to "fix" IDE resolution. The
  repo relies on pnpm's strict symlinked layout to enforce the architectural
  guard (`@rtc/domain` may depend on `rxjs` *only* — enforced at install time;
  see `CLAUDE.md`). A flat/hoisted tree makes every transitive package importable
  from anywhere and silently defeats that guard. The volume-isolation approach
  here keeps strict mode intact on **both** sides, because each runs its own real
  `pnpm install` with the same `.npmrc`.

## Optional extras

If you ever run browser tests on **both** sides (today they're container-only,
because Cypress busy-spins on aarch64 — Playwright is the local driver), also add
volumes for the browser caches:

```
rtc-pwct-cache:$REPO/packages/client/tests/ui/visual/playwright-ct/host/.cache
rtc-reports:$REPO/packages/client/reports
```
