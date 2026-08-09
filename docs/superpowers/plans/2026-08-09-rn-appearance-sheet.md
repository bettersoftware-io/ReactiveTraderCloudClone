# RN Appearance Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the RN Appearance surface as a bottom sheet matching mobile-v1's form, while keeping the three settings the design has no slot for.

**Architecture:** Presentation-only. `AppearanceOverlay` becomes a `BottomSheetModal` (the idiom `TradeTicketSheet` already uses); `AppearanceScreen` is restructured into header + 3×2 skin grid + ambient + power saver + replay. All six preference hooks are untouched.

**Tech Stack:** React Native 0.86 / Expo SDK 57, `@gorhom/bottom-sheet` (already a dependency), jest + `@testing-library/react-native`.

## Global Constraints

- **Spec:** [../specs/2026-08-09-rn-appearance-sheet-design.md](../specs/2026-08-09-rn-appearance-sheet-design.md). Read it first.
- **No port / preference / domain change.** If a task seems to need one, stop and ask.
- **The ViewModel exposes NO mode setter.** `useThemePreference()` returns `{ mode, modePreference, cycle }` only. Selecting a mode = N zero-arg `cycle()` calls via `cyclesToReach`. `cycle()` re-reads the live persisted preference each call, so N synchronous calls land on the true target.
- **Cycle order is `["dark", "light", "system"]`** (`THEME_MODE_PREFERENCES`, `packages/domain/src/preferences/preferences.ts:195`).
- **Domain skin order is `["classic","holo","holo3d","terminal","terminal3d","neon"]`**; the **design's display order differs** and is defined in Task 1.
- `AMBIENT_STYLES = ["aurora","rays"]`; `POWER_SAVER_LEVELS = ["off","calm","freeze"]`.
- **Every test must be seen to FAIL before it passes.** Run the failing step.
- Repo rules: braces on all control statements (`useBlockStatements`); functions named for their **effect**, not their occasion (`docs/handler-naming.md`) — `onX` is allowed only for function-typed props; no inline `style={{…}}` beyond the dynamic-token pattern already used; explicit types on non-literal `const` exports (Biome `useExplicitType`).
- Run after each task: `pnpm --filter @rtc/client-react-native test` and `pnpm exec biome ci .`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/client-react-native/src/ui/shell/appearance/appearanceLayout.ts` | **new** — pure display-order + mode-cycle helpers. No RN imports. |
| `…/appearanceLayout.test.ts` | **new** — unit tests for the above. |
| `…/src/ui/shell/appearance/AppearanceOverlay.tsx` | overlay → `BottomSheetModal`. Keeps `open`/`onClose`. |
| `…/src/ui/shell/appearance/AppearanceOverlay.test.tsx` | sheet presence/dismissal. |
| `…/src/ui/AppearanceScreen.tsx` | restructured content. Substantial rewrite, not a patch. |
| `…/src/ui/AppearanceScreen.test.tsx` | mode, skins, conditional ambient style, power saver, replay. |
| `docs/rn-open-items.md` | record the second knowingly-stale golden. |

---

### Task 1: Pure layout helpers

**Files:**
- Create: `packages/client-react-native/src/ui/shell/appearance/appearanceLayout.ts`
- Test: `packages/client-react-native/src/ui/shell/appearance/appearanceLayout.test.ts`

**Interfaces:**
- Produces: `SKIN_DISPLAY_ORDER: readonly ThemeSkin[]`, `cyclesToReach(current: ThemeModePreference, target: ThemeModePreference): number`
- Consumes: `THEME_MODE_PREFERENCES`, `ThemeSkin`, `ThemeModePreference` from `@rtc/domain`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "@jest/globals";
import { THEME_SKINS } from "@rtc/domain";

import { cyclesToReach, SKIN_DISPLAY_ORDER } from "./appearanceLayout";

test("display order is the design's, not the domain's", () => {
  expect(SKIN_DISPLAY_ORDER).toEqual([
    "holo",
    "holo3d",
    "terminal",
    "terminal3d",
    "neon",
    "classic",
  ]);
});

test("display order is a permutation of the domain list — no skin dropped or invented", () => {
  expect([...SKIN_DISPLAY_ORDER].sort()).toEqual([...THEME_SKINS].sort());
});

test("cyclesToReach walks dark -> light -> system and wraps", () => {
  expect(cyclesToReach("dark", "dark")).toBe(0);
  expect(cyclesToReach("dark", "light")).toBe(1);
  expect(cyclesToReach("dark", "system")).toBe(2);
  expect(cyclesToReach("system", "dark")).toBe(1);
  expect(cyclesToReach("light", "dark")).toBe(2);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/appearance/appearanceLayout.test.ts`
Expected: FAIL — `Cannot find module './appearanceLayout'`.

- [ ] **Step 3: Implement**

```ts
// packages/client-react-native/src/ui/shell/appearance/appearanceLayout.ts
import {
  THEME_MODE_PREFERENCES,
  type ThemeModePreference,
  type ThemeSkin,
} from "@rtc/domain";

/** The design groups skins by family — the two HOLO variants, then the two
 * TERMINAL variants, then NEON, then CLASSIC — reading left-to-right across a
 * 3x2 grid (reference-shots/shell/appearance.png). The DOMAIN order is
 * alphabetical-ish and puts CLASSIC first; that order still governs storage and
 * every other consumer, so this is a VIEW ordering only. The permutation test
 * guards the real risk: a skin silently dropped from the grid would be
 * unreachable on mobile with nothing else noticing. */
export const SKIN_DISPLAY_ORDER: readonly ThemeSkin[] = [
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
  "neon",
  "classic",
];

/** How many `cycle()` calls move `current` to `target`.
 *
 * The ViewModel exposes no mode setter — `useThemePreference()` is
 * `{ mode, modePreference, cycle }` — so a segmented control cannot assign a
 * mode; it can only advance the cycle N times. `cycle()` re-reads the live
 * persisted preference on each call rather than a captured render value, so
 * firing it synchronously N times still lands on the true target.
 *
 * Widened from the previous `"dark" | "light"` version: the 3-way segment can
 * now select `system`, which the old 2-way toggle could not express. */
export function cyclesToReach(
  current: ThemeModePreference,
  target: ThemeModePreference,
): number {
  const from = THEME_MODE_PREFERENCES.indexOf(current);
  const to = THEME_MODE_PREFERENCES.indexOf(target);
  const span = THEME_MODE_PREFERENCES.length;
  return (to - from + span) % span;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: same command. Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client-react-native/src/ui/shell/appearance/appearanceLayout.ts packages/client-react-native/src/ui/shell/appearance/appearanceLayout.test.ts
git commit -m "feat(rn-appearance): pure display-order + mode-cycle helpers"
```

---

### Task 2: Overlay becomes a bottom sheet

**Files:**
- Modify: `packages/client-react-native/src/ui/shell/appearance/AppearanceOverlay.tsx`
- Test: `packages/client-react-native/src/ui/shell/appearance/AppearanceOverlay.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: unchanged public shape — `AppearanceOverlay({ open, onClose })`. **Do not change the props**; `tests/visual/scenarios.tsx` pins the sheet open through them.

**Before writing:** read `src/ui/rates/ticket/TradeTicketSheet.tsx`. Copy its idiom — `BottomSheetModal` + `backdropComponent` + `handleIndicatorStyle`. `BottomSheetModalProvider` already wraps the app body in `app/(app)/_layout.tsx`; do **not** add another.

- [ ] **Step 1: Write the failing test**

```tsx
test("renders the sheet with a grab handle and no CLOSE affordance", async () => {
  await render(<AppearanceOverlay open onClose={() => {}} />);
  expect(screen.getByTestId("appearance-sheet")).toBeTruthy();
  expect(screen.queryByTestId("appearance-close")).toBeNull();
});

test("renders nothing when closed", async () => {
  await render(<AppearanceOverlay open={false} onClose={() => {}} />);
  expect(screen.queryByTestId("appearance-sheet")).toBeNull();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @rtc/client-react-native exec jest src/ui/shell/appearance/AppearanceOverlay.test.tsx`
Expected: FAIL — `appearance-sheet` not found; `appearance-close` still present.

- [ ] **Step 3: Implement**

Replace the absolute-fill `View` with a `BottomSheetModal` carrying `testID="appearance-sheet"`. Present it when `open` flips true and dismiss on `onClose`. Delete the `CLOSE ✕` `Pressable` and the `header`/`title`/`close` styles it used — the handle, backdrop tap and pan-down replace it. Keep `<AppearanceScreen onReplayBoot={onClose} />` as the child.

If jest cannot render `BottomSheetModal` natively, add a mock alongside the existing ones in this file's test rather than changing the component:

```tsx
jest.mock("@gorhom/bottom-sheet", () => {
  const { View } = require("react-native");
  return {
    BottomSheetModal: ({ children, ...rest }: never) => <View {...rest}>{children}</View>,
    BottomSheetView: ({ children }: never) => <View>{children}</View>,
    BottomSheetBackdrop: () => null,
  };
});
```

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Verify the visual scenario still compiles**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Expected: clean. `tests/visual/scenarios.tsx` renders `<AppearanceOverlay open onClose={…} />`; if this breaks, the props changed — revert that part.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(rn-appearance): overlay becomes a BottomSheetModal"
```

---

### Task 3: Header with the 3-way mode segment

**Files:**
- Modify: `packages/client-react-native/src/ui/AppearanceScreen.tsx`
- Test: `packages/client-react-native/src/ui/AppearanceScreen.test.tsx`

**Interfaces:**
- Consumes: `cyclesToReach` from Task 1.

**Deletes:** the `Mode` section label, the `appearance-mode` "Dark · Tap to change" row, and the old 2-way segment. Two controls for one setting become one.

- [ ] **Step 1: Write the failing test**

```tsx
test("selecting System advances the cycle the right number of times", async () => {
  // starts at "dark"; dark -> light -> system is 2 cycles
  await render(<AppearanceScreen />);
  fireEvent.press(screen.getByTestId("appearance-mode-system"));
  expect(mockCycle).toHaveBeenCalledTimes(2);
});

test("the redundant tap-to-change row is gone", async () => {
  await render(<AppearanceScreen />);
  expect(screen.queryByTestId("appearance-mode")).toBeNull();
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — no `appearance-mode-system`; `appearance-mode` still present.

- [ ] **Step 3: Implement**

Header row: `APPEARANCE` title plus a segment of three `Pressable`s with testIDs `appearance-mode-dark`, `appearance-mode-light`, `appearance-mode-system`, labelled from the existing `MODE_LABEL`. Each calls `jumpToMode(target)`, which loops `cyclesToReach(modePreference, target)` times calling `cycle()`. Mark the active one from `modePreference`.

- [ ] **Step 4: MEASURE the header width — do not assume**

The title plus a 3-way segment must fit 402pt. Add a temporary `onLayout` logging the segment's width, run the app or a render test, and confirm no cell clips.

**If it does not fit cleanly, move the segment to its own row directly beneath the header and note it in the spec's Consequences section.** Guessing at exactly this class of geometry is what produced P8 — take the measurement.

- [ ] **Step 5: Run and watch it pass**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(rn-appearance): one 3-way mode segment in the header"
```

---

### Task 4: 3×2 skin card grid

**Files:**
- Modify: `packages/client-react-native/src/ui/AppearanceScreen.tsx`
- Test: `packages/client-react-native/src/ui/AppearanceScreen.test.tsx`

**Interfaces:**
- Consumes: `SKIN_DISPLAY_ORDER` from Task 1.

- [ ] **Step 1: Write the failing test**

```tsx
test("renders all six skins as cards in the design's order", async () => {
  await render(<AppearanceScreen />);
  const labels = screen.getAllByTestId(/^appearance-skin-.*-label$/);
  expect(labels.map((n) => n.props.children)).toEqual([
    "HOLO HUD", "HOLO 3D", "TERMINAL", "TERMINAL 3D", "NEON", "CLASSIC",
  ]);
});

test("each card shows three swatches", async () => {
  await render(<AppearanceScreen />);
  expect(screen.getAllByTestId("appearance-skin-holo-swatch")).toHaveLength(3);
});

test("pressing a card sets that skin", async () => {
  await render(<AppearanceScreen />);
  fireEvent.press(screen.getByTestId("appearance-skin-neon"));
  expect(mockSetSkin).toHaveBeenCalledWith("neon");
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Map `SKIN_DISPLAY_ORDER` into a wrapping row (`flexDirection: "row"`, `flexWrap: "wrap"`, three per row). Each card: `testID={`appearance-skin-${s}`}`, three swatch `View`s each `testID={`appearance-skin-${s}-swatch`}` filled from `rnThemeTokens[s][mode]` — **`accentPrimary`, `accentPositive`, `accentNegative`** — and a label `Text` with `testID={`appearance-skin-${s}-label`}` from the existing `THEME_DISPLAY_NAME`. Selected card gets the ring style; **drop the `✓`** (the ring is the design's only selection cue). Keep the existing `-active` testID suffix convention if other tests rely on it — check before deleting.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(rn-appearance): 3x2 skin card grid with three semantic swatches"
```

---

### Task 5: Ambient row and the conditional style picker

**This is the only real branch in the screen. It gets both directions.**

**Files:**
- Modify: `packages/client-react-native/src/ui/AppearanceScreen.tsx`
- Test: `packages/client-react-native/src/ui/AppearanceScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
test("ambient style picker is HIDDEN when ambient is off", async () => {
  mockAmbientEnabled = false;
  await render(<AppearanceScreen />);
  expect(screen.queryByTestId("appearance-ambient-style")).toBeNull();
});

test("ambient style picker is SHOWN and selectable when ambient is on", async () => {
  mockAmbientEnabled = true;
  await render(<AppearanceScreen />);
  expect(screen.getByTestId("appearance-ambient-style")).toBeTruthy();
  fireEvent.press(screen.getByTestId("appearance-ambient-style-rays"));
  expect(mockSetStyle).toHaveBeenCalledWith("rays");
});
```

- [ ] **Step 2: Run and watch BOTH fail**

Run the file. Expected: both FAIL. If the "hidden" one passes before the feature exists, the query is wrong — fix the test, not the code.

- [ ] **Step 3: Implement**

Row: label `Ambient background`, subtitle `Aurora + HUD grid · GPU shader layer` (per the design), and a toggle bound to `setAmbientEnabled`. Then, **only when `ambientEnabled`**, render a segment `testID="appearance-ambient-style"` over `AMBIENT_STYLES` with per-option testIDs `appearance-ambient-style-${style}` calling `setStyle`.

- [ ] **Step 4: Run and watch both pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(rn-appearance): ambient row; style picker only while ambient is on"
```

---

### Task 6: Power saver and replay boot

**Files:**
- Modify: `packages/client-react-native/src/ui/AppearanceScreen.tsx`
- Test: `packages/client-react-native/src/ui/AppearanceScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
test("power saver offers all three levels and selects one", async () => {
  await render(<AppearanceScreen />);
  fireEvent.press(screen.getByTestId("appearance-power-freeze"));
  expect(mockSetPowerSaverLevel).toHaveBeenCalledWith("freeze");
});

test("replay boot reboots and dismisses the sheet", async () => {
  const onReplayBoot = jest.fn();
  await render(<AppearanceScreen onReplayBoot={onReplayBoot} />);
  fireEvent.press(screen.getByTestId("appearance-replay-boot"));
  expect(mockReboot).toHaveBeenCalledTimes(1);
  expect(onReplayBoot).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

Power saver: label `Power saver` + a segment over `POWER_SAVER_LEVELS` with testIDs `appearance-power-${level}` calling `setPowerSaverLevel`. Replay: a full-width outlined `Pressable` `testID="appearance-replay-boot"` labelled `▸ REPLAY BOOT SEQUENCE`, calling `reboot()` then `onReplayBoot?.()`.

Keep whatever testIDs the existing tests already use if they differ — grep first; do not rename silently.

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Full suite + lint**

```bash
pnpm --filter @rtc/client-react-native test
pnpm exec biome ci .
pnpm --filter @rtc/client-react-native typecheck
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(rn-appearance): power-saver ladder and replay-boot button"
```

---

### Task 7: Record the stale golden

**Files:**
- Modify: `docs/rn-open-items.md`

- [ ] **Step 1: Add the row**

Under §4, record that `shell/appearance` now shows the OLD full-screen overlay and must be re-captured — **with `shell/chrome` (P8) in the same native session**, since both are blocked on the same dev-client build. State plainly that a diff on the next capture is expected, not a regression.

- [ ] **Step 2: Verify links**

```bash
pnpm check:doc-links
```

- [ ] **Step 3: Commit**

```bash
git commit -am "docs(rn): record shell/appearance as the second knowingly-stale golden"
```

---

## Done when

- All six preference behaviours are covered by tests that were each seen to fail first.
- `pnpm --filter @rtc/client-react-native test`, `typecheck`, `biome ci .`, `check:doc-links` all clean.
- The header-width measurement from Task 3 Step 4 is recorded — either "fits" or "moved to its own row".
- Both stale goldens are noted in one place, for one native session.
