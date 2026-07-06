# @rtc/client-prototype

A **readable React port of the Claude Design prototype** at `docs/design/v2`.
Its sole purpose is comprehension: the original prototype is a high-fidelity
design spec whose source is very hard to read; this package re-expresses the
same app as navigable, idiomatic source you can read one folder at a time.

The original stays **canonical** — when the two disagree visually or
behaviorally, the original is right and this port has a fidelity bug.

## How this relates to the original

Surprisingly, both are React apps. They differ in *authoring model*, not
rendering technology:

| | Original (`docs/design/v2`) | This port |
|---|---|---|
| Delivery | One self-contained ~836KB HTML file (offline, fonts + code + React embedded) | Vite app (`pnpm dev` / `pnpm build`) |
| Authoring | `<x-dc>` HTML template with `{{ moustache }}` bindings | 100+ TS/TSX modules, one folder per screen |
| Logic | One ~750-line `class Component` holding the entire app | Hooks + pure view-model functions per feature |
| Styling | Inline `style="…"` attributes in the template | Co-located CSS Modules |
| Rendering | The bespoke "dc-runtime" (`support.js`) parses the template at load time and renders it via the embedded `window.React` | React 19, same elements, written directly |
| Build step | None — the template *is* the program | Vite + TypeScript |

The original's editable source lives at
`docs/design/v2/dev-handoff/prototype/source/` (`Reactive Trader.dc.html`
~1.4k lines + `support.js` ~1.6k lines — the whole app in two files). The
runnable single file is `docs/design/v2/standalone/Reactive Trader.html`.
`docs/design/v2/dev-handoff/HANDOFF.md` describes the design spec itself.

## Tech stack (deliberately minimal)

- **React 19 + react-dom** — the only runtime dependencies.
- **Vite + TypeScript + CSS Modules** — build/authoring tooling.
- **No UI component library, no rxjs, no `@rtc/domain`/`@rtc/shared`** — the
  port is self-contained, like the original. All market data is mock,
  generated client-side by seeded random walks (`mulberry32`), matching the
  original's simulation approach.

## What's here

- `src/shell/` — app chrome: boot sequence (canvas), header, status bar,
  lock screen, preferences, ambient animated background.
- `src/fx/`, `src/credit/`, `src/equities/`, `src/admin/` — the four
  screens, each self-contained.
- `src/layout/` — the hand-wired dock primitives (split panels, maximize,
  collapse-to-strip) shared by the screens.
- `src/theme/` — the 5-skin × dark/light token system.
- `src/motion/` — FLIP glide hook and motion utilities.

## Running

```bash
pnpm --filter @rtc/client-prototype dev     # dev server on port 5273
pnpm --filter @rtc/client-prototype build   # static build to dist/
pnpm --filter @rtc/client-prototype test    # vitest (jsdom)
```

The built site deploys on demand to <https://rtc-clone-proto.vercel.app>
(password-gated) via the **Deploy Prototype** GitHub Action; the original
HTML deploys to <https://rtc-clone-cd-proto.vercel.app> via **Deploy Claude
Design Prototype**. See `deploy/proto/README.md`.

## A hard-won testing lesson

This package once shipped with all its unit tests green while the app
rendered **completely empty** in real browsers: `.shell` used
`min-height: 100vh` (no definite `height`), so every screen's
`height: 100%` resolved to `auto` and all panel bodies collapsed
(fixed in PR #104). jsdom performs no layout, so no unit test can catch
that class of bug. When verifying changes here, load the app in a real
browser and check that the panels actually paint — a green test suite is
not evidence of a rendered screen.
