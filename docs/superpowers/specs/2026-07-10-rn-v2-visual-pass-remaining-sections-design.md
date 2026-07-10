# RN v2 Visual Pass — Remaining Sections Design

**Status:** Approved (design), pending spec review
**Date:** 2026-07-10
**Package:** `@rtc/client-react-native`
**Predecessor:** PR #143 — v2 visual pass for FX Rates + shell (SpotTile, TileGrid, ConnectionBanner, toolbar/tab bar, `DepthTokens`, `depthStyle`, `TileSurface`).

## Goal

Extend the v2-prototype visual language established for FX Rates to the remaining
sections of the mobile app — **Credit**, **Equities**, **Analytics**, and
**Blotter** — as a single **consistency pass**, so every section reads as part of
the same app: the same card chrome, the same depth on 3D skins, the same spacing
rhythm, and the same header/divider/typography treatment.

## Non-Goals

- No new features, no domain/logic changes, no view-model changes.
- No new runtime dependencies (`react-native-svg` is already present).
- No layout re-architecture of any screen — only chrome, spacing, and typography
  normalize. Each screen keeps its current structure and information.
- The Appearance/settings screen and the boot/lock shell screens are **out of
  scope** for this pass (settings is a system-style screen; boot/lock already got
  their treatment in the shell work).

## Global Constraints

- **Theme-first.** No hardcoded colors, shadows, or radii in any component. Every
  visual value comes from `RnTheme` tokens (`useTheme` / `useThemedStyles`).
- **No new runtime deps.** Reuse `react-native-svg` for gradient sheens.
- **3D must read as 3D.** On `holo3d` / `terminal3d`, every adopted surface must be
  visibly deeper than its flat sibling — the same bar PR #143 set for SpotTile.
- **Perf discipline (`docs/performance.md`).** Dense/repeating surfaces (list rows,
  stacked tiles) must NOT each render an SVG gradient. The gradient sheen is for
  low-cardinality hero cards only; dense surfaces get depth from flat tonal
  background + border + top-highlight.
- **Extraction fidelity.** Refactoring SpotTile onto the shared primitive must not
  change its rendered output: its existing unit tests and committed visual goldens
  stay green **without** being regenerated.
- **Full gauntlet + on-device sign-off.** The full RN lint/type/test gauntlet
  (repo-wide `eslint .`, repo-wide `biome ci .`, `lint:eslint:types`, `knip`,
  vitest, jest, the 29 `@rtc/tests` grep gates) must pass, and the user must
  approve on-device iOS-simulator screenshots per skin **before** the PR merges.

## Architecture

### 1. `SurfaceCard` — the shared card primitive

New file: `packages/client-react-native/src/ui/SurfaceCard.tsx`.

Extract the card chrome currently baked inline in `SpotTile` into a reusable
component. It owns the full "raised surface" treatment and nothing else (no
content layout, no domain awareness).

```tsx
import type { JSX, ReactNode } from "react";
import { useId } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { depthStyle } from "#/ui/theme/depthStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { useTheme } from "#/ui/theme/useTheme";

export interface SurfaceCardProps {
  /** "tile" adds the SVG gradient sheen (hero cards, low cardinality).
   *  "panel" (default) is flat-tonal + border + top-highlight (dense/repeating). */
  readonly variant?: "tile" | "panel";
  readonly style?: ViewStyle;
  readonly testID?: string;
  readonly children: ReactNode;
}

export function SurfaceCard({
  variant = "panel",
  style,
  testID,
  children,
}: SurfaceCardProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const depth = depthStyle(theme.depth);
  const showSheen = variant === "tile" && theme.depth.tileGradient !== null;

  return (
    <View
      style={[styles.card, depth, style]}
      testID={testID}
    >
      {showSheen ? (
        <View style={styles.sheen} testID="surface-sheen" pointerEvents="none">
          <TileSurface
            tile={theme.depth.tileGradient!}
            head={theme.depth.headGradient}
          />
        </View>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}
```

- `makeStyles(t)` produces `card` (`backgroundColor: t.bgTile`,
  `borderWidth: 1`, `borderColor: t.borderPrimary`, `borderRadius: 5`,
  `borderTopColor: t.depth.topHighlight ?? t.borderPrimary`, `overflow: "hidden"`),
  `sheen` (absolute-fill, `borderRadius: 5`, `overflow: "hidden"`), and `content`
  (`flex: 1`).
- `TileSurface` moves out of `SpotTile.tsx` into `SurfaceCard.tsx` **verbatim**
  (same `useId`-based gradient ids, same `HEAD_HEIGHT`, same Defs/Rect structure).
  Content padding is supplied by each consumer via the `style` prop / their own
  inner views — `SurfaceCard` does not impose content padding, so SpotTile keeps
  its exact `14/13/11` padding.

**`SpotTile` refactor.** `SpotTile` renders
`<SurfaceCard variant="tile" testID="spot-tile" style={styles.tilePadding}>…</SurfaceCard>`
and deletes its now-duplicated card/sheen/TileSurface code. The existing
`tile-sheen` testID is preserved by keeping it on SpotTile's own wrapper OR by
asserting `surface-sheen` — see Testing. Its goldens must not move.

### 2. Spacing scale on the theme

Add a `spacing` object to `RnTheme` (in `tokens.ts`), a 4pt-based ramp:

```ts
export interface SpacingScale {
  readonly xs: 4;
  readonly sm: 8;
  readonly md: 12;
  readonly lg: 14;
  readonly xl: 20;
}
export const SPACING: SpacingScale = { xs: 4, sm: 8, md: 12, lg: 14, xl: 20 };
```

`spacing` is identical across all skin×mode cells (geometry, not color), attached
in the theme assembly. The FX numbers map exactly (`14→lg`, `12→md`, `8→sm`), so
FX goldens do not move. Sections replace magic-number padding/gap/insets with
these tokens. This scale is intentionally minimal (YAGNI) — only the rungs in
actual use.

### 3. Per-section adoption

Logic and layout unchanged; only chrome, spacing, and header/divider/typography
normalize to the FX language.

- **Credit**
  - `rfqTiles/RfqCard` → `SurfaceCard variant="tile"` (hero, low cardinality).
  - `rfqTiles/QuoteCard` → `SurfaceCard variant="panel"` (denser, repeats within a card).
  - `newRfq/InstrumentSearch`, `newRfq/QuantityInput`, `newRfq/NewRfqForm`,
    `sellSide/TradeTicket` → adopt shared `borderPrimary`/radius-5/`spacing` for
    their inputs and containers (inputs stay inputs; no SurfaceCard needed on a
    text field, but their radius/border/padding align to tokens).
  - `CreditNav`, `rfqTiles/RfqFilterTabs` segmented controls → align to `spacing`.
- **Equities**
  - `markets/SectorHeatmap` container → `SurfaceCard variant="panel"`.
  - `trade/DepthLadder`, `trade/OrderTicket`, `trade/PriceChart`,
    `trade/InstrumentTabs` → `SurfaceCard variant="panel"` widget cards.
  - `equities/blotters` → reuse the Blotter row treatment (below).
- **Analytics**
  - Wrap `PnlChart`, `ExposureBubbles`, and `PairPnlBars` each in a
    `SurfaceCard variant="panel"` "widget" card with a consistent title row and
    padding, so `AnalyticsScreen` reads as a dashboard of panels.
- **Blotter / `TradeRow`**
  - `Blotter` container → `SurfaceCard variant="panel"`.
  - `TradeRow` rows → consistent row-height, `borderBottomColor` divider, and FX
    typography. **No per-row SVG** (perf).

## Components & Files

| File | Change |
| --- | --- |
| `src/ui/SurfaceCard.tsx` | **Create** — primitive + `TileSurface` moved here |
| `src/ui/SurfaceCard.test.tsx` | **Create** — variant/sheen/depth tests |
| `src/ui/SpotTile.tsx` | Refactor onto `SurfaceCard` (no visual change) |
| `src/ui/theme/tokens.ts` | Add `SpacingScale`/`SPACING`, `spacing` on `RnTheme` |
| `src/ui/theme/tokens.test.ts` | Assert `spacing` present + identical across cells |
| `src/ui/credit/rfqTiles/RfqCard.tsx` | → `SurfaceCard variant="tile"` |
| `src/ui/credit/rfqTiles/QuoteCard.tsx` | → `SurfaceCard variant="panel"` |
| `src/ui/credit/rfqTiles/RfqFilterTabs.tsx` | spacing tokens |
| `src/ui/credit/CreditNav.tsx` | spacing tokens |
| `src/ui/credit/newRfq/*.tsx` | border/radius/spacing tokens |
| `src/ui/credit/sellSide/TradeTicket.tsx` | border/radius/spacing tokens |
| `src/ui/equities/markets/SectorHeatmap.tsx` | → `SurfaceCard variant="panel"` |
| `src/ui/equities/trade/*.tsx` | → `SurfaceCard variant="panel"` |
| `src/ui/equities/blotters/*` | reuse Blotter row treatment |
| `src/ui/analytics/AnalyticsScreen.tsx` + chart wrappers | widget cards |
| `src/ui/Blotter.tsx`, `src/ui/TradeRow.tsx` | panel surface + row treatment |

## Error Handling

No new error paths. Optional theme fields (`depth.tileGradient`,
`depth.headGradient`, `depth.topHighlight`, `depth.bgTile`) are already nullable;
`SurfaceCard` handles `null` by falling back (no sheen; the top-level `bgTile`
tonal background; `borderPrimary` for the top edge). Flat skins
(`depth.level === 0`) yield an empty
`depthStyle` — the card is border + tonal only, exactly as today.

## Testing

- **Extraction fidelity:** `SpotTile.test.tsx` and its committed goldens (both
  golden sets, all tiers) stay green **unchanged**. If a testID needs to move
  (`tile-sheen` → `surface-sheen`), update the SpotTile test to the new id but do
  NOT regenerate goldens — pixels must be identical.
- **`SurfaceCard.test.tsx`:** `variant="tile"` on a 3D skin renders
  `surface-sheen`; `variant="panel"` never renders it; flat skin renders no sheen
  even with `variant="tile"`; card carries border + radius; depth spread applied
  on level-2 skins.
- **Per-section:** each adopting component keeps/gains a test asserting it renders
  a `SurfaceCard` (by testID) and — where meaningful — that a 3D skin differs from
  its flat sibling.
- **Gauntlet:** full RN gauntlet (repo-wide `eslint .`, repo-wide `biome ci .`,
  `lint:eslint:types`, `knip`, vitest, jest, 29 grep gates).
- **On-device:** iOS-simulator screenshots per skin (holo, holo3d, terminal,
  terminal3d, light/dark) for each section; **user sign-off before merge.**

## Rollout

Single workstream, single integration PR. Subagent-driven execution (fresh
implementer + review per task, whole-branch review at the end). On-device
screenshots gathered and shown to the user before the merge gate — per the
round-2 punch-list lesson (broad UI rounds need live acceptance before merge).
