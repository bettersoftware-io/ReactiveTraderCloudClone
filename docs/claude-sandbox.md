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
| `packages/client-react/node_modules` | the real host-FS dir (darwin install) | its own ext4 Docker volume (linux install) |
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
| `packages/*/node_modules` (all 10 workspace packages + `tests`) | ❌ shared → isolate |
| `packages/*/dist` (×9 — every emitting package; the RN client builds with `tsc --noEmit`, so no `dist`) | ❌ shared → isolate |
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

## The change: a repo-versioned isolation config

The isolation is **declared in this repo**, not hard-coded in the launcher — so
the reusable `claude-sandbox` launcher stays generic across all projects. The
launcher owns the *mechanism* (turn a list of paths into project-keyed Docker
volumes); each repo owns the *policy* (which paths it needs isolated), via an
optional `.claude-sandbox.json` at its root.

This repo ships [`.claude-sandbox.json`](../.claude-sandbox.json) — every
**directory** a container `pnpm install` / build / test would otherwise write onto
the bind mount: each workspace package's `node_modules` (including the top-level
`tests` package) and `dist`, the per-package and root `.turbo` caches, pnpm's
project-local `.pnpm-store` fallback:

```json
{
  "isolate": [
    "packages/domain/node_modules",
    "packages/shared/node_modules",
    "packages/client-core/node_modules",
    "packages/react-bindings/node_modules",
    "packages/client-react/node_modules",
    "packages/client-react-native/node_modules",
    "packages/ws-effects/node_modules",
    "packages/client-prototype/node_modules",
    "packages/server/node_modules",
    "tests/node_modules",
    "packages/domain/dist",
    "packages/shared/dist",
    "packages/client-core/dist",
    "packages/react-bindings/dist",
    "packages/client-react/dist",
    "packages/ws-effects/dist",
    "packages/client-prototype/dist",
    "packages/server/dist",
    ".pnpm-store",
    ".turbo",
    "packages/domain/.turbo",
    "packages/shared/.turbo",
    "packages/client-core/.turbo",
    "packages/react-bindings/.turbo",
    "packages/client-react/.turbo",
    "packages/client-react-native/.turbo",
    "packages/ws-effects/.turbo",
    "packages/client-prototype/.turbo",
    "packages/server/.turbo",
    "tests/.turbo"
  ]
}
```

On launch, for each listed (project-relative) path the launcher creates a Docker
volume keyed to `project-path + sub-path` and mounts it there, shadowing the bind
mount **inside the container only**. Paths are sanitised: leading slashes are
stripped, `..` traversal is rejected, and the root `node_modules` is ignored (the
launcher already isolates it + the pnpm store automatically). Repos **without**
the file behave exactly as before — root `node_modules`/pnpm store isolation only.

**Only directories can be isolated** — a Docker volume is a directory, so a single
file (e.g. the `tsc --build` incremental cache) cannot be mounted; mounting a
volume at a file path makes `tsc` see a directory and breaks the build. This
matters for `tsconfig.tsbuildinfo`: by default it sits at the **package root**
(shared bind mount) while `dist/` is **isolated**. A build in one environment
then writes a `tsbuildinfo` claiming "up to date" that the *other* environment's
`tsc --build` reads — so it skips emit and leaves an **empty `dist/`** (which
breaks the client's vite/rolldown build with `failed to resolve "@rtc/domain"`).

This is fixed by relocating the incremental cache **into** the already-isolated
`dist/`, so it travels with the outputs it describes and each environment keeps
its own: each of `packages/{domain,shared,server}/tsconfig.json` sets
`"tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"`. (Set per-package, not in
`tsconfig.base.json`, to avoid two composite configs in one package — e.g. the
client's `tsconfig.json` + `tsconfig.types.json` — colliding on one path.) If you
ever hit an empty `dist/` after switching environments, `turbo run build --force`
re-emits.

**When a new package is added**, add its `node_modules`, its `.turbo` cache, and —
if it emits one — its `dist` entry to `.claude-sandbox.json`; no launcher edit, no
host-side change. (A `tsc --noEmit` package such as `@rtc/client-react-native` has
no `dist` to isolate; a tsc-build or Vite package such as `@rtc/client-core` or
`@rtc/client-prototype` does.) That's the whole point of keeping the policy in the
repo.

> Requires a launcher new enough to read `.claude-sandbox.json` (it parses the
> file with `python3` right after the built-in root-`node_modules` isolation). On
> an older launcher the file is simply ignored — harmless, but per-package dirs
> stay shared until the launcher is updated.

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
rtc-reports:$REPO/packages/client-react/reports
```

## Desktop notifications from inside the container

Claude Code's `Notification` hook (in `~/.claude/settings.json`) pops a macOS
notification when Claude needs your attention. On the **host** it shells out to
`osascript`; **inside the container** `osascript` doesn't exist, so the hook
falls back to emitting a terminal **OSC escape** that the terminal turns into a
desktop notification.

Two things make that fall-back actually reach Ghostty:

1. **It runs under host tmux.** You launch `claude-sandbox` from a tmux pane, and
   tmux *swallows* bare OSC sequences. `set -g allow-passthrough on`
   (in `~/dotfiles/tmux/.tmux.conf`) is necessary **but not sufficient** — it only
   enables the *explicit* passthrough envelope. The sequence must be **wrapped**:
   `\ePtmux;<payload with every ESC doubled>\e\\`. The hook emits both a raw and a
   wrapped OSC 777 so it works in a plain Ghostty tab *and* through tmux.

2. **The hook runs detached** (no controlling terminal → `/dev/tty` gives ENXIO).
   It targets the real session pty via
   `$(readlink /proc/1/fd/0 2>/dev/null || echo /dev/tty)`.

Gotchas:

- **Ghostty only shows a banner when it's *unfocused*** (another app frontmost).
  When focused, the notification goes silently to Notification Center — don't
  mistake that for "broken."
- **`settings.json` is bind-mounted read-only and can go stale.** The host path is
  a symlink into `~/dotfiles`, and editing it atomic-replaces the inode; a running
  container keeps the old one. **Relaunch `claude-sandbox`** after changing the
  hook for it to take effect.

Quick manual test from a tmux pane (unfocus Ghostty first):

```sh
printf '\033Ptmux;\033\033]777;notify;Test;hi\007\033\\' > "$(tmux display -p '#{pane_tty}')"
```
