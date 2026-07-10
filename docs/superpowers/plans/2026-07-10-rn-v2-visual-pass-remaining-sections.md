# RN v2 Visual Pass — Remaining Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend PR #143's card/depth visual language to the remaining mobile sections (Credit, Equities, Analytics, Blotter) by extracting a shared `SurfaceCard` primitive, adding a spacing scale, and adopting both across the sections — chrome/spacing/typography only, no logic or layout changes.

**Architecture:** Extract the card chrome baked inside `SpotTile` (border, radius-5, `depthStyle` shadow, top-highlight, optional SVG gradient sheen) into `SurfaceCard.tsx` with `tile` (sheen) and `panel` (flat-tonal, dense-safe) variants. Refactor `SpotTile` onto it as the fidelity proof. Add a theme-independent `SPACING` constant. Wrap each section's card/panel/container views in `SurfaceCard`, preserving all testIDs and swapping magic-number spacing for `SPACING`.

**Tech Stack:** React Native 0.86 / Expo SDK 57, TypeScript, `react-native-svg` (already bundled), vitest (`*.test.ts` unit) + jest/RTL (`*.test.tsx` component). Package: `@rtc/client-react-native`.

## Global Constraints

- **Theme-first.** No hardcoded colors, shadows, or radii — every visual value comes from `RnTheme` tokens (`useTheme`/`useThemedStyles`) or the new `SPACING` constant.
- **No new runtime deps.** Reuse `react-native-svg` for gradient sheens.
- **3D reads as 3D.** On `holo3d`/`terminal3d`, every adopted surface must be visibly deeper than its flat sibling.
- **Perf (`docs/performance.md`).** Dense/repeating surfaces (list rows, per-quote rows) must NOT each render an SVG gradient. Gradient sheen = `variant="tile"`, for low-cardinality hero cards only. Dense = `variant="panel"` (flat tonal + border + top-highlight, no SVG).
- **Extraction fidelity.** Refactoring `SpotTile` onto `SurfaceCard` must not change its rendered output. There are **no committed RN visual goldens**; the guard is: SpotTile's unit/RTL tests stay green unchanged, and on-device screenshots are pixel-identical. Preserve `testID`s `spot-tile`, `spot-tile-movement`.
- **`SurfaceCard` card view MUST NOT set `overflow: hidden`** — that clips the iOS drop shadow. Only the inner `sheen` layer clips (it owns `overflow: hidden`). Children render as **direct siblings** of the sheen (no extra wrapper view), so SpotTile's DOM stays identical.
- **`bgTile` is a top-level `RnTheme` field**, not on `DepthTokens`.
- **Preserve every existing `testID`** when wrapping a container in `SurfaceCard` (pass it through `SurfaceCard`'s `testID` prop).
- **Full gauntlet + on-device sign-off.** Repo-wide `eslint .`, repo-wide `biome ci .`, `lint:eslint:types`, `knip`, vitest, jest, and the 29 `@rtc/tests` grep gates must pass; the user approves iOS-simulator screenshots per skin **before** the PR merges.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/ui/SurfaceCard.tsx` | **New.** The raised-surface primitive + `TileSurface` (moved here). |
| `src/ui/SurfaceCard.test.tsx` | **New.** RTL tests for variants/sheen/depth. |
| `src/ui/theme/spacing.ts` | **New.** Theme-independent `SPACING` scale constant. |
| `src/ui/theme/spacing.test.ts` | **New.** vitest asserting the scale values. |
| `src/ui/SpotTile.tsx` | Refactor onto `SurfaceCard` (no visual change). |
| `src/ui/SpotTile.test.tsx` | Update sheen testID assertion (`tile-sheen` → `surface-sheen`). |
| `src/ui/credit/rfqTiles/RfqCard.tsx` | Wrap in `SurfaceCard variant="tile"`. |
| `src/ui/credit/rfqTiles/QuoteCard.tsx` | Wrap in `SurfaceCard variant="panel"`. |
| `src/ui/credit/rfqTiles/RfqFilterTabs.tsx`, `credit/CreditNav.tsx`, `credit/newRfq/*.tsx`, `credit/sellSide/TradeTicket.tsx` | Align border/radius/spacing to tokens. |
| `src/ui/equities/markets/SectorHeatmap.tsx`, `equities/trade/{DepthLadder,OrderTicket,PriceChart,InstrumentTabs}.tsx` | Wrap card containers in `SurfaceCard variant="panel"`; tabs align spacing. |
| `src/ui/analytics/AnalyticsScreen.tsx` | Wrap each chart (`PnlChart`/`ExposureBubbles`/`PairPnlBars`) in a `SurfaceCard variant="panel"` widget with a title row. |
| `src/ui/Blotter.tsx`, `src/ui/TradeRow.tsx` | Container → `SurfaceCard variant="panel"`; rows get consistent height/divider/typography (no SVG). |

## Design Note — deviation from spec

The spec said "add a `spacing` object to `RnTheme`." During planning this was refined to a **standalone `SPACING` constant** (`src/ui/theme/spacing.ts`) imported directly by components, because spacing is theme-independent geometry (identical across all 16 skin×mode cells) — threading it through the per-skin themed object would mean 16 duplicate edits and is a mild smell. Same intent, cleaner realization, zero cell churn, FX goldens unaffected. Flagged for user awareness at handoff.

---

### Task 1: `SurfaceCard` primitive

**Files:**
- Create: `packages/client-react-native/src/ui/SurfaceCard.tsx`
- Test: `packages/client-react-native/src/ui/SurfaceCard.test.tsx`

**Interfaces:**
- Consumes: `depthStyle` from `#/ui/theme/depthStyle`; `RnTheme`, `DepthTokens` from `#/ui/theme/tokens`; `useTheme`, `useThemedStyles`.
- Produces: `SurfaceCard({ variant?: "tile" | "panel", style?: ViewStyle, testID?: string, children: ReactNode }): JSX.Element`. Renders sheen (testID `surface-sheen`) only when `variant === "tile"` AND `theme.depth.tileGradient !== null`.

- [ ] **Step 1: Write the failing test**

Create `SurfaceCard.test.tsx`. Uses the existing `renderWithTheme` helper (`#/ui/theme/renderWithTheme`) — check its signature first; it renders a subtree under a given skin/mode. (`holo3d`/`dark` is a level-2 skin with `tileGradient` set; `holo`/`dark` is flat.)

```tsx
import { Text } from "react-native";
import { describe, expect, it } from "vitest"; // NOTE: this is an RTL component test → jest. See Step 2.
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { SurfaceCard } from "#/ui/SurfaceCard";

describe("SurfaceCard", () => {
  it("renders a gradient sheen for variant=tile on a 3d skin", () => {
    const { getByTestId } = renderWithTheme(
      <SurfaceCard variant="tile" testID="c">
        <Text>x</Text>
      </SurfaceCard>,
      { skin: "holo3d", mode: "dark" },
    );
    expect(getByTestId("surface-sheen")).toBeTruthy();
    expect(getByTestId("c")).toBeTruthy();
  });

  it("renders no sheen for variant=panel even on a 3d skin", () => {
    const { queryByTestId } = renderWithTheme(
      <SurfaceCard variant="panel" testID="c">
        <Text>x</Text>
      </SurfaceCard>,
      { skin: "holo3d", mode: "dark" },
    );
    expect(queryByTestId("surface-sheen")).toBeNull();
  });

  it("renders no sheen on a flat skin even for variant=tile", () => {
    const { queryByTestId } = renderWithTheme(
      <SurfaceCard variant="tile" testID="c">
        <Text>x</Text>
      </SurfaceCard>,
      { skin: "holo", mode: "dark" },
    );
    expect(queryByTestId("surface-sheen")).toBeNull();
  });
});
```

Adjust the import/matchers to match the repo's existing `*.test.tsx` convention (read `SpotTile.test.tsx` for the exact `renderWithTheme` call shape, jest globals, and `@testing-library/react-native` matchers — mirror it exactly).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest SurfaceCard`
Expected: FAIL — `Cannot find module '#/ui/SurfaceCard'`.

- [ ] **Step 3: Write the implementation**

```tsx
import type { JSX, ReactNode } from "react";
import { useId } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { depthStyle } from "#/ui/theme/depthStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Height (px) of the tile head strip a `headGradient` covers. */
const HEAD_HEIGHT = 45;

interface TileSurfaceProps {
  tile: readonly [string, string];
  head: readonly [string, string] | null;
}

/** The 3d surface, drawn with the already-bundled react-native-svg — a faithful
 * RN port of the web `--tile` gradient (lighter top → darker bottom) so the
 * card reads as a lit, raised surface. Skins whose `--panel-head` reads as a
 * subtle tonal band (Terminal 3D) also overlay it on the head strip; skins
 * where it would clash (Holo 3D) pass `head: null`. Clipped to the card's
 * rounded corners by its wrapper and non-interactive. */
function TileSurface({ tile, head }: TileSurfaceProps): JSX.Element {
  // Per-instance gradient ids (useId — static literals trip Biome's
  // useUniqueElementIds). Colons stripped so `url(#…)` parses cleanly.
  const gid = useId().replace(/:/g, "");
  const tileId = `${gid}-tile`;
  const headId = `${gid}-head`;
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={tileId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tile[0]} stopOpacity={1} />
          <Stop offset="1" stopColor={tile[1]} stopOpacity={1} />
        </LinearGradient>
        {head ? (
          <LinearGradient id={headId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={head[0]} stopOpacity={1} />
            <Stop offset="1" stopColor={head[1]} stopOpacity={1} />
          </LinearGradient>
        ) : null}
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${tileId})`} />
      {head ? (
        <Rect
          x="0"
          y="0"
          width="100%"
          height={HEAD_HEIGHT}
          fill={`url(#${headId})`}
        />
      ) : null}
    </Svg>
  );
}

export interface SurfaceCardProps {
  /** "tile" adds the SVG gradient sheen (hero cards, low cardinality). "panel"
   * (default) is flat-tonal + border + top-highlight (dense/repeating). */
  readonly variant?: "tile" | "panel";
  readonly style?: ViewStyle;
  readonly testID?: string;
  readonly children: ReactNode;
}

/** The shared raised-surface card: the web `.tile` chrome (5px radius, 1px
 * border-primary, tonal `bgTile`, `--tile-shadow` drop via depthStyle + the
 * inset top highlight) extracted from SpotTile. Content padding/layout is
 * supplied by the caller via `style` and children; this owns chrome only. The
 * card deliberately does NOT clip overflow (that would clip the iOS shadow);
 * only the sheen sublayer clips. */
export function SurfaceCard({
  variant = "panel",
  style,
  testID,
  children,
}: SurfaceCardProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const showSheen = variant === "tile" && theme.depth.tileGradient !== null;
  return (
    <View style={[styles.card, style]} testID={testID}>
      {showSheen ? (
        <View style={styles.sheen} testID="surface-sheen" pointerEvents="none">
          <TileSurface
            tile={theme.depth.tileGradient as readonly [string, string]}
            head={theme.depth.headGradient}
          />
        </View>
      ) : null}
      {children}
    </View>
  );
}

interface SurfaceCardStyles {
  card: ViewStyle;
  sheen: ViewStyle;
}

function makeStyles(t: RnTheme): SurfaceCardStyles {
  return StyleSheet.create({
    // Matches web `.tile`: 5px radius, 1px border-primary, tonal bgTile,
    // --tile-shadow drop (depthStyle, {} on flat) + inset top highlight (3d).
    // No `overflow: hidden` here — that would clip the drop shadow.
    card: {
      borderRadius: 5,
      backgroundColor: t.bgTile,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      ...depthStyle(t.depth),
      borderTopColor: t.depth.topHighlight ?? t.borderPrimary,
    },
    // Full-card gradient layer, clipped to the rounded corners. This layer owns
    // the overflow clip, not the shadowed card.
    sheen: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 5,
      overflow: "hidden",
    },
  });
}
```

The `as readonly [string, string]` cast is needed because `showSheen` narrows via a separate boolean; if Biome/ESLint flags the assertion, refactor to a local `const tile = theme.depth.tileGradient; ... {tile !== null && ...}` narrowing instead. Do NOT add a non-null assertion (`!`) — repo lint bans it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest SurfaceCard`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/SurfaceCard.tsx packages/client-react-native/src/ui/SurfaceCard.test.tsx
git commit -m "feat(rn): SurfaceCard primitive — extract card chrome with tile/panel variants"
```

---

### Task 2: Refactor `SpotTile` onto `SurfaceCard`

**Files:**
- Modify: `packages/client-react-native/src/ui/SpotTile.tsx`
- Modify: `packages/client-react-native/src/ui/SpotTile.test.tsx`

**Interfaces:**
- Consumes: `SurfaceCard` from `#/ui/SurfaceCard` (Task 1).
- Produces: no API change — `SpotTile({ pair }): JSX.Element`, testIDs `spot-tile`, `spot-tile-movement` preserved.

**Goal:** delete SpotTile's now-duplicated `TileSurface`, `sheen` rendering, `sheen` style, and the chrome fields of the `card` style; render its content inside `<SurfaceCard variant="tile">`. Rendered pixels must be identical (there are no goldens; verify via unchanged RTL tests + on-device).

- [ ] **Step 1: Update SpotTile.test.tsx sheen assertion**

In `SpotTile.test.tsx`, the test that asserts the gradient tile surface currently queries `getByTestId("tile-sheen")` (present on 3d, absent on flat). Change both queries from `"tile-sheen"` to `"surface-sheen"`. Leave every other assertion (the `spot-tile`, `spot-tile-movement`, EUR/USD label, bid/ask footer, pips color) unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest SpotTile`
Expected: FAIL — `Unable to find an element with testID: surface-sheen` (SpotTile still renders `tile-sheen`).

- [ ] **Step 3: Refactor SpotTile**

Apply these exact edits to `SpotTile.tsx`:

1. Remove imports no longer used: `useId` (keep `useState`), and the `Svg, { Defs, LinearGradient, Rect, Stop }` react-native-svg import line. Add `import { SurfaceCard } from "#/ui/SurfaceCard";`.
2. Delete the `HEAD_HEIGHT` const, the `TileSurfaceProps` interface, and the entire `TileSurface` function (lines ~31–80) — they now live in `SurfaceCard.tsx`.
3. Delete the `surface` variable (the `theme.depth.tileGradient ? <View testID="tile-sheen"…/> : null` block, lines ~90–97).
4. Replace each `<View style={styles.card}>{surface}<View style={styles.content}>…</View></View>` wrapper (both the `price === null` and the priced branch) with:

```tsx
<SurfaceCard variant="tile" style={styles.tileLayout}>
  <View style={styles.content}>
    {/* …existing header/divider/price/footer children, unchanged… */}
  </View>
</SurfaceCard>
```

(The `testID="spot-tile"` stays on the outer `Pressable`, so `SurfaceCard` needs no testID here.)

5. In `makeStyles`, delete the `sheen` style entirely and delete the `card` style's chrome fields (`borderRadius`, `backgroundColor`, `borderWidth`, `borderColor`, `...depthStyle(t.depth)`, `borderTopColor`). Replace the `card` entry with a `tileLayout` entry holding only SpotTile's own layout:

```ts
tileLayout: { flex: 1, marginVertical: 6 },
```

Keep the `pressed`/`rest` styles (including the glow-swap `depthStyle` logic) exactly as they are — that is SpotTile's press behavior, not card chrome. Remove `card` and `sheen` from the `SpotTileStyles` interface; add `tileLayout: ViewStyle`. The `depthStyle` import stays (used by `pressed`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest SpotTile`
Expected: PASS — sheen present on holo3d, absent on flat, all other assertions green.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: no errors (confirms no dangling `card`/`sheen`/`TileSurface`/`Svg` references).

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/SpotTile.tsx packages/client-react-native/src/ui/SpotTile.test.tsx
git commit -m "refactor(rn): SpotTile renders SurfaceCard — no visual change"
```

---

### Task 3: `SPACING` scale constant

**Files:**
- Create: `packages/client-react-native/src/ui/theme/spacing.ts`
- Test: `packages/client-react-native/src/ui/theme/spacing.test.ts`

**Interfaces:**
- Produces: `export const SPACING` with literal-typed rungs `{ xs: 4, sm: 8, md: 12, lg: 14, xl: 20 }` and `export interface SpacingScale`.

- [ ] **Step 1: Write the failing test**

Create `spacing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SPACING } from "#/ui/theme/spacing";

describe("SPACING", () => {
  it("is a 4pt-based ramp covering the values in use", () => {
    expect(SPACING).toEqual({ xs: 4, sm: 8, md: 12, lg: 14, xl: 20 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run spacing`
Expected: FAIL — `Cannot find module '#/ui/theme/spacing'`.

- [ ] **Step 3: Write the implementation**

```ts
/** Theme-independent spacing scale (4pt-based). Spacing is geometry, not colour,
 * so it lives outside RnTheme (which is per-skin×mode) and is imported directly.
 * The FX tile's original values map onto it: 14→lg, 12→md, 8→sm — so FX visuals
 * do not move. Intentionally minimal (YAGNI): only the rungs actually in use. */
export interface SpacingScale {
  readonly xs: 4;
  readonly sm: 8;
  readonly md: 12;
  readonly lg: 14;
  readonly xl: 20;
}

export const SPACING: SpacingScale = { xs: 4, sm: 8, md: 12, lg: 14, xl: 20 };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run spacing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/theme/spacing.ts packages/client-react-native/src/ui/theme/spacing.test.ts
git commit -m "feat(rn): SPACING scale — shared theme-independent spacing tokens"
```

---

### Task 4: Credit adoption

**Files:**
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/RfqCard.tsx`
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/QuoteCard.tsx`
- Modify: `packages/client-react-native/src/ui/credit/rfqTiles/RfqFilterTabs.tsx`
- Modify: `packages/client-react-native/src/ui/credit/CreditNav.tsx`
- Modify: `packages/client-react-native/src/ui/credit/newRfq/NewRfqForm.tsx`, `InstrumentSearch.tsx`, `QuantityInput.tsx`
- Modify: `packages/client-react-native/src/ui/credit/sellSide/TradeTicket.tsx`
- Modify (tests): the co-located `*.test.tsx` for RfqCard and QuoteCard.

**Interfaces:**
- Consumes: `SurfaceCard` (`#/ui/SurfaceCard`), `SPACING` (`#/ui/theme/spacing`).

**The transformation (apply per file; read each file first):**

For a component whose top-level view is a "card" (local style with `borderRadius` + `backgroundColor` + border):
1. Import `SurfaceCard` and `SPACING`.
2. Replace the outer `<View style={styles.card} testID={X}>…</View>` with `<SurfaceCard variant="…" testID={X} style={styles.card}>…</SurfaceCard>`, moving the existing `testID` to `SurfaceCard`.
3. In `makeStyles`, delete the card style's `borderRadius`, `backgroundColor`, `borderWidth`/`borderColor` (SurfaceCard owns them). Keep only layout (`gap`, `padding`, `margin`, `flex`). Replace magic-number `gap`/`padding`/`margin` values with `SPACING.*` where they match a rung (`4→xs`, `8→sm`, `12→md`, `14→lg`, `20→xl`); leave off-scale values as-is.

**Per-file specifics:**

- **RfqCard.tsx** — outer view is `<View style={styles.card} testID={\`rfq-card-${rfq.id}\`}>` (hero card containing header + countdown + quote list). Use `variant="tile"`. `card` style keeps `gap: SPACING.sm`, `padding: SPACING.md`, `marginHorizontal: SPACING.sm`, `marginVertical: SPACING.xs`; delete `borderRadius: 8`, `backgroundColor: t.panel`, `borderWidth`, `borderColor`. (`variant="tile"` renders the sheen behind the content on 3d skins; the sheen fills the full card and content is inset by `padding` — correct.)
- **QuoteCard.tsx** — the per-quote row (repeats within an RfqCard, so dense). Its container carries `borderRadius: 6` + `backgroundColor: t.bgSecondary`. Use `variant="panel"` (no SVG). Wrap its outer container in `SurfaceCard variant="panel"` preserving any testID, delete the local `borderRadius`/`backgroundColor`/border, keep padding/gap as `SPACING.*`.
- **RfqFilterTabs.tsx** and **CreditNav.tsx** — segmented controls, not cards. Do NOT wrap in SurfaceCard. Only replace magic-number padding/gap/margin with `SPACING.*` and, where they set a pill `borderRadius`, leave it (it's an intentional pill, not card chrome).
- **newRfq/NewRfqForm.tsx, InstrumentSearch.tsx, QuantityInput.tsx, sellSide/TradeTicket.tsx** — inputs/forms, not cards. Do NOT wrap in SurfaceCard. Align their container/input `borderRadius` to `5` (matching the card language) only if they currently use a different card-like radius on a *container* panel; leave input-field radii alone. Replace magic-number spacing with `SPACING.*`. If a form has an outer "panel" container view with bg + border + radius, that container MAY use `<SurfaceCard variant="panel">`.

- [ ] **Step 1: Update RfqCard + QuoteCard tests**

In `RfqCard.test.tsx` and `QuoteCard.test.tsx`, add/adjust an assertion that the component still renders its preserved testID (`rfq-card-<id>`, and QuoteCard's container testID). If a 3d-vs-flat difference is meaningfully testable (RfqCard renders `surface-sheen` on holo3d, not on holo), add that assertion mirroring `SpotTile.test.tsx`. Keep all existing behavior assertions.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest credit`
Expected: FAIL on the new `surface-sheen`/testID assertions (component not yet wrapped).

- [ ] **Step 3: Apply the transformation to all Credit files listed above**

Follow "The transformation" + "Per-file specifics". Preserve every existing testID.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest credit`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: no errors (no dangling deleted style keys).

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/credit
git commit -m "feat(rn): Credit adopts SurfaceCard + SPACING — v2 card language"
```

---

### Task 5: Equities adoption

**Files:**
- Modify: `packages/client-react-native/src/ui/equities/markets/SectorHeatmap.tsx`
- Modify: `packages/client-react-native/src/ui/equities/trade/DepthLadder.tsx`, `OrderTicket.tsx`, `PriceChart.tsx`, `InstrumentTabs.tsx`
- Modify (tests): the co-located `*.test.tsx` for the wrapped components.

**Interfaces:**
- Consumes: `SurfaceCard` (`#/ui/SurfaceCard`), `SPACING` (`#/ui/theme/spacing`).

Apply the same "transformation" as Task 4, all `variant="panel"` (these are widget panels, not hero cards; several are dense — no SVG):

- **DepthLadder.tsx** — outer `<View testID="depth-ladder" style={styles.ladder}>`; `ladder` style has `backgroundColor: t.panel`, `borderRadius: 6`, `borderColor: t.borderSubtle`. Wrap in `<SurfaceCard variant="panel" testID="depth-ladder" style={styles.ladder}>`; delete `ladder`'s bg/radius/border, keep padding/gap as `SPACING.*`. (Keep the inner `depth-row-*` and `depth-spread` rows/styles as-is.)
- **PriceChart.tsx** — container has `backgroundColor: t.panel`, `borderRadius: 6`, `borderColor: t.borderSubtle`. Wrap its outer view in `<SurfaceCard variant="panel">` preserving `testID="price-chart"`; delete local bg/radius/border. Keep the SVG chart path child untouched.
- **OrderTicket.tsx** — `ticket` style container (multiple early-return branches each render `<View testID="order-ticket" style={styles.ticket}>`). Extract the container into a single `<SurfaceCard variant="panel" testID="order-ticket" style={styles.ticket}>` wrapper if the branches share it; otherwise wrap each branch's `ticket` view. Delete `ticket`'s card chrome (bg/radius/border) into SurfaceCard; keep form layout/spacing as `SPACING.*`. Keep all `order-ticket-*` control testIDs.
- **SectorHeatmap.tsx** — the heatmap grid container becomes `<SurfaceCard variant="panel">`; the individual `heatmap-cell-*` cells keep their own `borderRadius: 4` (they are heat cells, not cards). Only the outer container's chrome (if any) moves to SurfaceCard; if the outer container has no card chrome today, still wrap it in a panel SurfaceCard so the heatmap reads as a framed widget. Replace magic spacing with `SPACING.*`.
- **InstrumentTabs.tsx** — a tab strip (`strip`/tab pills with `borderRadius: 4`). NOT a card — do NOT wrap in SurfaceCard. Only align spacing to `SPACING.*`; leave pill radii.

- [ ] **Step 1: Update the wrapped components' tests**

For DepthLadder, PriceChart, OrderTicket, SectorHeatmap: assert the preserved testID still renders. Add a 3d-vs-flat `surface-sheen`-absent assertion only where it adds value (panels never render the sheen — assert `queryByTestId("surface-sheen")` is null on holo3d to lock the perf rule). Keep existing assertions.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest equities`
Expected: FAIL on new assertions.

- [ ] **Step 3: Apply the transformation to all Equities files above**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest equities`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/equities
git commit -m "feat(rn): Equities panels adopt SurfaceCard + SPACING"
```

---

### Task 6: Analytics adoption

**Files:**
- Modify: `packages/client-react-native/src/ui/analytics/AnalyticsScreen.tsx`
- Modify (test): `packages/client-react-native/src/ui/analytics/AnalyticsScreen.test.tsx`

**Interfaces:**
- Consumes: `SurfaceCard` (`#/ui/SurfaceCard`), `SPACING` (`#/ui/theme/spacing`).

**Goal:** `AnalyticsScreen` currently stacks `PnlChart`, `ExposureBubbles`, `PairPnlBars` inside a `panel` view. Wrap each of the three charts in a `SurfaceCard variant="panel"` "widget" with a consistent title row (`Text` label) and `padding: SPACING.md`, so the screen reads as a dashboard of framed panels. Do NOT modify the chart components themselves (`PnlChart.tsx`/`ExposureBubbles.tsx`/`PairPnlBars.tsx`) beyond spacing-token alignment if they carry magic numbers.

- [ ] **Step 1: Update AnalyticsScreen.test.tsx**

Add assertions that each chart is rendered inside a widget card: give each `SurfaceCard` a testID (`analytics-widget-pnl`, `analytics-widget-exposure`, `analytics-widget-pairs`) and assert `getByTestId` finds each, plus that the existing chart testIDs (`pnl-chart`, `exposure-bubbles`, `pair-pnl-bars`) still render. Keep the `analytics-loading`/`analytics-stale` assertions.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest AnalyticsScreen`
Expected: FAIL — widget testIDs not found.

- [ ] **Step 3: Implement the widget wrapping**

In `AnalyticsScreen.tsx`, import `SurfaceCard` and `SPACING`. Wrap each chart:

```tsx
<SurfaceCard variant="panel" testID="analytics-widget-pnl" style={styles.widget}>
  <Text style={styles.widgetTitle}>P&L</Text>
  <PnlChart /* existing props */ />
</SurfaceCard>
```

Add `widget: { marginHorizontal: SPACING.md, marginBottom: SPACING.md, padding: SPACING.md }` and `widgetTitle: { fontSize: 12, color: t.textMuted, fontFamily: t.fontDisplay, marginBottom: SPACING.sm, letterSpacing: 0.5 }` to `makeStyles`. Use appropriate titles ("P&L", "Exposure", "Pair P&L" — match existing copy if the charts already have headings; if a chart renders its own title, omit the widget title to avoid duplication). Keep the outer `panel`/scroll structure.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest AnalyticsScreen`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/analytics
git commit -m "feat(rn): Analytics dashboard — SurfaceCard widget panels"
```

---

### Task 7: Blotter + TradeRow + Equities blotters adoption

**Files:**
- Modify: `packages/client-react-native/src/ui/Blotter.tsx`
- Modify: `packages/client-react-native/src/ui/TradeRow.tsx`
- Modify: `packages/client-react-native/src/ui/equities/blotters/OrdersBlotter.tsx`, `PositionsBlotter.tsx`, `DeskPnlGauge.tsx`
- Modify (tests): `Blotter.test.tsx`, `TradeRow.test.tsx`, `OrdersBlotter.test.tsx`, `PositionsBlotter.test.tsx`

**Interfaces:**
- Consumes: `SurfaceCard` (`#/ui/SurfaceCard`), `SPACING` (`#/ui/theme/spacing`).

**Goal:** the Blotter list container becomes a `SurfaceCard variant="panel"` frame; rows (`TradeRow`) get consistent row-height, a `borderBottomColor` hairline divider, and FX typography. **No per-row SVG** (dense list) — rows are plain views, only the container is a SurfaceCard. The equities blotters get the identical treatment: `OrdersBlotter`/`PositionsBlotter` containers (currently `blotter`/`wrapper` styles with `backgroundColor: t.panel`) → `SurfaceCard variant="panel"`, with their `order-row-*`/`position-row-*` rows getting the same row treatment as `TradeRow`; `DeskPnlGauge` (`gauge` widget) → `SurfaceCard variant="panel"`. Preserve `orders-empty`/`positions-empty`/`desk-pnl-gauge` and all row testIDs.

- [ ] **Step 1: Update tests**

`Blotter.test.tsx`: assert the list is wrapped in a panel — give the `SurfaceCard` a testID `blotter-panel` and assert it renders, keeping `blotter-list`/`blotter-empty` assertions. `TradeRow.test.tsx`: keep the `trade-row-<id>` assertion; if you add a divider/height style, no behavioral assertion needed — do NOT assert style internals. Assert `queryByTestId("surface-sheen")` is null in `TradeRow` (locks the no-SVG-per-row perf rule).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @rtc/client-react-native exec jest "Blotter|TradeRow"`
Expected: FAIL — `blotter-panel` not found.

- [ ] **Step 3: Implement**

- `Blotter.tsx`: import `SurfaceCard`/`SPACING`. Wrap the `FlatList` (or its container) in `<SurfaceCard variant="panel" testID="blotter-panel" style={styles.panel}>`. `panel` style keeps `flex: 1`, `margin: SPACING.md` (or the existing outer inset), no card chrome (SurfaceCard owns it). Keep `blotter-empty`/`blotter-list` testIDs.
- `TradeRow.tsx`: in `makeStyles`, give `row` a consistent `minHeight` (e.g. 44), `paddingHorizontal: SPACING.md`, `paddingVertical: SPACING.sm`, `borderBottomWidth: StyleSheet.hairlineWidth`, `borderBottomColor: t.borderSubtle`, and switch value text to `t.fontMono` / label text to `t.fontDisplay` to match FX typography. Remove any redundant per-row `backgroundColor` if the panel now supplies it (or keep `t.bgTile` if rows need their own fill — keep the current `backgroundColor: t.bgTile` since it reads correctly on the panel). Preserve `trade-row-<id>` testID.
- `equities/blotters/OrdersBlotter.tsx` and `PositionsBlotter.tsx`: wrap the list container (`blotter`/`wrapper` style) in `<SurfaceCard variant="panel">`, delete the container's `backgroundColor: t.panel`, and give the `order-row-*`/`position-row-*` rows the same `minHeight`/padding/hairline-divider/typography treatment as `TradeRow`. Preserve `orders-empty`/`positions-empty` and all row testIDs.
- `equities/blotters/DeskPnlGauge.tsx`: wrap the `gauge` view in `<SurfaceCard variant="panel" testID="desk-pnl-gauge" style={styles.gauge}>`, deleting any card chrome from `gauge` into SurfaceCard; keep `desk-pnl-value` and the arc rendering untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec jest "Blotter|TradeRow"`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/src/ui/Blotter.tsx packages/client-react-native/src/ui/TradeRow.tsx packages/client-react-native/src/ui/equities/blotters
git commit -m "feat(rn): Blotter + Equities blotters panel + row treatment"
```

---

### Task 8: Full gauntlet + on-device screenshots

**Files:** none (verification only).

- [ ] **Step 1: Run the full RN gauntlet from the repo root**

```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test        # vitest + jest
pnpm exec biome ci .                                # REPO-WIDE (not scoped path)
pnpm exec eslint .                                  # REPO-WIDE
pnpm exec eslint . --config <lint:eslint:types cfg> # the type-aware config
pnpm --filter @rtc/tests test                       # 29 grep gates
pnpm exec knip
```

Expected: all green. (Watch the two CI-only-caught traps from PR #143: repo-wide `biome ci .` catches `useUniqueElementIds` on static SVG ids — `SurfaceCard` already uses `useId`, so it should be clean; repo-wide `eslint .` catches `padding-line-between-statements` that a scoped run misses.)

Run the exact scripts the repo's CI uses — read `.github/workflows/ci.yml` and mirror the commands rather than guessing flags.

- [ ] **Step 2: Boot the iOS simulator and capture per-skin screenshots**

Rebuild/launch via `pnpm dev:ios` (from the primary checkout if the worktree lacks the native `ios/` folder), then for each skin (`holo`, `holo3d`, `terminal`, `terminal3d`) in dark and light, navigate to Credit, Equities, Analytics, and Blotter and capture `xcrun simctl io booted screenshot`. Confirm 3d skins read visibly deeper than flat and every section matches the FX card language.

- [ ] **Step 3: Present screenshots to the user for sign-off**

Do NOT open the PR until the user approves the on-device result (round-2 punch-list lesson: broad UI needs live acceptance before merge).

- [ ] **Step 4: Commit any screenshot-driven fixes**

If the user requests visual changes, iterate on the relevant section, re-run the covering tests, and re-capture before re-requesting sign-off.

---

## Verification (whole-branch)

- Every section (Credit/Equities/Analytics/Blotter) renders through `SurfaceCard`; no component still declares its own `borderRadius + backgroundColor + border` card chrome (grep: `grep -rn "borderRadius" src/ui | grep -v SurfaceCard` should show only pills/cells/inputs, no card containers).
- `SpotTile` rendered output unchanged (RTL green + on-device identical).
- No new runtime deps; `react-native-svg` only.
- Full gauntlet green; user has signed off on per-skin screenshots.
