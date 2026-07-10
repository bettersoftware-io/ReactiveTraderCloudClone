# RN v2 Visual Pass — FX Rates + Shell + Real 3D Skins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@rtc/client-react-native` the v2 visual language on the FX Rates tab + app shell, and make the `holo3d`/`terminal3d` skins genuinely 3D (real elevation), all through the existing theme-token architecture.

**Architecture:** Extend `RnTheme` with a `depth` sub-model (RN-native `shadow*`/`elevation` values, a top-highlight colour, and a glow colour). A pure `depthStyle()` helper expands it into a `ViewStyle`. De-alias the four 3D token cells (currently `===` their flat siblings) into real cells that fill the depth block. Then redesign `SpotTile` into an elevated card, `TileGrid` into a padded responsive grid, and polish the shell chrome (toolbar, tab bar, connection banner). No component hardcodes colour; everything reads the theme.

**Tech Stack:** Expo SDK 57 / RN 0.86, React 19, TypeScript 6, vitest (pure `*.test.ts`) + jest-expo (`*.test.tsx`), `@testing-library/react-native`.

## Global Constraints

- Package `@rtc/client-react-native`; all edits under `packages/client-react-native/`.
- All colour AND depth values come from the theme token object (`RnTheme`), consumed via `useTheme()` / `useThemedStyles(makeStyles)`. **No hardcoded hex/rgba in components.**
- **No new runtime dependency** (gradient fills are deferred to a follow-up).
- Depth = RN-native primitives only: iOS `shadowColor`/`shadowOffset`/`shadowRadius`/`shadowOpacity` (single layer) + Android `elevation`; the inset top-highlight is a 1px top hairline border. RN cannot render multi-layer or inset shadows.
- Flat skins (`classic`, `holo`, `terminal`, `neon`) keep `depth.level: 0` → no shadow → byte-for-byte visual parity with today. Their **colour** values are unchanged.
- Preserve existing testIDs: `spot-tile`, `spot-tile-movement` (hidden).
- Pure logic (no RN runtime import) → vitest `*.test.ts`. RN component tests → jest `*.test.tsx`.
- Gauntlet before PR: `pnpm --filter @rtc/client-react-native typecheck`, `pnpm --filter @rtc/client-react-native test`, plus repo-root `pnpm exec biome ci packages/client-react-native` and `pnpm --filter @rtc/client-react-native exec eslint .` (or repo `eslint .`).
- Ship via `shipping-repo-changes` (worktree `rn-v2-design-3d`, branch `worktree-rn-v2-design-3d` → PR → CI green via `gh run list --workflow CI` on head SHA → `--merge`). iOS-simulator screenshots of every skin attached to the PR for live acceptance.

**Font family constants** (from `src/ui/theme/fontFamilies.ts`, for reference — do not change): `FONT_CHAKRA_DISPLAY = "ChakraPetch_500Medium"`, `FONT_JETBRAINS_MONO = "JetBrainsMono_400Regular"`, `FONT_IBM_SANS = "IBMPlexSans_400Regular"`, `FONT_IBM_MONO = "IBMPlexMono_400Regular"`.

---

## File Structure

- `src/ui/theme/tokens.ts` — **modify**: add `DepthTokens` interface + `depth` field on `RnTheme`; add `FLAT_DEPTH` const; add `depth` to all 8 flat cells; add real `holo3dDark/Light` + `terminal3dDark/Light` cells; de-alias the `rnThemeTokens` map.
- `src/ui/theme/tokens.test.ts` — **modify**: add the 3D de-alias + `depth.level` regression test.
- `src/ui/theme/depthStyle.ts` — **create**: `depthStyle(d: DepthTokens): ViewStyle`.
- `src/ui/theme/depthStyle.test.ts` — **create**: vitest unit test for `depthStyle`.
- `src/ui/SpotTile.tsx` — **modify**: card redesign consuming `depth`.
- `src/ui/SpotTile.test.tsx` — **modify**: update assertions for the new structure.
- `src/ui/fxColumns.ts` — **create**: `fxColumnCount(width: number): number`.
- `src/ui/fxColumns.test.ts` — **create**: vitest unit test.
- `src/ui/TileGrid.tsx` — **modify**: padding + responsive columns keyed on count.
- `app/_layout.tsx` — **modify**: `Chrome` toolbar wordmark + tab-bar icons.
- `src/ui/ConnectionBanner.tsx` — **modify**: pill restyle (text preserved).

---

## Task 1: Depth tokens + de-aliased 3D skins

**Files:**
- Modify: `packages/client-react-native/src/ui/theme/tokens.ts`
- Test: `packages/client-react-native/src/ui/theme/tokens.test.ts`

**Interfaces:**
- Produces: `interface DepthTokens { level: 0 | 2; shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffsetY: number; elevation: number; topHighlight: string | null; glow: string | null }` (exported). `RnTheme` gains `readonly depth: DepthTokens`. `rnThemeTokens[skin][mode].depth` is now defined for every cell; `holo3d`/`terminal3d` cells are distinct objects (not `===` their flat siblings) with `depth.level === 2`.

- [ ] **Step 1: Add the failing regression test**

Add to `packages/client-react-native/src/ui/theme/tokens.test.ts` (after the existing `THEME_MODES` import is already present; it imports `THEME_MODES, THEME_SKINS` from `@rtc/domain`):

```ts
test("3d skins are distinct cells from their flat siblings with real depth", () => {
  const pairs = [
    ["holo", "holo3d"],
    ["terminal", "terminal3d"],
  ] as const;
  for (const [flat, threeD] of pairs) {
    for (const mode of THEME_MODES) {
      // Not reference-equal: the alias that made "3D" look identical is gone.
      expect(rnThemeTokens[threeD][mode]).not.toBe(rnThemeTokens[flat][mode]);
      // The 3D cell carries physical depth; the flat one does not.
      expect(rnThemeTokens[threeD][mode].depth.level).toBe(2);
      expect(rnThemeTokens[flat][mode].depth.level).toBe(0);
    }
  }
});

test("every cell defines a depth block", () => {
  for (const skin of THEME_SKINS) {
    for (const mode of THEME_MODES) {
      const { depth } = rnThemeTokens[skin][mode];
      expect(depth, `${skin}.${mode}.depth`).toBeDefined();
      expect(typeof depth.level).toBe("number");
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/theme/tokens.test.ts`
Expected: FAIL — `rnThemeTokens.holo3d.dark` is currently `=== rnThemeTokens.holo.dark` (so `.not.toBe` fails), and `.depth` is `undefined` (so `.depth.level` throws).

- [ ] **Step 3: Add `DepthTokens` + `depth` field to `RnTheme`**

In `packages/client-react-native/src/ui/theme/tokens.ts`, add the interface immediately above `export interface RnTheme` and the field inside it (append after the existing `chip` field, before the font fields):

```ts
/**
 * Physical-depth descriptor for a skin cell. Flat skins use `level: 0` (no
 * shadow); the 3d skins fill it with a real drop shadow + elevation, a 1px
 * inset top-highlight colour, and an optional glow. RN cannot express the
 * web's layered/inset box-shadows, so this ports the dominant drop-shadow
 * layer (see packages/client-react/src/ui/shell/theme/tokens.ts --tile-shadow
 * / --panel-shadow / --glow) into RN-native shadow + elevation values.
 */
export interface DepthTokens {
  /** 0 = flat (no shadow/elevation); 2 = physical 3d. */
  readonly level: 0 | 2;
  /** iOS drop-shadow colour. */
  readonly shadowColor: string;
  /** iOS shadow opacity, 0..1. */
  readonly shadowOpacity: number;
  /** iOS shadow blur radius (px). */
  readonly shadowRadius: number;
  /** iOS shadow y-offset (px); x is always 0. */
  readonly shadowOffsetY: number;
  /** Android elevation (dp). */
  readonly elevation: number;
  /** 1px top-edge inset-highlight colour; `null` = none (flat). */
  readonly topHighlight: string | null;
  /** Glow colour for active/pressed elements; `null` = none. */
  readonly glow: string | null;
}
```

Add the field to `RnTheme` (place after `readonly chip: string;`):

```ts
  readonly depth: DepthTokens;
```

- [ ] **Step 4: Add the `FLAT_DEPTH` const and attach it to every flat cell**

In `tokens.ts`, add above `const classicDark`:

```ts
/** Flat skins carry no elevation — depthStyle() returns {} for level 0, so
 * these cells paint exactly as before this depth model existed. */
const FLAT_DEPTH: DepthTokens = {
  level: 0,
  shadowColor: "#000000",
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffsetY: 0,
  elevation: 0,
  topHighlight: null,
  glow: null,
};
```

Add `depth: FLAT_DEPTH,` as the final property of each of the eight existing flat cells: `classicDark`, `classicLight`, `holoDark`, `holoLight`, `terminalDark`, `terminalLight`, `neonDark`, `neonLight` (insert right after each cell's `fontMono` line).

- [ ] **Step 5: Add the real 3D cells**

In `tokens.ts`, add after `holoLight` (and after `terminalLight` respectively), before `const neonDark`:

```ts
// Holo 3D — the holo palette with real physical depth. Colours spread from the
// flat sibling; only bgTile is deepened and a depth block is filled. Depth
// values port the dominant layer of the web holo3d --tile-shadow/--glow.
const holo3dDark: RnTheme = {
  ...holoDark,
  bgTile: "rgba(9,34,49,0.62)",
  depth: {
    level: 2,
    shadowColor: "#000000",
    shadowOpacity: 0.62,
    shadowRadius: 12,
    shadowOffsetY: 8,
    elevation: 10,
    topHighlight: "rgba(255,255,255,0.07)",
    glow: "rgba(0,224,255,0.32)",
  },
};

const holo3dLight: RnTheme = {
  ...holoLight,
  bgTile: "#ffffff",
  depth: {
    level: 2,
    shadowColor: "rgba(20,60,80,0.5)",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffsetY: 8,
    elevation: 8,
    topHighlight: "rgba(255,255,255,0.95)",
    glow: "rgba(0,150,179,0.22)",
  },
};

// Terminal 3D — terminal palette + physical depth. Terminal's web --glow is
// "none", so glow stays null here (depth is drop-shadow + top highlight only).
const terminal3dDark: RnTheme = {
  ...terminalDark,
  bgTile: "#161a21",
  depth: {
    level: 2,
    shadowColor: "#000000",
    shadowOpacity: 0.6,
    shadowRadius: 11,
    shadowOffsetY: 8,
    elevation: 10,
    topHighlight: "rgba(255,255,255,0.05)",
    glow: null,
  },
};

const terminal3dLight: RnTheme = {
  ...terminalLight,
  bgTile: "#ffffff",
  depth: {
    level: 2,
    shadowColor: "rgba(20,24,32,0.4)",
    shadowOpacity: 0.24,
    shadowRadius: 11,
    shadowOffsetY: 8,
    elevation: 8,
    topHighlight: "rgba(255,255,255,0.9)",
    glow: null,
  },
};
```

- [ ] **Step 6: De-alias the token map**

Replace the `rnThemeTokens` export in `tokens.ts` with:

```ts
export const rnThemeTokens: Record<ThemeSkin, Record<ThemeMode, RnTheme>> = {
  classic: { dark: classicDark, light: classicLight },
  holo: { dark: holoDark, light: holoLight },
  holo3d: { dark: holo3dDark, light: holo3dLight },
  terminal: { dark: terminalDark, light: terminalLight },
  terminal3d: { dark: terminal3dDark, light: terminal3dLight },
  neon: { dark: neonDark, light: neonLight },
};
```

(Delete the old comment about "RN has no layered-shadow depth styling yet" and the alias lines.)

- [ ] **Step 7: Run the token tests to verify they pass**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/theme/tokens.test.ts`
Expected: PASS — all tests green, including the existing colour-key, no-`var()`, and fonts tests (the nested `depth` object is skipped by the `typeof value === "string"` guard in the no-`var()` test, and `depth` is not in `COLOUR_KEYS`).

- [ ] **Step 8: Commit**

```bash
git add packages/client-react-native/src/ui/theme/tokens.ts packages/client-react-native/src/ui/theme/tokens.test.ts
git commit -m "feat(rn): real depth tokens + de-alias holo3d/terminal3d skins"
```

---

## Task 2: `depthStyle` helper

**Files:**
- Create: `packages/client-react-native/src/ui/theme/depthStyle.ts`
- Test: `packages/client-react-native/src/ui/theme/depthStyle.test.ts`

**Interfaces:**
- Consumes: `DepthTokens` from `#/ui/theme/tokens` (Task 1).
- Produces: `depthStyle(d: DepthTokens): ViewStyle` — returns `{}` for `level: 0`, else the RN shadow + elevation fragment (does NOT include `topHighlight`/`glow`, which callers apply per-element).

- [ ] **Step 1: Write the failing test**

Create `packages/client-react-native/src/ui/theme/depthStyle.test.ts`:

```ts
import { expect, test } from "vitest";

import { depthStyle } from "#/ui/theme/depthStyle";
import type { DepthTokens } from "#/ui/theme/tokens";

const FLAT: DepthTokens = {
  level: 0,
  shadowColor: "#000000",
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffsetY: 0,
  elevation: 0,
  topHighlight: null,
  glow: null,
};

const PHYSICAL: DepthTokens = {
  level: 2,
  shadowColor: "#000000",
  shadowOpacity: 0.62,
  shadowRadius: 12,
  shadowOffsetY: 8,
  elevation: 10,
  topHighlight: "rgba(255,255,255,0.07)",
  glow: "rgba(0,224,255,0.32)",
};

test("flat depth yields no shadow props", () => {
  expect(depthStyle(FLAT)).toEqual({});
});

test("physical depth expands to RN shadow + elevation props", () => {
  expect(depthStyle(PHYSICAL)).toEqual({
    shadowColor: "#000000",
    shadowOpacity: 0.62,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/theme/depthStyle.test.ts`
Expected: FAIL — `Cannot find module '#/ui/theme/depthStyle'`.

- [ ] **Step 3: Write the implementation**

Create `packages/client-react-native/src/ui/theme/depthStyle.ts`:

```ts
import type { ViewStyle } from "react-native";

import type { DepthTokens } from "#/ui/theme/tokens";

/** Expand a DepthTokens into an RN shadow/elevation ViewStyle fragment. Flat
 * cells (level 0) return {} so nothing paints. The `topHighlight` and `glow`
 * fields are element-specific (a top hairline border; a pressed-state shadow
 * swap) and are applied by callers, not here. `react-native` is imported
 * type-only, so this module stays runtime-free and vitest-importable. */
export function depthStyle(d: DepthTokens): ViewStyle {
  if (d.level === 0) {
    return {};
  }
  return {
    shadowColor: d.shadowColor,
    shadowOpacity: d.shadowOpacity,
    shadowRadius: d.shadowRadius,
    shadowOffset: { width: 0, height: d.shadowOffsetY },
    elevation: d.elevation,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/theme/depthStyle.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/theme/depthStyle.ts packages/client-react-native/src/ui/theme/depthStyle.test.ts
git commit -m "feat(rn): depthStyle helper expanding DepthTokens to ViewStyle"
```

---

## Task 3: `SpotTile` card redesign

**Files:**
- Modify: `packages/client-react-native/src/ui/SpotTile.tsx`
- Test: `packages/client-react-native/src/ui/SpotTile.test.tsx`

**Interfaces:**
- Consumes: `depthStyle` from `#/ui/theme/depthStyle` (Task 2); `t.depth`, `t.bgTile`, `t.borderPrimary`, `t.borderSubtle`, `t.chip`, `t.textPrimary`, `t.textSecondary`, `t.textMuted`, `t.accentPositive`, `t.accentNegative`, `t.fontDisplay`, `t.fontMono` from `RnTheme`; `splitPrice` from `#/ui/formatPrice`; `pair.base`, `pair.terms`, `pair.ratePrecision`, `pair.pipsPosition`, `price.bid`, `price.ask`, `price.spread`, `price.movementType`.

**Design note (spec deviation, deliberate):** the design mockup showed a numeric delta (`+0.0004`) in the header, but `Price` carries no prior-tick delta, so the header shows a **directional arrow only** (`▲`/`▼`/`▬`), coloured by `movementType`. No fabricated number.

- [ ] **Step 1: Update the test for the new structure**

Replace the body of the first test in `packages/client-react-native/src/ui/SpotTile.test.tsx` and add a footer assertion. The symbol is now rendered `EUR / USD`; the ask pips stays an isolated `<Text>` (`"81"` for `UP_PRICE`); the spread stays an isolated `<Text>` (`"0.6"`); bid/ask formatted strings appear in the footer. Change these tests:

```ts
test("renders pair, ask split, spread and up-movement", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(UP_PRICE)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("EUR / USD")).toBeTruthy();
  expect(screen.getByText("81")).toBeTruthy(); // ask pips (enlarged, coloured)
  expect(screen.getByText("0.6")).toBeTruthy(); // spread
  expect(screen.getByText("1.53812")).toBeTruthy(); // bid (footer)
  expect(screen.getByText("1.53818")).toBeTruthy(); // ask (footer)
  expect(
    screen.getByTestId("spot-tile-movement", { includeHiddenElements: true })
      .props.children,
  ).toBe(PriceMovementType.UP);
});
```

And update the loading test's symbol assertion:

```ts
test("shows loading when price is null", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(null)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("EUR / USD")).toBeTruthy();
  expect(screen.getByText("Loading…")).toBeTruthy();
});
```

The two pips-colour tests (`getByText("81").props.style.color`) and the press test stay unchanged — the pips `<Text>` must keep a single style object carrying `color` (not a style array).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/SpotTile.test.tsx`
Expected: FAIL — `getByText("EUR / USD")` and the footer bid/ask assertions fail against the current flat markup (which renders `EURUSD` and no footer).

- [ ] **Step 3: Rewrite `SpotTile.tsx`**

Replace `packages/client-react-native/src/ui/SpotTile.tsx` with:

```tsx
import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { PriceMovementType } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { splitPrice } from "#/ui/formatPrice";
import { depthStyle } from "#/ui/theme/depthStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { TradeTicket } from "#/ui/TradeTicket";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

const ARROW: Record<PriceMovementType, string> = {
  [PriceMovementType.UP]: "▲",
  [PriceMovementType.DOWN]: "▼",
  [PriceMovementType.NONE]: "▬",
};

export function SpotTile({ pair }: SpotTileProps): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);
  const styles = useThemedStyles(makeStyles);
  const [ticketVisible, setTicketVisible] = useState(false);

  const label = `${pair.base} / ${pair.terms}`;

  let body: JSX.Element;
  if (price === null) {
    body = (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.symbol}>{label}</Text>
        </View>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  } else {
    const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);
    body = (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.symbol}>{label}</Text>
          <Text style={arrowStyle(styles, price.movementType)}>
            {ARROW[price.movementType]}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.priceRow}>
          <Text style={styles.big}>{ask.prefix}</Text>
          <Text style={pipsStyle(styles, price.movementType)}>{ask.pips}</Text>
          <Text style={styles.big}>{ask.fractional}</Text>
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.side}>
            BID {price.bid.toFixed(pair.ratePrecision)}
          </Text>
          <Text style={styles.spread}>{price.spread}</Text>
          <Text style={styles.side}>
            ASK {price.ask.toFixed(pair.ratePrecision)}
          </Text>
        </View>
        <Text style={styles.hidden} testID="spot-tile-movement">
          {price.movementType}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        testID="spot-tile"
        style={({ pressed }): ViewStyle =>
          pressed ? styles.pressed : styles.rest
        }
        onPress={() => {
          setTicketVisible(true);
        }}
      >
        {body}
      </Pressable>
      {ticketVisible ? (
        <TradeTicket
          pair={pair}
          onClose={() => {
            setTicketVisible(false);
          }}
        />
      ) : null}
    </>
  );
}

interface SpotTileProps {
  pair: CurrencyPair;
}

/** Narrow style for the movement-coloured text — `color` stays a plain
 * `string` so it can be read directly in tests via `.props.style.color`. */
interface MovementTextStyle {
  color: string;
  fontFamily: string | undefined;
  fontSize?: number;
  fontWeight?: TextStyle["fontWeight"];
}

function pipsStyle(
  styles: ReturnType<typeof makeStyles>,
  movement: PriceMovementType,
): MovementTextStyle {
  if (movement === PriceMovementType.UP) return styles.pipsUp;
  if (movement === PriceMovementType.DOWN) return styles.pipsDown;
  return styles.pipsNone;
}

function arrowStyle(
  styles: ReturnType<typeof makeStyles>,
  movement: PriceMovementType,
): MovementTextStyle {
  if (movement === PriceMovementType.UP) return styles.arrowUp;
  if (movement === PriceMovementType.DOWN) return styles.arrowDown;
  return styles.arrowNone;
}

interface SpotTileStyles {
  rest: ViewStyle;
  pressed: ViewStyle;
  card: ViewStyle;
  headerRow: ViewStyle;
  symbol: TextStyle;
  divider: ViewStyle;
  priceRow: ViewStyle;
  big: TextStyle;
  footerRow: ViewStyle;
  side: TextStyle;
  spread: TextStyle;
  loading: TextStyle;
  hidden: TextStyle;
  pipsUp: MovementTextStyle;
  pipsDown: MovementTextStyle;
  pipsNone: MovementTextStyle;
  arrowUp: MovementTextStyle;
  arrowDown: MovementTextStyle;
  arrowNone: MovementTextStyle;
}

function makeStyles(t: RnTheme): SpotTileStyles {
  const pipsBase = { fontSize: 22, fontFamily: t.fontMono } as const;
  const arrowBase = { fontSize: 13, fontFamily: t.fontDisplay } as const;
  // Pressed lift: on skins with a glow, swap the shadow colour to the glow and
  // raise it; flat skins (no glow) fall back to a subtle opacity dim.
  const pressed: ViewStyle = t.depth.glow
    ? {
        ...depthStyle(t.depth),
        shadowColor: t.depth.glow,
        shadowOpacity: 0.9,
        shadowRadius: 18,
      }
    : { opacity: 0.9 };
  return StyleSheet.create({
    rest: {},
    pressed,
    card: {
      marginHorizontal: 12,
      marginVertical: 6,
      padding: 14,
      borderRadius: 12,
      backgroundColor: t.bgTile,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.borderPrimary,
      // Physical elevation for 3d skins; {} for flat.
      ...depthStyle(t.depth),
      // 1px inset-highlight approximation on the top edge (3d skins only).
      borderTopWidth: t.depth.topHighlight ? 1 : StyleSheet.hairlineWidth,
      borderTopColor: t.depth.topHighlight ?? t.borderPrimary,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    symbol: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      letterSpacing: 0.5,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.borderSubtle,
      marginVertical: 10,
    },
    priceRow: { flexDirection: "row", alignItems: "flex-end" },
    big: { fontSize: 18, color: t.textSecondary, fontFamily: t.fontMono },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
    },
    side: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    spread: {
      fontSize: 11,
      color: t.textMuted,
      fontFamily: t.fontMono,
      backgroundColor: t.chip,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: "hidden",
    },
    loading: { fontSize: 12, color: t.textMuted, marginTop: 10 },
    hidden: { display: "none" },
    pipsUp: { ...pipsBase, color: t.accentPositive },
    pipsDown: { ...pipsBase, color: t.accentNegative },
    pipsNone: { ...pipsBase, color: t.textPrimary },
    arrowUp: { ...arrowBase, color: t.accentPositive },
    arrowDown: { ...arrowBase, color: t.accentNegative },
    arrowNone: { ...arrowBase, color: t.textMuted },
  });
}
```

Note: `PriceMovementType.NONE` is assumed to be the third enum member — verify the exact name against `@rtc/domain` (`grep "enum PriceMovementType" -A6 packages/domain/src`). If the "no movement" member is named differently, use that name in the `ARROW` record and `pipsNone`/`arrowNone` mapping.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/SpotTile.test.tsx`
Expected: PASS — all five tests green (symbol `EUR / USD`, pips `81` present + correctly coloured on up/down, spread `0.6`, footer bid/ask, press opens ticket).

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/SpotTile.tsx packages/client-react-native/src/ui/SpotTile.test.tsx
git commit -m "feat(rn): SpotTile v2 card redesign (elevated card, bid/ask split, arrow)"
```

---

## Task 4: `TileGrid` responsive columns

**Files:**
- Create: `packages/client-react-native/src/ui/fxColumns.ts`
- Test: `packages/client-react-native/src/ui/fxColumns.test.ts`
- Modify: `packages/client-react-native/src/ui/TileGrid.tsx`

**Interfaces:**
- Produces: `fxColumnCount(width: number): number` — `2` when `width >= 700`, else `1`.

- [ ] **Step 1: Write the failing test**

Create `packages/client-react-native/src/ui/fxColumns.test.ts`:

```ts
import { expect, test } from "vitest";

import { fxColumnCount } from "#/ui/fxColumns";

test("phone widths get a single column", () => {
  expect(fxColumnCount(390)).toBe(1);
  expect(fxColumnCount(699)).toBe(1);
});

test("tablet/landscape widths get two columns", () => {
  expect(fxColumnCount(700)).toBe(2);
  expect(fxColumnCount(1024)).toBe(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/fxColumns.test.ts`
Expected: FAIL — `Cannot find module '#/ui/fxColumns'`.

- [ ] **Step 3: Write the helper**

Create `packages/client-react-native/src/ui/fxColumns.ts`:

```ts
/** FX tile grid column count for a viewport width. Phones (portrait) get one
 * column; tablets / landscape (>= 700px) get two. Extracted as a pure function
 * so the breakpoint is unit-tested without mounting the RN FlatList. */
export function fxColumnCount(width: number): number {
  return width >= 700 ? 2 : 1;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react-native exec vitest run src/ui/fxColumns.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `TileGrid.tsx`**

Replace `packages/client-react-native/src/ui/TileGrid.tsx` with:

```tsx
import type { JSX } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";

import type { CurrencyPair } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { fxColumnCount } from "#/ui/fxColumns";
import { SpotTile } from "#/ui/SpotTile";

function keyExtractor(pair: CurrencyPair): string {
  return pair.symbol;
}

function renderItem({ item }: ListRenderItemInfo<CurrencyPair>): JSX.Element {
  return <SpotTile pair={item} />;
}

/** The FX spot-tile grid — a padded `FlatList` of `SpotTile` cards driven by
 * the live `useCurrencyPairs()` stream. Column count is responsive (1 on
 * phones, 2 on tablet/landscape); the list is re-keyed on the count because RN
 * requires a fresh FlatList when `numColumns` changes. */
export function TileGrid(): JSX.Element {
  const { useCurrencyPairs } = useViewModel();
  const pairs = useCurrencyPairs();
  const { width } = useWindowDimensions();
  const columns = fxColumnCount(width);
  return (
    <FlatList
      key={`cols-${columns}`}
      data={pairs}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={columns}
      contentContainerStyle={styles.content}
      columnWrapperStyle={columns > 1 ? styles.column : undefined}
    />
  );
}

interface TileGridStyles {
  content: ViewStyle;
  column: ViewStyle;
}

const styles: TileGridStyles = StyleSheet.create({
  content: { paddingVertical: 8 },
  column: { gap: 12 },
});
```

- [ ] **Step 6: Run the FX component tests to verify nothing regressed**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/SpotTile.test.tsx && pnpm --filter @rtc/client-react-native exec vitest run src/ui/fxColumns.test.ts`
Expected: PASS (SpotTile unaffected; fxColumns green). `TileGrid` has no jest test today; it's exercised via the app boot + screenshots at the end.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react-native/src/ui/fxColumns.ts packages/client-react-native/src/ui/fxColumns.test.ts packages/client-react-native/src/ui/TileGrid.tsx
git commit -m "feat(rn): responsive FX tile grid (1 col phone, 2 col tablet)"
```

---

## Task 5: Shell polish — toolbar, tab bar, connection banner

**Files:**
- Modify: `packages/client-react-native/app/_layout.tsx` (the `Chrome` component + `makeStyles`)
- Modify: `packages/client-react-native/src/ui/ConnectionBanner.tsx`

**Interfaces:**
- Consumes: existing `useTheme` / `useThemedStyles`, `RnTheme` tokens. No new exports.

**Note:** `app/_layout.tsx` has no unit test (it's the expo-router entry); `ConnectionBanner.test.tsx` exists and asserts label/reconnect **text**, which this task preserves (restyle only). Do not change any rendered strings in `ConnectionBanner`.

- [ ] **Step 1: Confirm the ConnectionBanner test still targets text (read before editing)**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/ConnectionBanner.test.tsx`
Expected: PASS (baseline before the restyle).

- [ ] **Step 2: Restyle `ConnectionBanner.tsx` as a pill with a status dot**

In `packages/client-react-native/src/ui/ConnectionBanner.tsx`, add a status-dot `<View>` before the label and pill styling. Keep the `LABEL[status]` text and the `Reconnect` text exactly as-is. Replace the returned JSX and `makeStyles` with:

```tsx
  return (
    <View style={styles.banner}>
      <View style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.label}>{LABEL[status]}</Text>
      </View>
      {showReconnect ? (
        <Pressable
          onPress={() => {
            reconnect();
          }}
        >
          <Text style={styles.reconnect}>Reconnect</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface ConnectionBannerStyles {
  banner: ViewStyle;
  pill: ViewStyle;
  dot: ViewStyle;
  label: TextStyle;
  reconnect: TextStyle;
}

function makeStyles(t: RnTheme): ConnectionBannerStyles {
  const connected = t.statusConnected;
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: t.chip,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: connected,
    },
    label: { color: t.textPrimary, fontFamily: t.fontDisplay, fontSize: 12 },
    reconnect: { color: t.accentPrimary, fontFamily: t.fontDisplay },
  });
}
```

Keep the existing imports (`Pressable`, `StyleSheet`, `Text`, `TextStyle`, `View`, `ViewStyle`, `ConnectionStatus`, `useViewModel`, `RnTheme`, `useThemedStyles`) — all remain used.

- [ ] **Step 3: Run the ConnectionBanner test to verify it still passes**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/ConnectionBanner.test.tsx`
Expected: PASS — text assertions unaffected by the restyle.

- [ ] **Step 4: Polish the toolbar + tab bar in `app/_layout.tsx`**

In the `Chrome` component's returned JSX, replace the toolbar `<View>` and the `<Tabs>` `screenOptions`/screens. Add a brand wordmark and per-tab icons (monochrome unicode glyphs in a `<Text>`, theme-colourable, no icon-font dependency). Replace the `Chrome` return and `makeStyles` toolbar block:

```tsx
  return (
    <View style={styles.fill}>
      <View style={styles.toolbar}>
        <Text style={styles.wordmark}>REACTIVE TRADER</Text>
        <View style={styles.toolbarRight}>
          <Text style={styles.simLabel}>Sim</Text>
          <Switch value={simulator} onValueChange={onToggle} />
          <AppearanceButton
            onPress={() => {
              setAppearanceOpen(true);
            }}
          />
          <LockButton />
        </View>
      </View>
      <ConnectionBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.bgPrimary },
          tabBarStyle: {
            backgroundColor: theme.bgHeader,
            borderTopColor: theme.borderSubtle,
          },
          tabBarActiveTintColor: theme.accentPrimary,
          tabBarInactiveTintColor: theme.textMuted,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Rates", tabBarIcon: tabIcon("⇅", theme) }}
        />
        <Tabs.Screen
          name="blotter"
          options={{ title: "Blotter", tabBarIcon: tabIcon("▤", theme) }}
        />
        <Tabs.Screen
          name="analytics"
          options={{ title: "Analytics", tabBarIcon: tabIcon("◵", theme) }}
        />
        <Tabs.Screen
          name="credit"
          options={{ title: "Credit", tabBarIcon: tabIcon("◈", theme) }}
        />
        <Tabs.Screen
          name="equities"
          options={{ title: "Equities", tabBarIcon: tabIcon("▦", theme) }}
        />
      </Tabs>
      <AppearanceOverlay
        open={appearanceOpen}
        onClose={() => {
          setAppearanceOpen(false);
        }}
      />
      <LockScreen />
    </View>
  );
}

/** A tab-bar icon factory: a monochrome unicode glyph in a themed <Text>, so
 * tabs get an icon without pulling in an icon-font dependency. The glyph takes
 * the active/inactive tint react-navigation passes via `color`. */
function tabIcon(glyph: string, t: RnTheme) {
  return ({ color }: { color: string }): JSX.Element => (
    <Text style={{ color, fontSize: 16, fontFamily: t.fontDisplay }}>
      {glyph}
    </Text>
  );
}
```

Update `makeStyles` in `_layout.tsx` — replace `toolbarLabel` with `wordmark` + `simLabel` and give the toolbar a fixed height:

```tsx
function makeStyles(t: RnTheme): ChromeStyles {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.bgPrimary },
    toolbar: {
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      backgroundColor: t.bgHeader,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    toolbarRight: { flexDirection: "row", alignItems: "center", gap: 12 },
    wordmark: {
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 15,
      fontWeight: "700",
      letterSpacing: 1.5,
    },
    simLabel: { color: t.textMuted, fontFamily: t.fontDisplay, fontSize: 12 },
  });
}
```

Update the `ChromeStyles` interface accordingly:

```tsx
interface ChromeStyles {
  fill: ViewStyle;
  toolbar: ViewStyle;
  toolbarRight: ViewStyle;
  wordmark: TextStyle;
  simLabel: TextStyle;
}
```

Remove the now-unused `TextStyle` import only if nothing else uses it (it is used by `ChromeStyles`, so keep it). Ensure `JSX` is imported (it is, via `import type { JSX } from "react"`).

- [ ] **Step 5: Run typecheck + the full package test suite**

Run: `pnpm --filter @rtc/client-react-native typecheck && pnpm --filter @rtc/client-react-native test`
Expected: PASS — typecheck clean; vitest + jest green.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react-native/app/_layout.tsx packages/client-react-native/src/ui/ConnectionBanner.tsx
git commit -m "feat(rn): shell polish — wordmark toolbar, tab-bar icons, status-pill banner"
```

---

## Task 6: Gauntlet + live simulator proof

**Files:** none (verification only).

- [ ] **Step 1: Full lint/type/test gauntlet**

Run each and confirm clean:
```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
pnpm exec biome ci packages/client-react-native
pnpm --filter @rtc/client-react-native exec eslint .
```
Expected: all PASS / zero findings. Fix any finding on the branch and re-run before proceeding.

- [ ] **Step 2: Boot the iOS simulator and capture per-skin screenshots**

Run: `pnpm dev:ios` (from the primary checkout if the worktree lacks the native `ios/` folder — the native build is gitignored and per-checkout). Once the app is running, in the Appearance overlay switch through each skin and capture:
```bash
xcrun simctl io booted screenshot /tmp/rn-<skin>-<mode>.png
```
Capture at minimum: `classic-dark`, `holo-dark`, `holo3d-dark`, `terminal-dark`, `terminal3d-dark`, `neon-dark`, on the Rates tab. The holo-vs-holo3d and terminal-vs-terminal3d pairs must show a **visible elevation/shadow difference** (the acceptance criterion for the de-alias). If holo3d looks identical to holo, the depth values need raising — return to Task 1.

- [ ] **Step 3: Ship via shipping-repo-changes**

Push the branch, open the PR (attach the screenshots), poll CI with `gh run list --branch worktree-rn-v2-design-3d --workflow CI --json status,conclusion,headSha` until the run for the head SHA is `completed`/`success`, then merge with `--merge`. Confirm ancestor, then clean up the worktree. **Do not merge before the user's live acceptance of the screenshots.**

---

## Self-Review

**1. Spec coverage:**
- Depth sub-model on `RnTheme` → Task 1. ✓
- `depthStyle` helper → Task 2. ✓
- De-alias `holo3d`/`terminal3d` + regression lock → Task 1 (Steps 5–6 + test Step 1). ✓
- FX tile card redesign (header/arrow, price split, bid/ask footer, spread chip, press lift) → Task 3. ✓
- `TileGrid` padding + responsive columns (keyed on count) → Task 4. ✓
- Shell polish (toolbar wordmark, tab-bar icons, connection pill) → Task 5. ✓
- Flat skins unchanged (`depth.level 0` → `depthStyle` returns `{}`) → Task 1 Step 4 + Task 2. ✓
- No hardcoded colours; theme-first → every `makeStyles` reads `t.*`. ✓
- No new runtime dependency (glyph icons, no icon font; no gradient lib) → Tasks 3/5. ✓
- Testing (unit + gauntlet + simulator screenshots) → Tasks 1–5 tests + Task 6. ✓
- Gradient fills / other tabs explicitly deferred → matches spec Non-Goals. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". All code blocks are complete. One explicit verification note (Task 3 Step 3: confirm `PriceMovementType.NONE`'s exact member name) — this is a guard, not a placeholder, with the exact command to resolve it.

**3. Type consistency:** `DepthTokens` (Task 1) is consumed by `depthStyle` (Task 2) and read as `t.depth` in Tasks 3/5. `depthStyle(d: DepthTokens): ViewStyle` signature is identical across Tasks 2/3. `fxColumnCount(width: number): number` identical across Task 4 helper + test + `TileGrid`. `MovementTextStyle` in `SpotTile` carries `color: string` so the existing pips-colour tests' `.props.style.color` read holds. Symbol label `EUR / USD` is consistent across `SpotTile` and its test. Spread/bid/ask isolated `<Text>` nodes match the test's `getByText` calls.
