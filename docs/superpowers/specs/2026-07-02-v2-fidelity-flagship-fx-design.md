# v2 Design Fidelity — Flagship Slice (Fonts + Global Chrome + FX Screen)

**Date:** 2026-07-02
**Status:** Approved
**Prototype (source of truth):** `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` (theme table: `this.themes` / `this.themesLight`; standalone render: `docs/design/v2/standalone/Reactive Trader.html`)

## 1. Problem

The merged HUD-redesign workstream ported the **v1 color tokens** but almost none of the
chrome, typography, or effects that give the v2 prototype its identity. Side-by-side
screenshots (prototype vs app, both in "holo") show the gap:

1. **Fonts never load.** `tokens.ts` names Chakra Petch / JetBrains Mono / IBM Plex, but
   nothing loads them — no font links in `index.html`, no `@font-face`. Every theme falls
   back to system sans/mono.
2. **Component chrome is flat.** v2 gives *every* theme a gradient tile surface
   (`tile: linear-gradient(…)`) with layered shadows (`tileShadow`), framed panels, glowing
   header tabs, inset price boxes, chips. The app token schema has no
   `--tile`/`--tile-shadow`/`--panel-shadow` keys, so tiles render as flat text on dark.
3. **Glow unused where it matters** — KPI headline, exposure bubbles, tab underlines,
   chips. The aurora background is effectively invisible.
4. **Layout doesn't fill the viewport** — dead band below the blotter.
5. **Header chrome diverges** — four large segmented theme buttons instead of the compact
   dropdown; no logo mark; thin status bar.
6. **v2 light palettes differ** from the app's hand-derived light variants.

This slice restores the "wow" on the flagship path: fonts + global chrome + the FX screen,
across the four existing skins (`classic`, `holo`, `terminal`, `neon`), dark **and** light.

## 2. Scope

**In:** token-schema extension + v2 value refresh; self-hosted fonts; panel/header/status-bar/
chip/aurora/layout chrome; fully-faithful FX tile restructure; FX Analytics + Positions +
Blotter restyle; Live Rates FLIP filter motion; `holo` becomes the default skin; contract/e2e/
golden updates.

**Out (follow-up phases):** `holo3d` / `terminal3d` skins (schema becomes ready here);
Credit / Equities / Admin per-module fidelity; preferences-catalogue parity; lock-screen
polish.

## 3. Architecture decision

**Extend tokens, then restyle** (chosen over per-skin CSS overrides). All skin knowledge
stays in `ui/shell/theme/tokens.ts`; components consume only semantic custom properties via
their co-located CSS modules. Preserves the ADR invariant *"adding a skin = one token entry
+ one switcher option"* and the React→Solid portability contract (CSS modules port verbatim).

## 4. Design

### 4.1 Token layer

`ThemeTokens` grows by ~5 keys (35 → ~40):

| New key | Meaning | Notes |
|---|---|---|
| `--tile` | Tile surface fill (gradient in every non-classic skin) | replaces flat `--bg-tile` on tiles; `--bg-tile` stays for back-compat consumers |
| `--tile-shadow` | Layered tile shadow incl. inset top highlight | `none` for classic |
| `--panel-shadow` | Panel-level shadow | `none` for flat skins; ready for 3d skins |
| `--chip` | (exists) chip fill — may become a gradient per skin | value refresh only |
| `--font-logo` | Orbitron for wordmark/KPI display | classic keeps system-ui |

All four skins × two modes get values **1-to-1 from the v2 source theme table** — including
the real v2 light palettes (e.g. holo light accent `#0096b3`, not the derived `#00b4cc`).
`classic` keeps neutral values for new keys (no gradient, no shadow) and remains the
pre-redesign look. `tokens.test.ts` extends to the new keys (every skin×mode defines every
key; classic stays neutral).

### 4.2 Fonts

Self-hosted via `@fontsource/*` packages, exact prototype families + weights:

- Chakra Petch 400/500/600/700 · JetBrains Mono 400/500/700
- IBM Plex Sans 400/500/600 · IBM Plex Mono 400/500/600
- Orbitron 500/700/900

Imported from `src/index.css` (or `main.tsx`) so Vite bundles the woff2 — no network fetch;
CI visual goldens stay deterministic; offline dev works. All OFL-licensed. Dep hygiene:
`pnpm outdated -r` freshness check per repo convention (24h `minimumReleaseAge` respected).

### 4.3 Global chrome

- **Panels** (dock panels, all screens): 1px `--border` frame, `--panel` fill +
  `backdrop-filter: blur(var(--panel-blur))`, `--panel-head` header strip, active-tab accent
  underline + `--glow`, radius, `--panel-shadow`.
- **Aurora**: `AmbientBackground` tuned so v2 opacities are actually visible (holo dark 0.6).
- **Header**: segmented theme buttons → compact dropdown (skin name + color-dot swatches,
  e.g. "Holo HUD ▾"); hexagon logo mark; letterspaced wordmark in `--font-logo`; tightened
  LIVE/PROD badges.
- **Status bar**: dense mono cells with separators — connection, gateway, LAT, FPS, MEM,
  POS, P&L, SES, build, clock (existing signals only; no new ports).
- **Layout fill**: dock stretches to viewport height (flex column; blotter row takes
  remaining space) — removes the dead band.
- **Chips**: shared pill treatment (outline + `--chip` fill + mono label) used by the FX
  currency filter now, reusable by other screens later.

### 4.4 FX screen — fully faithful

**SpotTile restructure (view layer only):**

- Header row: pair (display font) + direction/pip badge.
- Inset notional field: currency prefix, mono value, reset glyph.
- Two large **clickable price boxes** — SELL left, BUY right; the price *is* the button
  (replaces passive prices + separate Buy/Sell buttons). Big-figure digits rendered in a
  filled sell/buy-colored block; spread badge sits between the boxes.
- Sparkline retained; footer: `SPT <date>` + notional summary.
- Tile surface: `--tile` gradient + `--tile-shadow`; raised-card look in all non-classic skins.
- **No machine/presenter/port changes** — `TileExecutionMachine` wiring, execution/RFQ
  overlay states, and all data flow stay as-is; only the DOM/CSS around them changes.

**Analytics panel:** label `PROFIT & LOSS · TODAY`, glowing KPI headline (accent +
`--glow` text-shadow), restyled per-pair PnL bars.
**Positions:** exposure bubbles get accent ring + glow fill per sign.
**Blotter:** mono font, status coloring, dense header row; keep row-insert flash
(`--bg-brand-primary` keyframe).

### 4.5 Motion

- FLIP glide on Live Rates filter changes (Motion One, already a dep).
- Row-insert flash retained. Boot sequence untouched (already exists).
- Respects the existing animation preference / `disableAnimations` seam.

### 4.6 Defaults

Default skin: `classic` → **`holo`** (prototype boots into "Holo HUD"; first impression
carries the wow). `classic` remains selectable. Existing users with a stored
`rtc-theme-skin` keep their choice.

## 5. Testing & gates

- **UI-contract tests**: update to the new tile structure (price-box buttons); coverage
  gate ≥95% (`test:ui:contract:coverage`) run locally before merge.
- **e2e**: Playwright selectors move from Buy/Sell buttons to price-box buttons; Cypress is
  de-gated (Playwright is the oracle) but specs updated to match.
- **Visual goldens**: BOTH committed sets regenerate — `react-local/<arch>/` locally,
  `react/` x86 via PR CI.
- **Lint gates**: `biome ci` (format+lint), both eslint configs (`lint:eslint`,
  `lint:eslint:types`), `lint:css`; inline-style ban means all styling goes through CSS
  modules (dynamic values via `--custom-property` variable-ref escape hatch, no disables).
- **Acceptance artifact**: side-by-side Playwright screenshots (prototype vs app), holo
  dark + light, judged against the standalone prototype render.

## 6. Risks

- **Golden churn**: every visual golden changes; regenerate once at the end, not per task.
- **Contract/e2e churn from tile restructure**: contained by updating the shared World /
  page-object selectors, not individual specs.
- **Font subsetting/bundle size**: @fontsource latin subsets only; ~5 families is
  acceptable for a showcase app.
- **backdrop-filter + AA jitter on CI**: visual tier already tolerates AA noise
  (`maxDiffPixelRatio` 0.06, settled decision); blur surfaces may need the established
  panel-width wrapper patterns if x86 content-width flakes reappear.
