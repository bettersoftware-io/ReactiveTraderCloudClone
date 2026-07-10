# Reactive Trader Redesign — Developer Handoff (v3)

This document explains what the prototype consists of and how to implement it in the
real **Reactive Trader Cloud** client (TypeScript + React + RxJS + styled-components).

---

## 1. What this is (and isn't)

- **Is:** a high-fidelity, interactive *design spec* — a single HTML file driven by a
  small component runtime, running on **mock data** generated client-side.
- **Isn't:** production code. It does not use RxJS, the real domain models, the
  OpenFin/services layer, or the backend. Treat it as the visual + interaction target.

You re-implement the **look, motion, and layout** in the real app; you keep the real
app's data and architecture.

### How to run / inspect
- **Run:** open `prototype/Reactive Trader.html` (self-contained, offline).
- **Edit the source:** `prototype/source/Reactive Trader.dc.html` is the markup + a
  single logic class; `support.js` is its runtime (must sit next to the `.dc.html`).
  All styling is inline; all logic lives in one `class Component`.

---

## 2. Feature inventory

| Area | What it does | Real-app mapping |
|---|---|---|
| **5 themes + dark/light** | holo / holo3d / terminal / terminal3d / neon, switchable live via header dropdown; a ☀/☾ toggle flips dark↔light (orthogonal — every theme has both) | `ThemeProvider`; dark/light = two token objects per theme (see `themes` / `themesLight` in source) |
| **Depth themes** | *3D* themes add gradient panels + layered drop-shadows; tiles & RFQ cards are raised (elevated surface + shadow) in all themes | `panelShadow` / `tileShadow` / `tile` tokens |
| **Boot sequence** | Animated `<canvas>` splash on load; **8 variants** cycled in order, five of them full-3D Jarvis-style scenes, three cursor-tracked | A self-contained `<BootSequence>` React component (canvas code is portable as-is) — see §4 |
| **Dock layout** | Resizable split panels, maximize (smooth ~0.34s animation), collapse-to-strip | Use the real **dockview** library; map panels to dockview panels |
| **Event-driven motion** | FLIP glides (Live Rates tiles on filter, watchlists on sort/re-rank, RFQ cards on reorder), blotter row-insert flash, RFQ ACCEPT pop/pulse | Drive from real RxJS streams; use a FLIP hook / framer-motion layout animations |
| **FX** | Live rate tiles w/ editable notional, exec overlays, RFQ-on-tile, sortable/filterable/exportable blotter | Existing `LiveRates` + `Trades` — restyle; logic already exists in RxJS |
| **Credit** | New-RFQ form, live streaming dealer quotes, accept/expire, blotter | Existing `Credit` flow — restyle |
| **Equities** *(v2)* | Watchlist, candlestick chart, instrument tabs, order ticket, orders/positions blotter | New module — needs real market-data + order services |
| **Admin** *(v2)* | Observability dashboard (throughput, latency, error rate, sessions, event log) | New — wire to real telemetry or a metrics endpoint |
| **Header chrome** | Account dropdown, language selector, notifications, theme picker, env badge | New presentational components |
| **Status bar** | Bottom bar: latency, FPS, connection, session, clock, build | Wire to real perf/connection signals |
| **Preferences** | Modal with a (mostly mock) settings catalogue; the **Animated background** toggle is real (perf) | Persist real prefs; keep the animated-bg perf toggle |
| **Lock screen** | Sign-out → session-lock overlay → re-authenticate | Hook to real auth/session |

---

## 3. Theme system

- **Five** themes (holo, holo3d, terminal, terminal3d, neon), each with a **dark and a
  light** palette. In the source: `themes` (dark) + `themesLight` (light); the active set
  is chosen by a `mode` flag and the theme key. In the real app use a styled-components
  `ThemeProvider` with one object per (theme × mode), or a base theme + mode overrides.
- Tokens are applied as inline `--var`s on the root; `theme-tokens.css` shows the token
  shape (kept as a 3-theme reference — see source for all 10 sets).
- Semantic tokens to preserve: `accent` / `accent2`, `buy` / `sell`, `panel` (translucent
  glass in holo/neon with `backdrop-filter: blur()`, solid in terminal), `glow`,
  `auroraOp`, and the depth tokens `tile` / `tileShadow` / `panelShadow`.
- Fonts: Chakra Petch + JetBrains Mono (holo/neon), IBM Plex Sans/Mono (terminal),
  Orbitron for the wordmark.

## 4. Boot sequence (most directly portable)

Pure `<canvas>` 2D, no dependencies. **Eight** variants live in the source, one draw
function each; selection is sequential, persisted in `localStorage['rt_bootSeq']`
(`['core','laser','docking','hologram','geo','layers','jarvis','topo']` in
`_startBoot`). Duration `DUR = 4200ms`; a SKIP control and a smooth cross-fade hand
off to the app.

| # | key | function | scene |
|---|---|---|---|
| 1 | `core` | `_drawBoot` | wireframe globe + radar ring |
| 2 | `laser` | `_drawBootLaser` | UI panels laser-traced in |
| 3 | `docking` | `_drawBootDocking` | docking-camera HUD (reticles, telemetry) |
| 4 | `hologram` | `_drawBootHologram` | 3D bar-chart core assembling from particles over an emitter pad, gyro rings, callouts |
| 5 | `geo` | `_drawBootGeo` | Western-Europe holo map: traced coastlines, terrain dot-mesh, capital nodes, buy/sell trade arcs |
| 6 | `layers` | `_drawBootLayers` | the UI exploded into 7 z-layers (DevTools-Layers style), panels pull out, cursor-tracked |
| 7 | `jarvis` | `_drawBootJarvis` | dense expo schematic: core sphere, 6-ring machinery, spokes, 14 depth-scattered blueprint fragments, z-breathing, cursor-tracked |
| 8 | `topo` | `_drawBootTopo` | contour-line volatility terrain (marching squares), FX-pair beacons with live ticking prices, cursor-tracked |

Porting notes:
- All 3D variants share one math kernel: a yaw/pitch rotation + perspective divide
  (`const P=(x,y,z)=>…` at the top of each function). Extract it once.
- `layers` / `jarvis` / `topo` add a `window` `mousemove` listener and remove it when
  their rAF loop exits — in React, register/cleanup in the same `useEffect` as the loop.
- `geo` / `topo` precompute geometry once per boot (coastline polylines; 52×36
  heightfield + marching-squares contour segments) and only re-project per frame. Keep
  this split.
- `topo`'s ticking prices poll a deterministic pseudo-random walk per ~300ms tick and
  flash `buy`/`sell` on direction — wire to the real price streams when porting.
- Port as a `<BootSequence onDone=…>` component driven from `requestAnimationFrame` in
  `useEffect`, and respect `prefers-reduced-motion` (skip to app / static splash).

## 5. Layout / dock

- The prototype hand-rolls split panels (drag handles, maximize, collapse-to-vertical-
  strip). **Replace with dockview** in the real app so panels are user-arrangeable and
  future modules dock in. Keep the behavior the prototype demonstrates: blotters pinned
  to the bottom, content panels filling remaining space, maximize collapses siblings to
  strips.

## 6. Motion / feedback principle

The app is **calm until something real happens**. After boot, ambient motion is minimal
(and the animated background is **off by default** for performance — see Preferences).
Feedback animations fire only on real events: price ticks flash the changed digits
(green up / red down), trades/fills/expiries pulse. Preserve this — drive the flashes
from the real RxJS price/trade streams, not timers.

## 7. Mock data → real streams

Everything numeric in the prototype is faked in the logic class (rate walks, RFQ quote
timers, candles, metrics). Replace each with the corresponding real service/RxJS stream.
The shapes to match are visible in the source's seed/factory helpers.

## 8. Suggested build order

1. Theme tokens + `ThemeProvider` + theme switcher.
2. Re-skin existing FX + Credit screens to the new panels/typography.
3. `<BootSequence>` component (start with 1–3, add the 3D scenes incrementally).
4. dockview layout + pinned blotters + maximize/collapse.
5. Header chrome, status bar, preferences, lock screen.
6. New Equities module (needs services).
7. New Admin observability dashboard (needs telemetry).
