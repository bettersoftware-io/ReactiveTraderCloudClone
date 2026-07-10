# RN Visual Pass — FX Rates + Shell + Real 3D Skins (Design)

**Status:** approved (design gate passed 2026-07-09)
**Package:** `@rtc/client-react-native`
**Scope:** first vertical slice — FX Rates tab + app shell + de-aliased 3D skins. Blotter / Analytics / Credit / Equities inherit the same language in a follow-up once this slice is accepted live.

## Problem

Two user-reported issues, one session:

1. **The mobile design is unimpressive.** The RN screens route every colour through the theme (48/50 components use `useThemedStyles`, zero hardcoded hex), but the *layouts* are minimal. The FX `SpotTile` is symbol + one rate row + spread; `TileGrid` is a bare `FlatList` with no padding, card treatment, borders, radii, bid/ask split, directional arrow, or spacing. It does not read like the same product as `client-react` or the `docs/design/v2` prototype.

2. **The "3D" skins are not 3D.** `holo3d` and `terminal3d` are `===` reference-aliases of their flat siblings in `packages/client-react-native/src/ui/theme/tokens.ts` (lines ~316–320), with a comment admitting the stub: *"RN has no layered-shadow depth styling yet; the 3d skins render as their flat siblings until the mobile-3d phase gives them real elevation."* Selecting Holo 3D vs Holo (or Terminal 3D vs Terminal) is visually identical. Colour theming itself works correctly and reactively.

## Goals

- Redesign the FX Rates tab (`SpotTile`, `TileGrid`) and the app shell (toolbar, tab bar, connection banner) in the `docs/design/v2` visual language, adapted to mobile ergonomics.
- Give `holo3d` / `terminal3d` genuine physical depth (elevation + top highlight + glow), unmistakably distinct from their flat siblings, ported faithfully from the web client's 3D depth tokens.
- Preserve the theme-first architecture: all new styling flows through the theme token set and `useThemedStyles`. No hardcoded colours. No re-architecture of the ViewModel / presenter / port layers.

## Non-Goals

- Blotter / Analytics / Credit / Equities redesign (follow-up slice, same language).
- Gradient panel/tile fills via `expo-linear-gradient` (deferred; depth is achieved with shadow + glow + highlight + border in this slice, adding no new runtime dependency).
- Any change to colour values of the *flat* skins (classic/holo/terminal/neon) — they stay as shipped.
- Animation/motion work (flash on tick, aurora, etc.) beyond simple press feedback.

## Global Constraints

- Package `@rtc/client-react-native`; Expo SDK 57 / RN 0.86; React 19.
- All colour and depth values come from the theme token object (`RnTheme`) and are consumed via `useTheme()` / `useThemedStyles(makeStyles)`. **No hardcoded hex or rgba in components.**
- No new runtime dependency in this slice (gradients deferred).
- Depth uses RN-native primitives only: iOS `shadowColor`/`shadowOffset`/`shadowRadius`/`shadowOpacity` (single layer) + Android `elevation`; the inset top-highlight is approximated with a 1px top hairline border. RN cannot render multi-layer or inset shadows.
- Flat skins keep `depth: 0` → no shadow, byte-for-byte visual parity with today.
- Lint/type gauntlet must pass: `pnpm --filter @rtc/client-react-native typecheck`, `test` (vitest + jest), plus repo `biome ci`, `eslint .`.
- Ship via the `shipping-repo-changes` flow (worktree → PR → CI green → merge). Live iOS-simulator screenshots of every skin accompany the PR for acceptance.

## Design

### 1. Depth sub-model on `RnTheme`

Extend the `RnTheme` interface (in `src/ui/theme/tokens.ts`) with a depth descriptor. The web client expresses 3D via layered `box-shadow`, gradient fills, and glow (`--tile-shadow`, `--panel-shadow`, `--glow` in `packages/client-react/src/ui/shell/theme/tokens.ts`). RN ports the *dominant drop-shadow layer* + the *inset top-highlight layer* + the *glow*.

New fields (all readonly):

```ts
/** Elevation descriptor for cards/panels. depth 0 = flat (no shadow). */
readonly depth: DepthTokens;

interface DepthTokens {
  /** 0 = flat (no shadow/elevation), 2 = physical 3d. */
  readonly level: 0 | 2;
  /** iOS drop-shadow colour (already includes the intended darkness). */
  readonly shadowColor: string;
  /** iOS shadow opacity 0..1. */
  readonly shadowOpacity: number;
  /** iOS shadow blur radius (px). */
  readonly shadowRadius: number;
  /** iOS shadow y-offset (px). */
  readonly shadowOffsetY: number;
  /** Android elevation (dp). */
  readonly elevation: number;
  /** 1px inset-highlight colour for the card's top edge; null = none. */
  readonly topHighlight: string | null;
  /** Glow colour for active/pressed elements; null = none. */
  readonly glow: string | null;
}
```

A helper produces the RN style fragment from a `DepthTokens`:

```ts
// depthStyle(d): ViewStyle — expands DepthTokens into RN shadow/elevation props.
// level 0 → returns {} (no shadow). level 2 → shadowColor/Opacity/Radius/{width:0,height},
// elevation. topHighlight and glow are applied by the caller (border-top hairline,
// pressed-state shadowColor swap) since they are element-specific.
```

**Flat skins** (`classicDark/Light`, `holoDark/Light`, `terminalDark/Light`, `neonDark/Light`) get:

```ts
depth: { level: 0, shadowColor: "#000", shadowOpacity: 0, shadowRadius: 0,
         shadowOffsetY: 0, elevation: 0, topHighlight: null, glow: null }
```

→ `depthStyle` returns `{}`, so flat skins are unchanged.

**De-alias the 3D cells.** Replace the reference-aliases with real cells `holo3dDark/Light` and `terminal3dDark/Light`. Each is a spread of its flat sibling's colours with a filled depth block and a slightly deepened `bgTile` (matching the web `holo3d`/`terminal3d` `--bg-tile`/panel deltas). Concrete depth values, ported from the web 3D tokens' dominant layers:

- `holo3dDark`: `bgTile: "rgba(9,34,49,0.62)"`, `borderStrong` keeps holo cyan; depth = `{ level: 2, shadowColor: "#000", shadowOpacity: 0.62, shadowRadius: 12, shadowOffsetY: 8, elevation: 10, topHighlight: "rgba(255,255,255,0.07)", glow: "rgba(0,224,255,0.32)" }`.
- `holo3dLight`: `bgTile: "#ffffff"`, depth = `{ level: 2, shadowColor: "rgba(20,60,80,0.5)", shadowOpacity: 0.28, shadowRadius: 12, shadowOffsetY: 8, elevation: 8, topHighlight: "rgba(255,255,255,0.95)", glow: "rgba(0,150,179,0.22)" }`.
- `terminal3dDark`: `bgTile: "#161a21"`, depth = `{ level: 2, shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 11, shadowOffsetY: 8, elevation: 10, topHighlight: "rgba(255,255,255,0.05)", glow: null }` (terminal's web `--glow` is `none`).
- `terminal3dLight`: `bgTile: "#ffffff"`, depth = `{ level: 2, shadowColor: "rgba(20,24,32,0.4)", shadowOpacity: 0.24, shadowRadius: 11, shadowOffsetY: 8, elevation: 8, topHighlight: "rgba(255,255,255,0.9)", glow: null }`.

Then the map becomes fully distinct:

```ts
export const rnThemeTokens = {
  classic:    { dark: classicDark,    light: classicLight },
  holo:       { dark: holoDark,       light: holoLight },
  holo3d:     { dark: holo3dDark,     light: holo3dLight },     // no longer an alias
  terminal:   { dark: terminalDark,   light: terminalLight },
  terminal3d: { dark: terminal3dDark, light: terminal3dLight }, // no longer an alias
  neon:       { dark: neonDark,       light: neonLight },
};
```

**Regression lock:** a token test asserts, for each 3D/flat pair, that `holo3d.dark !== holo.dark` (not reference-equal) AND `holo3d.dark.depth.level === 2` while `holo.dark.depth.level === 0` (same for light and terminal). This prevents the alias from silently returning.

### 2. FX Rates tile redesign

`SpotTile` becomes a card. Structure (mirrors `client-react`'s tile, styled v2):

```
┌─────────────────────────────────────┐  card: borderRadius 12, bg t.bgTile,
│  EUR / USD             ▲  +0.0004   │  borderWidth hairline t.borderPrimary,
│  ─────────────────────────────────  │  depthStyle(t.depth) + top-highlight border,
│    1.08 | 45 | 2       ● live        │  padding 14, marginHorizontal 12, marginVertical 6
│  BID 1.0844   spr 1.2   ASK 1.0846   │
└─────────────────────────────────────┘
```

- **Header row:** pair symbol formatted `BASE / QUOTE` (`t.fontDisplay`, `t.textPrimary`), and a directional cluster on the right — arrow glyph (`▲`/`▼`/`▬`) + signed delta, coloured by `movementType` (`t.accentPositive` / `t.accentNegative` / `t.textMuted`).
- **Divider:** 1px `t.borderSubtle`.
- **Price row:** big-figure / pips / fractional split via existing `splitPrice(price.ask, …)`. Prefix + fractional in `t.textSecondary` mono at base size; **pips enlarged** (~1.6×) and movement-coloured. A live status dot (`t.statusConnected`) + `live` label right-aligned.
- **Footer row:** `BID <bid>`, a centered `spr <spread>` chip (bg `t.chip`, `t.textMuted`), `ASK <ask>`, all `t.fontMono`.
- **Loading state:** keeps the card shell; shows symbol + `Loading…` in `t.textMuted`.
- **Press feedback:** on `Pressable` pressed state, when `t.depth.glow` is non-null, swap the card's `shadowColor` to the glow colour + raise `shadowOpacity`/`shadowRadius` (a lift). Flat skins (glow null) get a subtle `opacity: 0.9` press instead. Opens `TradeTicket` as today.
- Preserve the hidden `testID="spot-tile-movement"` text node and `testID="spot-tile"` so existing tests/e2e keep passing.

`TileGrid`:

- Wrap the `FlatList` with `contentContainerStyle` padding (vertical 8).
- Responsive columns: `useWindowDimensions()` → `numColumns = width >= 700 ? 2 : 1` (tablet/landscape gets two columns; phone stays single). `key` on the FlatList switches with `numColumns` (RN requires a fresh list when `numColumns` changes). Column wrapper gets `columnWrapperStyle` gap when 2-col.

### 3. Shell polish (`app/_layout.tsx` `Chrome`, `ConnectionBanner`)

- **Toolbar:** fixed height (~52), brand wordmark left (`Reactive Trader` in `t.fontDisplay`, `t.textPrimary`, letter-spaced), controls grouped right (Simulator switch + label, `AppearanceButton`, `LockButton`) with `gap`. Bottom hairline `t.borderSubtle`. Bg `t.bgHeader`.
- **Tab bar:** per-tab icon (simple vector/emoji glyph acceptable — no icon-font dependency) above the label; active tint `t.accentPrimary`, inactive `t.textMuted`; bg `t.bgHeader`, top hairline `t.borderSubtle`. (Icons via `tabBarIcon` in `screenOptions`/per-`Tabs.Screen`.)
- **ConnectionBanner:** pill — rounded, `t.status*`-coloured dot + status text, subtle bg, only visible when not connected (keep current visibility logic; restyle only).

### 4. Testing & verification

- **Unit (jest / RTL-native):** update `SpotTile.test.tsx` for the new structure (header/price/footer testIDs), keeping the movement testID assertions. `TileGrid` responsive-columns logic gets a small test if extractable. `tokens.test.ts` gains the 3D de-alias + `depth.level` assertions. `ThemeProvider`/`useThemedStyles` tests unchanged (contract preserved).
- **Depth helper:** `depthStyle(d)` gets a pure unit test (level 0 → `{}`; level 2 → expected shadow props).
- **Gauntlet:** `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native test`, repo `biome ci` + `eslint .`.
- **Live proof:** boot iOS simulator (`pnpm dev:ios`), capture `xcrun simctl io booted screenshot` for each of the 6 skins × dark, focused on the FX Rates tab, plus a Holo-vs-Holo-3D pair and Terminal-vs-Terminal-3D pair to demonstrate the depth difference. Attach to the PR for live acceptance before merge.
- **Ship:** worktree → PR → poll CI via `gh run list --workflow CI` on the head SHA → `--merge` when green → confirm ancestor → clean up.

## File Structure

- **Modify** `src/ui/theme/tokens.ts` — add `DepthTokens` + `depth` to `RnTheme`; fill flat skins with `level:0`; add real `holo3d*`/`terminal3d*` cells; de-alias the map.
- **Create** `src/ui/theme/depthStyle.ts` (+ `.test.ts`) — `depthStyle(d: DepthTokens): ViewStyle` helper.
- **Modify** `src/ui/theme/tokens.test.ts` — de-alias + depth-level regression assertions.
- **Modify** `src/ui/SpotTile.tsx` (+ `.test.tsx`) — card redesign.
- **Modify** `src/ui/TileGrid.tsx` — padding + responsive columns.
- **Modify** `app/_layout.tsx` — toolbar + tab bar polish (`Chrome`).
- **Modify** `src/ui/ConnectionBanner.tsx` (+ test if structure changes) — pill restyle.
- **Modify** `src/ui/formatPrice.ts` only if a `BASE / QUOTE` split helper is added (else format inline in `SpotTile`).

## Risks

- **RN single-layer shadow ≠ web's layered shadow.** Mitigated: we port the dominant layer + a border-based top highlight; the goal is "clearly physical," not pixel-parity with the web.
- **`numColumns` change requires a fresh FlatList.** Mitigated by keying the list on `numColumns`.
- **Existing snapshot/RTL tests may assert the old flat structure.** Expected; updated as part of each task (the tests are covering-tests, updated with their component).
- **jsdom/x86 jest cannot see paint.** The simulator screenshots are the real oracle for the visual/depth outcome; unit tests lock structure + tokens only.
