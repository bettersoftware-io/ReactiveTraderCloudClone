# @rtc/client-prototype

A **readable React port of the Claude Design prototype** at `docs/design/v2`.
Its sole purpose is comprehension: the original prototype is a high-fidelity
design spec whose source is very hard to read; this package re-expresses the
same app as navigable, idiomatic source you can read one folder at a time.

The original stays **canonical** — when the two disagree visually or
behaviorally, the original is right and this port has a fidelity bug.

| | |
|---|---|
| **Ring** | None — outside the rings. A **design-comprehension island**, deliberately excluded from the Clean Architecture diagrams ([§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring), [§13.1](../../docs/architecture/13-codebase-map.md#131-l0----the-system-on-one-screen)) rather than placed in ring ④ alongside the shipping clients. |
| **Runtime deps** | `react`, `react-dom` only (`package.json` `dependencies`) — the whole point is total isolation from `@rtc/*`, so no framework substitution here can ever leak into the product graph. |
| **Consumed by** | Nothing. No other workspace `package.json` lists `@rtc/client-prototype`, and grepping `src/` for `@rtc/` returns zero matches — the import edge doesn't exist in either direction. |
| **Must never import** | Any `@rtc/*` package (`domain`, `shared`, `client-core`, `react-bindings`, `client-react`, `client-react-native`, `ws-effects`, `server`). Not a numbered gate from `docs/architecture/12-architectural-gates.md` — this package sits outside `.dependency-cruiser.cjs`'s scope too — the boundary is structural: `package.json` names only `react`/`react-dom`, and pnpm's strict, per-package `node_modules` makes an unlisted `@rtc/*` import fail to resolve at build time even if someone typed it. |

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

## Folder map

| Path | What lives here |
|---|---|
| `src/shell/` | App chrome: boot sequence, header, status bar, lock screen, preferences, ambient background. |
| `src/fx/` | FX screen: live rates, blotter, analytics — self-contained. |
| `src/credit/` | Credit screen: RFQ form, RFQ/quote cards, blotter — self-contained. |
| `src/equities/` | Equities screen: watchlist, candle chart, order ticket, blotter — self-contained. |
| `src/admin/` | Admin screen: service health, KPIs, latency histogram, throughput chart, live events. |
| `src/layout/` | Hand-wired dock primitives (split panels, maximize, collapse-to-strip) shared by all four screens. |
| `src/mock/` | Seeded random-walk mock data generators (`mulberry32`) and the shared clock hook — no `@rtc/domain`, no rxjs. |
| `src/motion/` | FLIP glide hook and motion utilities. |
| `src/theme/` | The 5-skin × dark/light design-token system. |
| `src/styles/` | Global CSS entry point (`global.css`), loaded once from `main.tsx`. |

## Where to start reading

1. `src/main.tsx` — the entry point: mounts `<App />` in `StrictMode`, nothing else.
2. `src/App.tsx` — the whole app's shape in ~60 lines: `ThemeProvider` → `PreferencesProvider` → `AppShell` + the boot/lock/preferences overlays, wired with plain `useState`.
3. `src/mock/rng.ts` — the seeded PRNG every screen's mock data traces back to; read this before any screen module to understand where the "live" numbers come from.
4. `src/fx/FxScreen.tsx` (or `credit/CreditScreen.tsx`, `equities/EquitiesScreen.tsx`, `admin/AdminScreen.tsx`) — pick one screen folder and read it end to end; each is self-contained, so the pattern you learn there repeats across the other three.

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

## How it's used

Nobody's `package.json` lists `@rtc/client-prototype` (verified above), so
there's no `import` snippet to show — it's used by being *run*, not
imported. The root `package.json` wires it to two independent dev scripts,
one per artifact in the design pair:

```json
"dev:proto": "pnpm --filter @rtc/client-prototype dev",
"dev:design": "node scripts/serve-design.mjs",
```

`dev:proto` starts this package's own Vite dev server on port 5273
(`pnpm --filter @rtc/client-prototype dev`; the port is set in
`vite.config.ts`), rendering this readable React port. `dev:design` runs a
separate zero-dependency Node static server (`scripts/serve-design.mjs`)
that serves the canonical, unrelated artifact this package is a port
*of* — `docs/design/v2/standalone/Reactive Trader.html` — on port 8899.
Run both side by side to compare the port against the source it must stay
faithful to.

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§1.3.1 Clean Architecture rings](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) — explains why this package has no ring
- [§10 Key Design Decisions — "Design prototypes are production-isolated"](../../docs/architecture/10-key-design-decisions.md#10-key-design-decisions)
- [§06 Package Dependencies](../../docs/architecture/06-package-dependencies.md) — `@rtc/client-prototype` drawn as an island with no edges into the dependency graph
