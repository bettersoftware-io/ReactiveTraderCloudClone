# v2 Fidelity Flagship Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the v2 prototype's visual identity in `@rtc/client-react` — real fonts, v2 token values with gradient/shadow keys, panel/header/status chrome, and a fully faithful FX screen — per the approved spec `docs/superpowers/specs/2026-07-02-v2-fidelity-flagship-fx-design.md`.

**Architecture:** Token-first: all skin knowledge lives in `ui/shell/theme/tokens.ts`; components consume semantic custom properties through co-located CSS modules. DOM restructure is view-layer only — machines/presenters/ports untouched. Test-id contract (`sell-btn`, `buy-btn`, `tile-<sym>`) is preserved so page objects keep working.

**Tech Stack:** React 19 + CSS Modules + @fontsource (self-hosted OFL fonts) + Motion One (already a dep) + Vitest/RTL contract tier + Playwright visual/e2e.

**Source of truth:** `docs/design/v2/dev-handoff/prototype/source/Reactive Trader.dc.html` (hereafter **PROTO**). Key line anchors (checked 2026-07-02): theme table dark `this.themes` L771–775, light `this.themesLight` L778–786; aurora layers L104–110 + keyframes L45–46; skin menu L137–163; FX tile markup L368–420; tile style generators L1280–1292 (`priceBase`, `pipStyle`, `cardStyle`, `notionalStyle`); chip style L1190 (`chipStyleObj`); status bar L728; Analytics KPI L508.

## Global Constraints

- Inline `style={{…}}` props are BANNED in client-react src (ESLint no-restricted-syntax). All styling via CSS modules; dynamic values via `style={varsObject}` variable-ref custom-property pattern (no eslint-disable needed).
- Newspaper order (exported component first), one component per file, arrow-body, func-style rules are enforced — run `pnpm lint:eslint` AND `pnpm lint:eslint:types` AND `pnpm exec biome ci .` (format + lint) before every commit; Biome-clean ≠ ESLint-clean and vice versa.
- `pnpm lint:css` (stylelint) gates all `*.css`.
- No new runtime deps in `@rtc/domain`. Font deps go to `@rtc/client-react` only.
- Do NOT regenerate visual goldens per task — one regen in the final task.
- Commit format: `type(client-react): subject` with the Claude trailer. Frequent commits.
- All commands run from the worktree root `/Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/v2-fidelity-flagship-fx`.

---

### Task 1: Self-hosted fonts

**Files:**
- Modify: `packages/client-react/package.json` (deps)
- Modify: `packages/client-react/src/main.tsx` (font imports)
- Test: existing suite stays green (fonts are side-effect imports; verified visually in final task)

**Interfaces:**
- Produces: font families available at runtime: `'Chakra Petch'`, `'JetBrains Mono'`, `'IBM Plex Sans'`, `'IBM Plex Mono'`, `'Orbitron'` — referenced by tokens (Task 2) and CSS modules (Tasks 4–9).

- [ ] **Step 1: Add @fontsource packages**

```bash
pnpm --filter @rtc/client-react add @fontsource/chakra-petch @fontsource/jetbrains-mono @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono @fontsource/orbitron
pnpm outdated -r | head -20   # dep-freshness convention; 24h minimumReleaseAge cooldown is expected
```

- [ ] **Step 2: Import exact prototype weights in `src/main.tsx`** (JS imports, not CSS `@import`, so knip sees the dependency). Add at the very top, before other imports:

```ts
// v2 design fonts (PROTO L23): Chakra Petch 400/500/600/700, JetBrains Mono 400/500/700,
// IBM Plex Sans 400/500/600, IBM Plex Mono 400/500/600, Orbitron 500/700/900.
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
```

- [ ] **Step 3: Verify build + gates**

Run: `pnpm --filter @rtc/client-react build && pnpm --filter @rtc/client-react test && pnpm lint:dead`
Expected: build bundles woff2 assets; tests pass; knip reports no new unused deps.

- [ ] **Step 4: Runtime check** — dev server, evaluate `document.fonts.check('12px "Chakra Petch"')` → `true` after load (use the Playwright snippet from the final task's harness or a quick `node` script).

- [ ] **Step 5: Commit** — `feat(client-react): self-host v2 design fonts via @fontsource`

---

### Task 2: Token schema + v2 values

**Files:**
- Modify: `packages/client-react/src/ui/shell/theme/tokens.ts`
- Modify: `packages/client-react/src/ui/shell/theme/tokens.test.ts`

**Interfaces:**
- Produces: new `ThemeTokens` keys consumed by later tasks: `"--tile"`, `"--tile-shadow"`, `"--panel-shadow"`, `"--font-logo"`. Existing keys refreshed to v2 values. ThemeProvider applies keys generically (`Object.entries` over the token object) — no provider change needed; confirm by reading `ThemeProvider.tsx` before starting.

- [ ] **Step 1: Extend the failing test first.** In `tokens.test.ts`, add the four new keys to whatever exhaustive key-list/shape assertion exists (read the file; it asserts every skin×mode defines every key). Add specific value assertions:

```ts
it("v2 tile surfaces: every non-classic dark skin has a gradient tile + layered shadow", () => {
  for (const skin of ["holo", "terminal", "neon"] as const) {
    expect(themeTokens[skin].dark["--tile"]).toContain("linear-gradient");
    expect(themeTokens[skin].dark["--tile-shadow"]).toContain("inset");
  }
});

it("classic keeps neutral values for the new keys", () => {
  for (const mode of ["dark", "light"] as const) {
    expect(themeTokens.classic[mode]["--tile"]).toBe("var(--bg-tile)");
    expect(themeTokens.classic[mode]["--tile-shadow"]).toBe("none");
    expect(themeTokens.classic[mode]["--panel-shadow"]).toBe("none");
  }
});

it("v2 light palettes are the prototype's, not derived", () => {
  expect(themeTokens.holo.light["--accent-primary"]).toBe("#0096b3");
  expect(themeTokens.terminal.light["--accent-primary"]).toBe("#b67700");
  expect(themeTokens.neon.light["--accent-primary"]).toBe("#c800a0");
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/client-react test -- src/ui/shell/theme` → FAIL (keys missing / old values).

- [ ] **Step 3: Implement.** Add to the `ThemeTokens` interface:

```ts
  /** Tile surface fill — a gradient in every non-classic skin (PROTO `tile`). */
  "--tile": string;
  /** Layered tile shadow incl. inset top highlight (PROTO `tileShadow`); "none" for classic. */
  "--tile-shadow": string;
  /** Panel-level shadow (PROTO `panelShadow`); "none" for flat skins — 3d skins will fill this. */
  "--panel-shadow": string;
  /** Display font for wordmark / KPI headlines — Orbitron in all redesign skins. */
  "--font-logo": string;
```

Values per skin — dark from PROTO L771/773/775, light from PROTO `themesLight` L778–786. New-key values:

| skin.mode | `--tile` | `--tile-shadow` | `--panel-shadow` | `--font-logo` |
|---|---|---|---|---|
| classic.* | `var(--bg-tile)` | `none` | `none` | `system-ui, sans-serif` |
| holo.dark | `linear-gradient(158deg, rgba(15,43,58,0.92) 0%, rgba(9,28,40,0.86) 100%)` | `0 5px 16px -7px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)` | `none` | `'Orbitron', sans-serif` |
| holo.light | `linear-gradient(158deg, #ffffff 0%, #edf6f9 100%)` | `0 5px 14px -7px rgba(20,60,80,0.22), 0 1px 2px rgba(20,60,80,0.1), inset 0 1px 0 rgba(255,255,255,0.85)` | `none` | `'Orbitron', sans-serif` |
| terminal.dark | `linear-gradient(180deg, #1b2029 0%, #15191f 100%)` | `0 3px 10px -4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)` | `none` | `'Orbitron', sans-serif` |
| terminal.light | `linear-gradient(180deg, #ffffff 0%, #f4f6f8 100%)` | `0 3px 9px -4px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.9)` | `none` | `'Orbitron', sans-serif` |
| neon.dark | `linear-gradient(158deg, rgba(42,11,64,0.9) 0%, rgba(26,7,42,0.84) 100%)` | `0 5px 16px -7px rgba(0,0,0,0.62), 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)` | `none` | `'Orbitron', sans-serif` |
| neon.light | `linear-gradient(158deg, #ffffff 0%, #f7ecf5 100%)` | `0 5px 14px -7px rgba(80,20,70,0.24), 0 1px 2px rgba(80,20,70,0.1), inset 0 1px 0 rgba(255,255,255,0.85)` | `none` | `'Orbitron', sans-serif` |

Light-palette refresh (replace the derived values in `holoLight` / `terminalLight` / `neonLight` with PROTO `themesLight`, mapping: `bg→--bg-primary`, `bg2→--bg-secondary/--bg-header/--bg-footer`, `panel→--panel`, `panelHead→--panel-head`, `border→--border-primary`, `borderStrong→--border-strong`, `text/dim/faint→--text-primary/-secondary/-muted`, `accent→--accent-primary + --bg-brand-primary`, `accent2→--accent-2`, `buy→--accent-positive + --status-connected`, `sell→--accent-negative + --status-disconnected + --status-error`, `glow→--glow`, `grid→--grid`, `chip→--chip`, `auroraOp→--aurora-opacity`). Verbatim v2 light rows:

- holo.light: bg `#e7eff3`, bg2 `#f6fbfd`, panel `rgba(255,255,255,0.62)`, panelHead `rgba(0,150,179,0.07)`, border `rgba(0,150,179,0.26)`, borderStrong `rgba(0,135,165,0.58)`, text `#0a2330`, dim `rgba(22,72,92,0.72)`, faint `rgba(45,95,115,0.5)`, accent `#0096b3`, accent2 `#0ab39a`, buy `#0a9e63`, sell `#d63d52`, glow `0 0 14px rgba(0,150,179,0.2)`, grid `rgba(0,150,179,0.06)`, chip `rgba(0,150,179,0.12)`, auroraOp `0.12`
- terminal.light: bg `#eef0f3`, bg2 `#fafbfc`, panel `#ffffff`, panelHead `#eef1f4`, border `#d4d8de`, borderStrong `#a8b0bb`, text `#1a1f27`, dim `#5b6470`, faint `#8b93a1`, accent `#b67700`, accent2 `#2f6fd0`, buy `#1f8a52`, sell `#cf4339`, glow `none`, grid `rgba(0,0,0,0.03)`, chip `rgba(182,119,0,0.13)`, auroraOp `0.07`
- neon.light: bg `#f4ebf3`, bg2 `#fdf6fb`, panel `rgba(255,255,255,0.62)`, panelHead `rgba(200,0,160,0.07)`, border `rgba(200,0,160,0.28)`, borderStrong `rgba(190,0,150,0.58)`, text `#2a0a26`, dim `rgba(95,32,85,0.72)`, faint `rgba(125,62,115,0.5)`, accent `#c800a0`, accent2 `#0093b3`, buy `#0a9e63`, sell `#d63d52`, glow `0 0 14px rgba(200,0,160,0.2)`, grid `rgba(200,0,160,0.06)`, chip `rgba(200,0,160,0.12)`, auroraOp `0.12`

Dark rows: keep existing values where they already match PROTO (they mostly do — v1≡v2 for flat colors); update `--aurora-opacity` to PROTO `auroraOp` (holo 0.6, terminal 0.22, neon 0.7) and keep `--aurora-a/b` as-is (used by Task 3 layers). Keep `--bg-tile` unchanged (back-compat consumers); tiles switch to `--tile` in Task 8.

- [ ] **Step 4: Run tests** — `pnpm --filter @rtc/client-react test -- src/ui/shell/theme` → PASS. Also `pnpm --filter @rtc/client-react typecheck`.

- [ ] **Step 5: Commit** — `feat(client-react): extend theme tokens with v2 tile/panel/logo keys + v2 light palettes`

---

### Task 3: Ambient background — visible v2 aurora

**Files:**
- Modify: `packages/client-react/src/ui/shell/background/AmbientBackground.tsx`
- Modify: `packages/client-react/src/ui/shell/background/AmbientBackground.module.css`

**Interfaces:**
- Consumes: `--aurora-a`, `--aurora-b`, `--accent-primary`, `--accent-2`, `--accent-positive`, `--aurora-opacity`, `--grid` tokens; existing animated-bg preference wiring in the component (keep its prop/hook seam exactly).
- Produces: 4-layer fixed background (2 blurred radials, conic sweep, dotted grid) behind all panels.

- [ ] **Step 1: Read the current component.** Preserve its exported name, props, animated-background preference gating, and any `data-testid`. Only the layer structure/CSS changes.

- [ ] **Step 2: Restructure per PROTO L104–110.** Component renders a fixed, `pointer-events:none`, `z-index:0` wrapper with opacity `var(--aurora-opacity)` containing four divs (`layerA`, `layerB`, `sweep`, `grid`). CSS module:

```css
.wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: var(--aurora-opacity);
}

.layerA,
.layerB {
  position: absolute;
  inset: -25%;
  will-change: transform;
  animation-play-state: var(--amb-play, paused);
}

.layerA {
  background:
    radial-gradient(38% 38% at 28% 32%, var(--aurora-a) 0%, transparent 62%),
    radial-gradient(34% 34% at 78% 64%, var(--aurora-b) 0%, transparent 62%);
  opacity: 0.18;
  filter: blur(46px);
  animation: aurora-a 52s ease-in-out infinite;
}

.layerB {
  background:
    radial-gradient(30% 36% at 66% 22%, var(--accent-positive) 0%, transparent 60%),
    radial-gradient(40% 40% at 22% 82%, var(--accent-primary) 0%, transparent 60%);
  opacity: 0.13;
  filter: blur(58px);
  animation: aurora-b 68s ease-in-out infinite;
}

.sweep {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 170vmax;
  height: 170vmax;
  margin: -85vmax 0 0 -85vmax;
  background: conic-gradient(from 0deg, transparent 0deg, var(--accent-primary) 10deg, transparent 34deg);
  opacity: 0.06;
  will-change: transform;
  animation: sweep-rot 90s linear infinite;
  animation-play-state: var(--amb-play, paused);
}

.grid {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--accent-primary) 1.1px, transparent 1.4px);
  background-size: 24px 24px;
  opacity: 0.16;
  animation: grid-drift 90s linear infinite;
  animation-play-state: var(--amb-play, paused);
}

@keyframes aurora-a {
  0% { transform: translate3d(-7%, -4%, 0) scale(1.08); }
  50% { transform: translate3d(7%, 5%, 0) scale(1.28); }
  100% { transform: translate3d(-7%, -4%, 0) scale(1.08); }
}
@keyframes aurora-b {
  0% { transform: translate3d(6%, 4%, 0) scale(1.22); }
  50% { transform: translate3d(-6%, -4%, 0) scale(1.04); }
  100% { transform: translate3d(6%, 4%, 0) scale(1.22); }
}
@keyframes sweep-rot { to { transform: rotate(360deg); } }
@keyframes grid-drift { to { background-position: 24px 24px; } }
```

The animated-bg preference sets `--amb-play: running|paused` via the variable-ref `style={vars}` pattern (already how the component gates animation — mirror the existing mechanism).

- [ ] **Step 3: Verify** — existing background/prefs tests pass: `pnpm --filter @rtc/client-react test -- src/ui/shell`. Dev-server screenshot in holo dark shows visible cyan aurora + dot grid.

- [ ] **Step 4: Commit** — `feat(client-react): v2 four-layer ambient aurora (radials + sweep + dot grid)`

---

### Task 4: Panel chrome + viewport fill

**Files:**
- Modify: `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.module.css`
- Modify (if panel head markup needs a strip element): `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx`
- Test: `packages/client-react/src/ui/shell/layout/engine/__tests__` stays green

**Interfaces:**
- Consumes: `--panel`, `--panel-head`, `--panel-blur`, `--panel-shadow`, `--border-primary`, `--accent-primary`, `--glow`, `--font-display` tokens.
- Produces: framed glass panels; engine background transparent so Task 3's aurora shows through.

- [ ] **Step 1: Panel frame.** In the module CSS give `.panel`:

```css
.panel {
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--panel);
  backdrop-filter: blur(var(--panel-blur));
  box-shadow: var(--panel-shadow);
  overflow: hidden;
}
```

Panel header strip (whatever class renders the title bar — read the component; PROTO head style is `padding:9px 13px; border-bottom:1px solid var(--border); background:var(--panel-head)` with title in `var(--font-display)`, 600, 10–11px, `letter-spacing:0.14em`, color `var(--accent-primary)`, active-tab underline `2px solid var(--accent-primary)` + `box-shadow: var(--glow)`).

- [ ] **Step 2: Let the aurora show.** Change `.engine { background-color: var(--bg-primary); }` → `background: transparent;` (the `#root`/App keeps `--bg-primary` behind the aurora). Add small gaps between cells: `.split { gap: 8px; padding: 8px; }` — match PROTO's dock spacing (panels are separated, not fused).

- [ ] **Step 3: Diagnose the dead band.** With the dev server up, screenshot FX at 1600×900. If content still ends short of the status bar: inspect the FX screen's split sizes (persisted `--split-size` flex-grow on `.cell`) and each dock panel's inner scroller — the fix belongs in whichever wrapper lacks `flex: 1` / `min-height: 0`, not in hardcoded heights. Verify against the layout-engine tests.

- [ ] **Step 4: Verify** — `pnpm --filter @rtc/client-react test -- src/ui/shell/layout` PASS; screenshot: panels framed, aurora visible in gaps, no dead band.

- [ ] **Step 5: Commit** — `feat(client-react): v2 panel chrome (frame, glass, head strip) + viewport-filling dock`

---

### Task 5: Header chrome — logo, wordmark, compact skin dropdown

**Files:**
- Modify: `packages/client-react/src/ui/shell/chrome/HeaderChrome.tsx` + `.module.css`
- Modify: `packages/client-react/src/ui/shell/theme/SkinPicker.tsx` + `SkinPicker.module.css` + `SkinPicker.test.tsx`

**Interfaces:**
- Consumes: `useViewModel()` theme-skin hook (unchanged); `--font-logo`, `--accent-primary`, `--chip`, `--border-*` tokens.
- Produces: `SkinPicker` becomes a dropdown; **preserve every existing `data-testid`** (read `SkinPicker.test.tsx` + `tests/browser/page-objects/contracts/testids.ts` first; keep ids on the moved elements — trigger button + one menu item per skin).

- [ ] **Step 1: Update `SkinPicker.test.tsx` to the dropdown contract first** (open menu → click skin → menu closes + skin set; keyboard: Escape closes). Run → FAIL.

- [ ] **Step 2: Implement dropdown.** Trigger = pill button showing two color dots (skin accent + accent-2), skin label ("HOLO HUD", "TERMINAL", "NEON", "CLASSIC"), `▾`. Popover = absolutely-positioned menu (PROTO L137–163): head strip "THEME", one row per skin with dots + name, checkmark on active. Close on selection, outside click, Escape. Reuse the popover pattern from `AccountMenu.tsx`/`NotificationsMenu.tsx` (read one; follow its open/close + outside-click idiom exactly).

- [ ] **Step 3: Wordmark + logo.** In `HeaderChrome`: hexagon glyph `⬡` in an accent-bordered rounded square (glow on), wordmark `REACTIVE TRADER` in `var(--font-logo)` 700, `letter-spacing:0.2em`, 15px; subtitle line `FX · CREDIT · EQUITIES · HUD TERMINAL` mono 8px `letter-spacing:0.3em` color `--text-muted`. Nav links in `--font-display` with letterspacing; active pill keeps testids.

- [ ] **Step 4: Verify** — `pnpm --filter @rtc/client-react test -- src/ui/shell` PASS; screenshot header ≈ PROTO header.

- [ ] **Step 5: Commit** — `feat(client-react): v2 header chrome — hex logo, Orbitron wordmark, compact skin dropdown`

---

### Task 6: Status bar density

**Files:**
- Modify: `packages/client-react/src/ui/shell/status/StatusBar.tsx` + `.module.css` (+ `CosmeticMetrics.tsx` if cell markup lives there)
- Modify: `packages/client-react/src/ui/shell/connection/ConnectionStatusBar.module.css` (if it renders inside the bar)

**Interfaces:**
- Consumes: existing status/metrics hooks only — no new ports.
- Produces: 26px bar per PROTO L728: `border-top:1px solid var(--border-primary); background:var(--panel-head); font:10px var(--font-mono); letter-spacing:0.04em; color:var(--text-secondary)`; cells `GW eu-west-1 | LAT 12ms | TPUT … | FPS 60 | MEM … | POS … | P&L … | SES …` separated by `1px solid var(--border-subtle)` dividers (`padding:0 10px`), connection dot + `CONNECTED` left, `BUILD vX · HH:MM:SS UTC` right in `--accent-primary`.

- [ ] **Step 1:** Restyle via module CSS; keep every existing testid and text-content contract the e2e/status specs assert (read the specs under `packages/client-react/tests/ui/contract/specs/shell` first; adjust only styling-safe markup).
- [ ] **Step 2:** `pnpm --filter @rtc/client-react test` PASS.
- [ ] **Step 3: Commit** — `feat(client-react): v2 dense mono status bar`

---

### Task 7: Live Rates chrome — filter chips, tile grid, FLIP motion

**Files:**
- Modify: `packages/client-react/src/ui/fx/liveRates/CurrencyFilter.tsx` + `.module.css`
- Modify: `packages/client-react/src/ui/fx/liveRates/LiveRatesPanel.tsx` + `.module.css`
- Modify/Create: `packages/client-react/src/ui/shell/motion/` — `useFlipGrid.ts` (only if no FLIP helper exists; read `src/ui/shell/motion/index.ts` first)
- Test: `packages/client-react/src/ui/shell/motion/useFlipGrid.test.ts` (if created)

**Interfaces:**
- Consumes: existing currency-filter presenter hook (unchanged).
- Produces: chips styled per PROTO `chipStyleObj` (L1190); grid `repeat(auto-fill, minmax(300px, 1fr))`, `gap:12px`; FLIP glide on filter change.

- [ ] **Step 1: Chips.** Row: `FILTER` label mono 9px `letter-spacing:0.2em` `--text-muted`; each chip:

```css
.chip {
  padding: 4px 12px;
  border-radius: 20px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  transition: all 0.15s;
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  background: transparent;
}
.chip[data-active="true"] {
  border-color: var(--border-strong);
  color: var(--accent-primary);
  background: var(--chip);
}
```

Keep existing testids/data-* the contract specs use (read `tests/ui/contract/specs/fx` first).

- [ ] **Step 2: FLIP.** If `shell/motion` lacks a FLIP helper, add `useFlipGrid(deps: unknown[])` — measure child rects before deps change (`useLayoutEffect` + ref map), then `element.animate([{transform: translate(dx,dy)}, {transform:'none'}], {duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)'})` for moved nodes; no-op when the existing animation-disable preference is on (same seam the motion module already consults). Unit-test the invert math with a fake rect map (no real layout needed):

```ts
it("computes inverse deltas for moved items and skips unmoved ones", () => {
  const prev = new Map([["EURUSD", { left: 0, top: 0 }], ["GBPUSD", { left: 320, top: 0 }]]);
  const next = new Map([["EURUSD", { left: 320, top: 0 }], ["GBPUSD", { left: 320, top: 0 }]]);
  expect(flipDeltas(prev, next)).toEqual([{ key: "EURUSD", dx: -320, dy: 0 }]);
});
```

(Export a pure `flipDeltas` from the hook file; hook wraps it.)

- [ ] **Step 3:** `pnpm --filter @rtc/client-react test -- src/ui` PASS; manual check: toggling EUR→USD glides tiles.
- [ ] **Step 4: Commit** — `feat(client-react): v2 filter chips + FLIP glide on Live Rates`

---

### Task 8: SpotTile — fully faithful restructure

**Files:**
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/Tile.tsx` + `Tile.module.css`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TilePrice.tsx` + `TilePrice.module.css`
- Modify: `packages/client-react/src/ui/fx/liveRates/tile/TileHeader.tsx` + `.module.css`, `TileNotional.tsx` + `.module.css`, `SpreadDisplay.module.css`, `TileChart.module.css`
- Create: `packages/client-react/src/ui/fx/liveRates/tile/TileFooter.tsx` + `TileFooter.module.css`
- Delete: `packages/client-react/src/ui/fx/liveRates/tile/TileExecution.tsx` + `.module.css` (+ its co-located test)
- Modify: `packages/client-react/tests/ui/contract/shared/pages/fx/liveRates/tile/TileExecutionPage.ts`, `TilePage.ts`; specs under `tests/ui/contract/specs/fx` that assert tile structure

**Interfaces:**
- Consumes: `TilePrice` gains `onExecute(direction: Direction): void` and `disabled: boolean` props; `Tile.tsx` passes its existing `handleExecute`.
- Produces: **testid contract preserved**: `data-testid="sell-btn"` / `"buy-btn"` move onto the price-box `<button>`s (bid box = sell-btn, ask box = buy-btn); `tile-<symbol>`, `tile-pips`, `data-movement`, `data-anim` unchanged. New DOM order inside the tile: header → notional row → price row (sell | spread | buy) → sparkline → footer → confirmation overlay.

- [ ] **Step 1: Update contract page objects/specs first.** Read `TileExecutionPage.ts` — repoint its selectors at the price-box buttons (same testids, so mostly type/comment updates); update any spec asserting the old "prices then buttons then notional" order or the `Sell`/`Buy` button labels (labels become `SELL`/`BUY` box captions). Run `pnpm --filter @rtc/client-react test:ui:contract` → expected failures list = your work order.

- [ ] **Step 2: Restructure `TilePrice`** — each `PriceButton` becomes the faithful price box (PROTO L368–420, `priceBase` L1280):

```tsx
<button
  type="button"
  data-testid={side === "bid" ? "sell-btn" : "buy-btn"}
  data-side={side}
  onClick={() => onExecute(side === "bid" ? Direction.Sell : Direction.Buy)}
  disabled={disabled}
  className={styles.priceBox}
>
  <span className={styles.boxLabel}>{side === "bid" ? "SELL" : "BUY"}</span>
  <span className={styles.value}>
    <span className={styles.big}>{prefix}</span>
    <span data-testid="tile-pips" data-movement={movementKey(movement)} data-anim={anim} className={styles.pips}>{pips}</span>
    <span className={styles.frac}>{fractional}</span>
  </span>
</button>
```

CSS (values from PROTO `priceBase`/`pipStyle`):

```css
.priceBox {
  flex: 1;
  cursor: pointer;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  padding: 7px 11px;
  transition: all 0.15s;
  text-align: left;
  color: var(--text-primary);
}
.priceBox[data-side="ask"] { text-align: right; }
.priceBox:hover:not(:disabled) { border-color: var(--border-strong); box-shadow: var(--glow); }
.priceBox:disabled { cursor: default; opacity: 0.55; }

.boxLabel {
  display: block;
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.22em;
  margin-bottom: 3px;
}
.priceBox[data-side="bid"] .boxLabel { color: var(--accent-negative); }
.priceBox[data-side="ask"] .boxLabel { color: var(--accent-positive); }

.value { display: flex; align-items: baseline; font-family: var(--font-mono); }
.priceBox[data-side="ask"] .value { justify-content: flex-end; }
.big { font-size: 15px; }
.frac { font-size: 12px; align-self: flex-start; }

.pips {
  font-size: 26px;
  font-weight: 700;
  line-height: 0.9;
  border-radius: 3px;
  transition: background 0.25s, color 0.25s;
}
.pips[data-movement="up"] { color: var(--accent-positive); }
.pips[data-movement="down"] { color: var(--accent-negative); }
/* tick flash = the prototype's filled big-figure block */
.pips[data-anim="tickUp"] { background: var(--accent-positive); color: var(--bg-primary); padding: 0 2px; }
.pips[data-anim="tickDown"] { background: var(--accent-negative); color: var(--bg-primary); padding: 0 2px; }
```

The price row in `TilePrice` becomes `sell box | spread column | buy box` — move `<SpreadDisplay>` between the boxes (pass `spread` into `TilePrice`, drop the separate render in `Tile.tsx`); spread column: `min-width:22px`, centered, mono 10px `--accent-primary`.

- [ ] **Step 3: Tile card + order.** `Tile.module.css` `.tile`: `position:relative; background:var(--tile); border:1px solid var(--border-primary); border-radius:5px; padding:13px 14px 11px; overflow:hidden; box-shadow:var(--tile-shadow);` busy/overlay state → `border-color: var(--border-strong)`. Reorder children in `Tile.tsx`: `TileHeader` → `TileNotional` → `TilePrice(+spread)` → `TileChart` → `TileFooter` → `TileConfirmation`/`TileRfq` overlays. Remove the `TileExecution` render and delete the component + its CSS/test (RFQ path still uses `TileRfq` + `handleExecute` unchanged).

- [ ] **Step 4: Header, notional, footer.**
  - `TileHeader`: pair name in `--font-display` 600 15px `letter-spacing:0.06em`; right side movement badge `▲ n pip`/`▼ n pip` mono 11px colored by movement (data from `usePriceHistory`/price movement already available in `Tile.tsx` — pass as props); tiny symbol code absolute top-right mono 8px `--text-muted`.
  - `TileNotional`: label = base ccy mono 11px `--text-secondary`; input `background:var(--panel); border:1px solid var(--border-primary); border-radius:4px; font:12px var(--font-mono); padding:5px 26px 5px 9px;` invalid → border `--accent-negative` + `MAX` tag; reset `↺` absolute right 8px, 12px, `--text-muted` (keep existing reset behavior/testids).
  - `TileFooter` (new, presentational): left `SPT {spotDate}` mono 10px `--text-muted`; right `{notional} {base}` mono 11px `--text-secondary`; `border-top:1px solid var(--border-primary); margin-top:9px; padding-top:8px;`. Spot date: use the existing trade/spot-date source if one exists in domain (search `spotDate`); otherwise derive T+2 as the prototype does (`_fmtShort(2)`) in a pure helper with a unit test:

```ts
it("formats T+2 spot date as 'DD MMM'", () => {
  expect(formatSpotDate(new Date("2026-07-02T09:00:00Z"), 2)).toBe("04 Jul");
});
```

- [ ] **Step 5: Run the suites.** `pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react test:ui:contract` → PASS. Then the coverage gate: `pnpm --filter @rtc/client-react test:ui:contract:coverage` ≥95%.
- [ ] **Step 6: e2e spot-check (Playwright only):** `RTC_E2E_SKIP_CYPRESS=1 pnpm --filter @rtc/tests test:e2e` — fix any selector fallout in `tests/browser/page-objects` (testids were preserved, so expect little).
- [ ] **Step 7: Commit** — `feat(client-react): faithful v2 spot tile — clickable price boxes, spread badge, tick-flash pips, SPT footer`

---

### Task 9: Analytics, Positions, Blotter restyle

**Files:**
- Modify: `packages/client-react/src/ui/fx/analytics/PnlValue.tsx` + `.module.css`, `AnalyticsPanel.tsx` + `.module.css`, `PairPnlBars.module.css`, `PositionBubbles.tsx` + `.module.css`, `PnlChart.module.css`
- Modify: `packages/client-react/src/ui/fx/blotter/FxBlotter.module.css`, `BlotterHeader.module.css`, `BlotterRow.module.css`, `QuickFilter.module.css`

**Interfaces:**
- Consumes: existing presenter hooks and props — restyle only; keep all testids and the `BlotterRow` flash keyframe contract (`BlotterRow.flash.golden.test.ts` must stay green).

- [ ] **Step 1: KPI headline** (PROTO L508): label `PROFIT & LOSS · TODAY` mono 9px `letter-spacing:0.2em` `--text-muted`; value in `var(--font-logo)` 700 32px with `text-shadow: 0 0 18px currentColor`, positive `--accent-positive` / negative `--accent-negative`. Apply in `PnlValue` markup/CSS (check its test for text-content assertions first).
- [ ] **Step 2: PairPnlBars**: section label `PNL PER CURRENCY PAIR` mono 9px letterspaced; rows: symbol mono 10px `--text-secondary`, bar 6px rounded filled `--accent-positive`/`--accent-negative`, right-aligned `+13k` mono 10px.
- [ ] **Step 3: PositionBubbles**: section label `NET EXPOSURE`; each bubble = translucent accent fill (`color-mix(in srgb, var(--accent-positive) 12%, transparent)` positive / negative variant), 1px solid ring in the sign color, `filter: drop-shadow(var(--glow))` on the ring, symbol `--font-display` 700 + signed amount mono 9px. (If `color-mix` trips stylelint, use rgba fallbacks per sign class.)
- [ ] **Step 4: Blotter**: header cells mono 9px uppercase `letter-spacing:0.14em` `--text-muted` with `border-bottom:1px solid var(--border-primary)`; rows mono 11px; `Done`→`--accent-positive`, `Rejected`→`--accent-negative`; row hover `background: var(--chip)`; QuickFilter input styled like the tile notional field; `Export CSV` button = chip treatment from Task 7.
- [ ] **Step 5:** `pnpm --filter @rtc/client-react test` PASS (incl. flash golden).
- [ ] **Step 6: Commit** — `feat(client-react): v2 analytics KPI glow, exposure bubbles, dense mono blotter`

---

### Task 10: Full verify, goldens, acceptance evidence

**Files:**
- Modify: `packages/client-react/tests/ui/__golden__` / visual snapshot dirs (regenerated), `COVERAGE-GAPS.md` if counts shift

- [ ] **Step 1: Full local gauntlet** (from repo root of the worktree):

```bash
pnpm build && pnpm typecheck && pnpm test
pnpm exec biome ci .
pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css
pnpm check:versions && pnpm lint:dead && pnpm check:deps
pnpm --filter @rtc/client-react test:ui:contract:coverage   # ≥95% gate
```

All green before proceeding.

- [ ] **Step 2: Regenerate the LOCAL golden set** (arch-specific `react-local/<arch>/`):

```bash
pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update
pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update
pnpm --filter @rtc/client-react test:ui:visual   # re-run, must pass clean
```

Review a sample of updated PNGs by eye (holo dark FX tile, header, analytics) before committing — do not commit goldens sight-unseen. The x86 `react/` set regenerates on the PR via CI (follow the CI job's update flow from the HUD workstream; expect one push cycle for baseline refresh).

- [ ] **Step 3: e2e** — `RTC_E2E_SKIP_CYPRESS=1 pnpm --filter @rtc/tests test:e2e` green.

- [ ] **Step 4: Acceptance screenshots.** Serve `docs/design/v2/standalone/Reactive Trader.html` (`python3 -m http.server`) + dev server; Playwright at 1600×900: prototype default vs app holo-dark, plus app holo-light, terminal-dark, neon-dark. Deliver side-by-side to the user. The bar: same fonts, framed glowing panels, gradient tiles with price boxes, visible aurora, dense status bar, no dead band.

- [ ] **Step 5: Commit goldens** — `test(client-react): regenerate visual goldens for v2 fidelity slice` — then PR + CI loop per the shipping-repo-changes skill (push, `gh run list` polling, catch up to main, `--merge` merge only after explicit user OK per repo convention).

---

## Execution notes

- Spec §4.6 (default skin = holo) is **already satisfied**: `packages/domain/src/preferences/preferences.ts:28` has `DEFAULT_THEME_SKIN: ThemeSkin = "holo"`. No task needed — the final acceptance screenshots confirm the app boots into holo.

- Tasks 1–2 are strictly ordered; 3–7 and 9 are independent of each other but all depend on Task 2; Task 8 depends on Task 2 (and reads Task 7's chips only visually). Run them sequentially anyway — they touch overlapping CSS modules and the review gate is per-task.
- Every task's implementer must read the PROTO line anchors listed in the header before writing CSS — the prototype is the pixel source of truth, this plan is the map.
- If a task uncovers a structural surprise (e.g. the dead-band fix needs an engine change), stop and surface it rather than improvising around the layout engine's tests.
