# RN mobile-v1 Rehaul — Phase 2: Theme completion + ambient background + motion primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the RN HUD theme surface (add the deferred FX keys + Orbitron wordmark), add the Skia ambient background, seed the remaining pure motion primitives into `@rtc/motion-core`, and rebuild the Appearance sheet to prototype fidelity — surfacing the ambient, power-saver, and dark/light controls.

**Architecture:** Extend the *existing* `RnTheme` model additively (the FX keys the current `tokens.ts` explicitly deferred), sourcing values from `docs/design/mobile/v1/dev-handoff/theme-tokens.ts`. Idle ambient motion is a single Skia component gated on the existing `useAnimatedBackground` preference and RN's OS-level reduced-motion. Per-frame math (tick-flash keying, countdown-ring geometry) lands as pure zero-dependency functions in `@rtc/motion-core`, consumed through thin Skia/Reanimated shells (ADR-005). The Appearance sheet is rebuilt against the prototype, wiring the already-present `useAnimatedBackground`/`usePowerSaver` VM hooks.

**Tech Stack:** Expo SDK 57 / RN 0.86, `@shopify/react-native-skia` 2.6.2, `react-native-reanimated` 4.5.0 + `react-native-worklets` 0.10.0, `expo-blur`, `expo-font` (+ `@expo-google-fonts/orbitron`), `@rtc/motion-core` (pure TS, vitest), jest-expo (render), on-device iOS sign-off.

## Global Constraints

- **Design source of truth:** `docs/superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md` §5 (Phase 2) + §4 (cross-cutting). Token values: `docs/design/mobile/v1/dev-handoff/theme-tokens.ts` (port **verbatim**). Every task's requirements implicitly include these.
- **No domain / client-core / wire changes** (spec §8). The `useAnimatedBackground` and `usePowerSaver` hooks + their `client-core` presenters + `PreferencesPort` members **already exist** — this phase only *consumes* them from RN UI. Do not add a `reducedMotion` preference to `PreferencesPort` (that is a domain change); use RN's OS-level reduced-motion instead (`react-native-reanimated`'s `useReducedMotion()`).
- **Additive theme extension, not a rewrite.** The live type is `RnTheme` (`src/ui/theme/tokens.ts:52-92`) with a `DepthTokens` sub-object (`:18-43`) — **not** the handoff's flat `ThemeTokens`. Add the FX keys to `RnTheme`; keep every existing field and every existing consumer green. The handoff file is the *value* source, not the *shape*.
- **Dumb-UI doctrine:** no `rxjs`/`localStorage`/`fetch` in `src/ui`; data only via the `useViewModel()` seam. `tokens.ts` must stay **vitest-importable** (no RN-runtime imports) — that is why `fontFamilies.ts` holds bare string constants.
- **Perf doctrine (`docs/performance.md`, RN-adapted):** animate only transform/opacity; ambient motion runs as Reanimated worklets on the UI thread; **calm-until-real-event** — the aurora is the *only* idle motion and must stop under the ambient toggle OR reduced-motion.
- **Ambient default is `false` on mobile** (`AsyncStoragePreferencesAdapter.ts:87-91` seeds `animatedBg=false`, overriding the web `true`). The ambient component must render nothing (no worklet, no Skia canvas) when the preference is off — respect the existing default.
- **6 skins × 2 modes = 12 sets:** `classic, holo, holo3d, terminal, terminal3d, neon` × `{dark, light}` (`ThemeSkin`/`ThemeMode` from `@rtc/domain`). All 12 get the new FX keys.
- **All gates cover the package:** Biome, ESLint (base + typed), typecheck, knip, jest+vitest. New native/dev deps require **jest mocks** (Skia is already mocked from Phase 0 — extend, don't duplicate) and follow the freshness policy (`pnpm outdated -r`, 24h cooldown, syncpack single range). New `@rtc/motion-core` files are vitest-covered.
- **`#/` subpath alias**, not `@/`. Biome bans ≥2-up relative imports.
- **On-device sign-off is the primary net** (spec §6): each visual deliverable requires live iOS-simulator acceptance before the phase is done — jest/vitest are blind to RN paint bugs.
- **Cross-phase seam:** the exit-gate **appearance baseline pin** depends on the **Phase 1** visual harness (running in parallel). If Phase 1's harness is not yet merged when Phase 2 is otherwise complete, mark Task 9 deferred and pin the baseline once the harness lands — per the rehaul's "harness is the durable asset, goldens are provisional" phasing (spec §7). Do **not** block the rest of Phase 2 on it.

---

## File Structure

```
packages/motion-core/src/
  tickFlash.ts          — pure tick-direction + flash-nonce keying (NEW)
  tickFlash.test.ts     — vitest (NEW)
  countdownRing.ts      — pure countdown progress + ring-geometry math (NEW)
  countdownRing.test.ts — vitest (NEW)
  index.ts              — re-export the new primitives (MODIFY)

packages/client-react-native/src/ui/theme/
  tokens.ts             — add FX keys to RnTheme + populate all 12 sets (MODIFY)
  tokens.test.ts        — extend coverage for the FX keys (MODIFY)
  fontFamilies.ts       — add FONT_ORBITRON_WORDMARK constant (MODIFY)
  fonts.ts              — register Orbitron in useAppFonts() (MODIFY)

packages/client-react-native/src/ui/ambient/
  AmbientBackground.tsx      — Skia aurora blobs + HUD grid, toggle+reduced-motion gated (NEW)
  AmbientBackground.test.tsx — jest render (NEW)
  useAmbientEnabled.ts       — composes useAnimatedBackground + useReducedMotion (NEW)
  useAmbientEnabled.test.ts  — vitest (NEW, pure logic extracted)

packages/client-react-native/src/ui/
  AppearanceScreen.tsx       — rebuilt to prototype fidelity (MODIFY)
  AppearanceScreen.test.tsx  — extend for new controls (MODIFY)

packages/client-react-native/
  app/_layout.tsx or src/app/AppRoot.tsx — mount <AmbientBackground/> behind the app (MODIFY)
  package.json                            — add @expo-google-fonts/orbitron (MODIFY)
  jest.setup.ts                           — extend Skia mock if new primitives used (MODIFY if needed)
```

---

## Task 1 — Extend `RnTheme` with the FX keys (all 12 sets)

**Files:**
- Modify: `packages/client-react-native/src/ui/theme/tokens.ts` (interface `:52-92`, the `rnThemeTokens` record `:458-465` and the per-skin blocks)
- Modify: `packages/client-react-native/src/ui/theme/tokens.test.ts`

**Interfaces:**
- Consumes: `docs/design/mobile/v1/dev-handoff/theme-tokens.ts` (value source: `gridC`, `aurora`, `glowC`, translucent `panel`).
- Produces: `RnTheme` gains three FX fields — `gridC: string` (HUD grid line color), `aurora: number` (ambient intensity 0..1), `glowC: string | null` (top-level glow color). Every existing field is unchanged; every one of the 12 `rnThemeTokens[skin][mode]` sets is populated.

- [ ] **Step 1: Read both sources.** Read `packages/client-react-native/src/ui/theme/tokens.ts` fully and `docs/design/mobile/v1/dev-handoff/theme-tokens.ts` fully. Build the key map: handoff `ThemeKey` (`'HOLO HUD','HOLO 3D','TERMINAL','TERMINAL 3D','NEON','CLASSIC'` per `theme-tokens.ts:66-73`) → domain `ThemeSkin` (`holo, holo3d, terminal, terminal3d, neon, classic`). Handoff `gridC`/`aurora`/`glowC` are the values to port; note the handoff `panel` values are already translucent (e.g. `rgba(6,26,38,0.85)`) — the current `RnTheme.panel` already exists, so **reconcile** `panel` to the handoff's translucent value in the same edit (it pairs with `expo-blur` in Task 6/7).

- [ ] **Step 2: Write the failing test.** Extend `tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rnThemeTokens } from "./tokens";
import { THEME_SKINS, THEME_MODES } from "@rtc/domain"; // confirm the exact exported names

describe("RnTheme FX keys", () => {
  it("every skin×mode set carries gridC/aurora/glowC", () => {
    for (const skin of THEME_SKINS) {
      for (const mode of THEME_MODES) {
        const t = rnThemeTokens[skin][mode];
        expect(typeof t.gridC).toBe("string");
        expect(t.aurora).toBeGreaterThanOrEqual(0);
        expect(t.aurora).toBeLessThanOrEqual(1);
        // glowC is string|null — flat skins may be null, 3D/neon carry a color
        expect(t.glowC === null || typeof t.glowC === "string").toBe(true);
      }
    }
  });

  it("classic is the calmest (aurora ~0), neon/holo brighter", () => {
    expect(rnThemeTokens.classic.dark.aurora).toBeLessThanOrEqual(rnThemeTokens.neon.dark.aurora);
  });
});
```

> Confirm the exact domain exports for iterating skins/modes (`THEME_SKINS`, `THEME_MODES`, or equivalents) from `@rtc/domain` before finalizing the test — `AppearanceScreen.tsx:84` already iterates `THEME_SKINS`, so that name is live; find the modes equivalent or inline `["dark","light"] as const`.

- [ ] **Step 3: Run to verify it fails.** `pnpm --filter @rtc/client-react-native exec vitest run src/ui/theme/tokens.test.ts` → FAIL (`gridC` undefined).

- [ ] **Step 4: Implement.** Add `gridC: string; aurora: number; glowC: string | null;` to the `RnTheme` interface (with doc comments matching the handoff's). Delete the "FX keys (blur/glow/grid/aurora) dropped" clause from the `:45-51` comment (they are no longer dropped) and note they are now populated from the handoff. Populate all 12 sets with the handoff values via the key map. Where the handoff `panel` differs from the current value, update `panel` to the translucent handoff value.

- [ ] **Step 5: Run to verify it passes.** Same command → PASS. Then run the full theme test file (existing assertions must stay green): confirm no existing `RnTheme` assertion broke.

- [ ] **Step 6: Commit.**
```bash
git add packages/client-react-native/src/ui/theme/tokens.ts packages/client-react-native/src/ui/theme/tokens.test.ts
git commit -m "feat(rn-theme): add FX keys (gridC/aurora/glowC) + translucent panels to RnTheme (12 sets)"
```

---

## Task 2 — Load the Orbitron wordmark font

**Files:**
- Modify: `packages/client-react-native/package.json` (add dep)
- Modify: `packages/client-react-native/src/ui/theme/fontFamilies.ts` (`:9-12`)
- Modify: `packages/client-react-native/src/ui/theme/fonts.ts` (`useAppFonts()` `:18-26`)

**Interfaces:**
- Produces: `FONT_ORBITRON_WORDMARK` string constant; `useAppFonts()` registers Orbitron alongside the existing 4 families.

- [ ] **Step 1: Add the dep.** `pnpm --filter @rtc/client-react-native add @expo-google-fonts/orbitron` then `pnpm outdated -r @expo-google-fonts/orbitron` (accept latest within the 24h cooldown; keep the `^0.4.x` range consistent with the sibling font packages per syncpack).

- [ ] **Step 2: Write the failing constant test.** In a small test (or extend an existing `fonts`/`fontFamilies` test if present):
```ts
import { describe, expect, it } from "vitest";
import { FONT_ORBITRON_WORDMARK } from "#/ui/theme/fontFamilies";

describe("Orbitron wordmark", () => {
  it("exposes a bare family-name constant", () => {
    expect(FONT_ORBITRON_WORDMARK).toBe("Orbitron_600SemiBold");
  });
});
```
Run under vitest → FAIL (`fontFamilies.ts` stays dependency-free/vitest-importable). Pick the concrete weight (`Orbitron_600SemiBold` or `_700Bold`) that matches the prototype wordmark in `dev-handoff/` — read the handoff before choosing; the test asserts the chosen constant.

- [ ] **Step 3: Implement.** Add `export const FONT_ORBITRON_WORDMARK = "Orbitron_600SemiBold";` to `fontFamilies.ts`. In `fonts.ts`, import `Orbitron_600SemiBold` from `@expo-google-fonts/orbitron` and add `[FONT_ORBITRON_WORDMARK]: Orbitron_600SemiBold` to the `useFonts` map.

- [ ] **Step 4: Run to verify it passes** (vitest) and run `pnpm --filter @rtc/client-react-native typecheck`.

- [ ] **Step 5: Commit.**
```bash
git add packages/client-react-native/src/ui/theme/fontFamilies.ts packages/client-react-native/src/ui/theme/fonts.ts packages/client-react-native/package.json pnpm-lock.yaml
git commit -m "feat(rn-theme): load Orbitron wordmark via expo-font"
```

---

## Task 3 — `@rtc/motion-core`: tick-flash keying primitive

**Files:**
- Create: `packages/motion-core/src/tickFlash.ts`
- Create: `packages/motion-core/src/tickFlash.test.ts`
- Modify: `packages/motion-core/src/index.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type TickDirection = "up" | "down" | "flat"`
  - `const TICK_FLASH_EPSILON = 1e-9`
  - `const TICK_FLASH_DURATION_MS` (number — the flash hold; pick to match the web tick-flash if one exists, else 320)
  - `tickDirection(prev: number | null | undefined, next: number): TickDirection`
  - `type TickFlashState = { value: number | null; nonce: number }`
  - `nextTickFlash(state: TickFlashState, next: number): { dir: TickDirection; state: TickFlashState }` — the `nonce` increments only on a non-`flat` change, so a Reanimated shell can key an animation off `nonce` to retrigger the flash on every real tick.

- [ ] **Step 1: Write the failing test.**
```ts
import { describe, expect, it } from "vitest";
import { tickDirection, nextTickFlash, TICK_FLASH_DURATION_MS } from "./tickFlash";

describe("tickDirection", () => {
  it("returns flat for the first value and for sub-epsilon moves", () => {
    expect(tickDirection(null, 1.2345)).toBe("flat");
    expect(tickDirection(1.2345, 1.2345)).toBe("flat");
  });
  it("returns up/down on a real move", () => {
    expect(tickDirection(1.2345, 1.2346)).toBe("up");
    expect(tickDirection(1.2346, 1.2345)).toBe("down");
  });
});

describe("nextTickFlash", () => {
  it("bumps nonce only on a real change", () => {
    const a = nextTickFlash({ value: null, nonce: 0 }, 100);       // flat (first)
    expect(a.dir).toBe("flat");
    expect(a.state.nonce).toBe(0);
    const b = nextTickFlash(a.state, 101);                          // up
    expect(b.dir).toBe("up");
    expect(b.state.nonce).toBe(1);
    const c = nextTickFlash(b.state, 101);                          // flat (unchanged)
    expect(c.state.nonce).toBe(1);
  });
  it("exposes a positive flash duration", () => {
    expect(TICK_FLASH_DURATION_MS).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm --filter @rtc/motion-core exec vitest run src/tickFlash.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `tickFlash.ts`.**
```ts
export type TickDirection = "up" | "down" | "flat";

export const TICK_FLASH_EPSILON = 1e-9;
export const TICK_FLASH_DURATION_MS = 320;

export function tickDirection(prev: number | null | undefined, next: number): TickDirection {
  if (prev == null || Math.abs(next - prev) <= TICK_FLASH_EPSILON) {
    return "flat";
  }
  return next > prev ? "up" : "down";
}

export interface TickFlashState {
  value: number | null;
  nonce: number;
}

export function nextTickFlash(
  state: TickFlashState,
  next: number,
): { dir: TickDirection; state: TickFlashState } {
  const dir = tickDirection(state.value, next);
  const nonce = dir === "flat" ? state.nonce : state.nonce + 1;
  return { dir, state: { value: next, nonce } };
}
```

- [ ] **Step 4: Run to verify it passes** (same command) → PASS.

- [ ] **Step 5: Re-export from `index.ts`.** Add the type + fns + constants to `packages/motion-core/src/index.ts` (follow the existing export grouping).

- [ ] **Step 6: Build + commit.** `pnpm --filter @rtc/motion-core build` (verify `tsc --build && tsc-alias` clean).
```bash
git add packages/motion-core/src/tickFlash.ts packages/motion-core/src/tickFlash.test.ts packages/motion-core/src/index.ts
git commit -m "feat(motion-core): pure tick-flash keying primitive (direction + retrigger nonce)"
```

---

## Task 4 — `@rtc/motion-core`: countdown + ring geometry math

**Files:**
- Create: `packages/motion-core/src/countdownRing.ts`
- Create: `packages/motion-core/src/countdownRing.test.ts`
- Modify: `packages/motion-core/src/index.ts`

**Interfaces:**
- Produces (all pure):
  - `countdownProgress(remainingMs: number, totalMs: number): number` — clamped `0..1` (elapsed fraction: `1` at start, `0` at expiry — choose *remaining* fraction so the ring depletes; document the direction and the test pins it).
  - `ringCircumference(radius: number): number` — `2πr`.
  - `ringDashOffset(radius: number, remainingFraction: number): number` — `circumference * (1 - remainingFraction)`.
  - `const COUNTDOWN_URGENT_FRACTION = 0.25` — threshold a shell uses to switch to the "urgent" color.

- [ ] **Step 1: Write the failing test.**
```ts
import { describe, expect, it } from "vitest";
import {
  countdownProgress, ringCircumference, ringDashOffset, COUNTDOWN_URGENT_FRACTION,
} from "./countdownRing";

describe("countdownProgress (remaining fraction)", () => {
  it("is 1 at start, 0 at expiry, clamped", () => {
    expect(countdownProgress(1000, 1000)).toBe(1);
    expect(countdownProgress(0, 1000)).toBe(0);
    expect(countdownProgress(-50, 1000)).toBe(0);
    expect(countdownProgress(2000, 1000)).toBe(1);
    expect(countdownProgress(500, 1000)).toBeCloseTo(0.5, 5);
  });
  it("guards totalMs<=0", () => {
    expect(countdownProgress(500, 0)).toBe(0);
  });
});

describe("ring geometry", () => {
  it("circumference is 2πr", () => {
    expect(ringCircumference(10)).toBeCloseTo(2 * Math.PI * 10, 6);
  });
  it("dash offset is 0 when full, full circumference when empty", () => {
    const c = ringCircumference(10);
    expect(ringDashOffset(10, 1)).toBeCloseTo(0, 6);
    expect(ringDashOffset(10, 0)).toBeCloseTo(c, 6);
  });
  it("exposes an urgency threshold", () => {
    expect(COUNTDOWN_URGENT_FRACTION).toBeGreaterThan(0);
    expect(COUNTDOWN_URGENT_FRACTION).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm --filter @rtc/motion-core exec vitest run src/countdownRing.test.ts` → FAIL.

- [ ] **Step 3: Implement `countdownRing.ts`.**
```ts
export const COUNTDOWN_URGENT_FRACTION = 0.25;

export function countdownProgress(remainingMs: number, totalMs: number): number {
  if (totalMs <= 0) {
    return 0;
  }
  const frac = remainingMs / totalMs;
  if (frac <= 0) {
    return 0;
  }
  if (frac >= 1) {
    return 1;
  }
  return frac;
}

export function ringCircumference(radius: number): number {
  return 2 * Math.PI * radius;
}

export function ringDashOffset(radius: number, remainingFraction: number): number {
  return ringCircumference(radius) * (1 - remainingFraction);
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Re-export from `index.ts`.**

- [ ] **Step 6: Build + commit.** `pnpm --filter @rtc/motion-core build`.
```bash
git add packages/motion-core/src/countdownRing.ts packages/motion-core/src/countdownRing.test.ts packages/motion-core/src/index.ts
git commit -m "feat(motion-core): pure countdown + ring-geometry math (Credit RFQ rings)"
```

---

## Task 5 — Ambient-enabled selector (pure composition of toggle + reduced-motion)

**Files:**
- Create: `packages/client-react-native/src/ui/ambient/useAmbientEnabled.ts`
- Create: `packages/client-react-native/src/ui/ambient/useAmbientEnabled.test.ts` (vitest — pure decision fn)

**Interfaces:**
- Consumes: `useAnimatedBackground` from the ViewModel seam (`react-bindings`, shape `{ enabled, setEnabled, toggle }`), `useReducedMotion` from `react-native-reanimated`.
- Produces:
  - pure `resolveAmbientEnabled(prefEnabled: boolean, reducedMotion: boolean): boolean` — `prefEnabled && !reducedMotion`.
  - hook `useAmbientEnabled(): boolean` — reads the two sources and returns `resolveAmbientEnabled(...)`.

- [ ] **Step 1: Write the failing test** for the pure fn:
```ts
import { describe, expect, it } from "vitest";
import { resolveAmbientEnabled } from "./useAmbientEnabled";

describe("resolveAmbientEnabled", () => {
  it("is on only when the preference is on and reduced-motion is off", () => {
    expect(resolveAmbientEnabled(true, false)).toBe(true);
    expect(resolveAmbientEnabled(true, true)).toBe(false);
    expect(resolveAmbientEnabled(false, false)).toBe(false);
    expect(resolveAmbientEnabled(false, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** (vitest) → FAIL.

- [ ] **Step 3: Implement.** Keep `resolveAmbientEnabled` a top-level pure fn (vitest-importable — do NOT import RN/reanimated at module top level in a way that breaks vitest; import the hook deps inside the hook only, or keep the hook in the same file but ensure the pure fn is separately importable). Confirm the exact `useAnimatedBackground` return-field name (`enabled`) against `react-bindings/src/createViewModel.ts:214` before wiring.
```ts
import { useReducedMotion } from "react-native-reanimated";
import { useViewModel } from "@rtc/react-bindings";

export function resolveAmbientEnabled(prefEnabled: boolean, reducedMotion: boolean): boolean {
  return prefEnabled && !reducedMotion;
}

export function useAmbientEnabled(): boolean {
  const { useAnimatedBackground } = useViewModel();
  const { enabled } = useAnimatedBackground();
  const reducedMotion = useReducedMotion();
  return resolveAmbientEnabled(enabled, reducedMotion);
}
```

- [ ] **Step 4: Run to verify it passes** → PASS (the pure fn; the hook is exercised by Task 6's render test).

- [ ] **Step 5: Commit.**
```bash
git add packages/client-react-native/src/ui/ambient/useAmbientEnabled.ts packages/client-react-native/src/ui/ambient/useAmbientEnabled.test.ts
git commit -m "feat(rn-ambient): ambient-enabled selector (toggle ∧ ¬reduced-motion)"
```

---

## Task 6 — Skia `AmbientBackground` component + mount

**Files:**
- Create: `packages/client-react-native/src/ui/ambient/AmbientBackground.tsx`
- Create: `packages/client-react-native/src/ui/ambient/AmbientBackground.test.tsx` (jest)
- Modify: the app root — `packages/client-react-native/app/_layout.tsx` (or `src/app/AppRoot.tsx`; confirm which owns the always-mounted background layer)
- Modify (if needed): `packages/client-react-native/jest.setup.ts` — extend the existing Phase-0 Skia mock only if `AmbientBackground` uses Skia primitives not already mocked (Canvas/Group/Circle/Rect/Fill/Path/Line/Paint were mocked in Phase 0; add e.g. `Blur`/`RadialGradient`/`vec` if used).

**Interfaces:**
- Consumes: `useAmbientEnabled` (Task 5), `useTheme()` (RN theme; reads `t.aurora` intensity + `t.gridC`), Skia (`Canvas`, aurora blobs via `Circle`/`RadialGradient`/`Blur`, HUD grid via `Line`), Reanimated shared values for the slow drift.
- Produces: `AmbientBackground(): ReactNode` — renders `null` when `useAmbientEnabled()` is false; otherwise a full-bleed absolutely-positioned Skia canvas (aurora blobs + HUD grid), `pointerEvents="none"`, drift animated with transform/opacity worklets only. Intensity scales with `t.aurora` (so `classic` ≈ off).

- [ ] **Step 1: Write the failing render tests (jest).**
```tsx
import { render, screen } from "@testing-library/react-native";
import { AmbientBackground } from "./AmbientBackground";
// Use the test helpers that inject a ViewModel with a controllable animatedBackground pref
// and a ThemeProvider (see renderWithTheme.tsx / existing test setup for the seam).

test("renders nothing when ambient is disabled", async () => {
  // arrange a VM whose animatedBackground.enabled === false (the mobile default)
  await render(<AmbientBackground />, { /* wrapper: ambient OFF */ });
  expect(screen.queryByTestId("ambient-background")).toBeNull();
});

test("renders the canvas when ambient is enabled", async () => {
  await render(<AmbientBackground />, { /* wrapper: ambient ON */ });
  expect(await screen.findByTestId("ambient-background")).toBeTruthy();
});
```
> Match the render wrapper to the existing RN test seam. `renderWithTheme.tsx` exists in `src/ui/theme/`; find how tests inject a ViewModel (look at `AppearanceScreen.test.tsx` / `AmbientBackground`-adjacent tests) and reuse that harness so the `useAnimatedBackground` hook resolves. If no ready helper toggles the pref, add a minimal in-test `PreferencesPort` stub seeding `animatedBg` true/false (mirror `AsyncStoragePreferencesAdapter` defaults).

- [ ] **Step 2: Run to verify it fails.** `pnpm --filter @rtc/client-react-native exec jest src/ui/ambient/AmbientBackground.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `AmbientBackground.tsx`.** Gate on `useAmbientEnabled()` (early `return null`). Root `<Canvas testID="ambient-background" style={StyleSheet.absoluteFill} pointerEvents="none">`. Aurora = 2–3 soft blurred radial blobs whose color comes from theme accents and whose opacity scales by `t.aurora`; HUD grid = evenly spaced `Line`s in `t.gridC` at low opacity. Drive a slow drift with a Reanimated shared value (`withRepeat(withTiming(...))`) mapped to blob translate/opacity — transform/opacity only, one animation per property (perf doctrine). Keep it a thin shell; any non-trivial geometry math belongs in `motion-core` (none needed here beyond layout).

- [ ] **Step 4: Run to verify it passes** (jest) → PASS. Extend `jest.setup.ts` Skia mock if a used primitive is unmocked (the failure message names it).

- [ ] **Step 5: Mount it.** Add `<AmbientBackground />` as the **backmost** layer of the always-on app shell (behind routed content, in front of the base background color). Confirm the correct owner: the persistent chrome lives in the app root; mount it there so it spans all routes. Verify existing layout tests still pass.

- [ ] **Step 6: Typecheck + full package test + commit.**
```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
git add packages/client-react-native/src/ui/ambient/ packages/client-react-native/app/_layout.tsx packages/client-react-native/jest.setup.ts
git commit -m "feat(rn-ambient): Skia aurora + HUD-grid ambient background (toggle/reduced-motion gated)"
```

- [ ] **Step 7: On-device smoke (record in the task report).** `pnpm dev:ios` from the primary checkout; toggle the ambient pref (temporarily default it on, or via the Task 7 control if built) and confirm the aurora drifts on `holo`/`neon`, is near-invisible on `classic`, and fully stops under iOS Reduce Motion (Settings → Accessibility) and when the toggle is off. No steady-state jank.

---

## Task 7 — Rebuild the Appearance sheet to prototype fidelity

**Files:**
- Modify: `packages/client-react-native/src/ui/AppearanceScreen.tsx` (`:27-76`)
- Modify: `packages/client-react-native/src/ui/AppearanceScreen.test.tsx`
- (Read for fidelity: `docs/design/mobile/v1/dev-handoff/` prototype source + `AppearanceOverlay.tsx`)

**Interfaces:**
- Consumes (all already exist in the ViewModel): `useThemeSkinPreference` (`{ skin, setSkin }`), `useThemePreference` (`{ modePreference, cycle }` — extend usage to a segmented dark/light rather than cycle), `useAnimatedBackground` (`{ enabled, setEnabled, toggle }`), `usePowerSaver` (`{ enabled, setEnabled, toggle }`), and the boot-replay seam (`BOOT_VARIANT_STORAGE_KEY` / `bootSplashGate.ts` — confirm the exact replay hook/preference).
- Produces: a rebuilt Appearance screen matching the prototype: **theme cards** (not a plain list) for the 6 skins, a **segmented dark/light** control, an **ambient toggle**, a **power-saver toggle**, and a **replay-boot** action. All existing testIDs preserved where tests depend on them; new controls get stable testIDs.

- [ ] **Step 1: Write the failing tests (jest).** Extend `AppearanceScreen.test.tsx` — keep the existing skin-select + mode assertions green, add:
```tsx
test("shows an ambient toggle wired to useAnimatedBackground", async () => {
  const setEnabled = jest.fn();
  // render with a VM stub whose useAnimatedBackground returns { enabled:false, setEnabled, toggle }
  fireEvent.press(await screen.findByTestId("appearance-ambient-toggle"));
  expect(setEnabled /* or toggle */).toHaveBeenCalled();
});

test("shows a power-saver toggle wired to usePowerSaver", async () => {
  fireEvent.press(await screen.findByTestId("appearance-powersaver-toggle"));
  // assert the usePowerSaver setter was called
});

test("segmented dark/light sets the mode directly", async () => {
  fireEvent.press(await screen.findByTestId("appearance-mode-light"));
  // assert mode set to "light"
});

test("replay-boot triggers the boot replay seam", async () => {
  fireEvent.press(await screen.findByTestId("appearance-replay-boot"));
  // assert the boot-replay action was invoked
});
```
> Read the current `AppearanceScreen.test.tsx` first and mirror its VM-stub pattern. If `useThemePreference` only exposes `cycle()` (not a direct `set`), either use `cycle()` semantics for the segmented control or confirm a direct setter exists on the hook — do not invent a domain setter; use what the hook provides.

- [ ] **Step 2: Run to verify it fails** → FAIL (testIDs absent).

- [ ] **Step 3: Implement the rebuild.** Replace the plain skin list with theme cards (each shows the skin's swatch/preview using its own `rnThemeTokens[skin][mode]` colors + the display name from the handoff `THEMES` map), a segmented dark/light control, an ambient `Switch` (wired to `useAnimatedBackground`), a power-saver `Switch` (wired to `usePowerSaver`, with a one-line "reduces motion & re-renders" caption), and a replay-boot button (wired to the boot-replay seam). Style via `useThemedStyles`. Honor the dumb-UI rule (no direct storage — all through the hooks). Use `expo-blur` for the panel translucency now that `panel` values are translucent (Task 1).

- [ ] **Step 4: Run to verify it passes** (jest) → PASS, including the preserved existing assertions.

- [ ] **Step 5: Typecheck + full package test + commit.**
```bash
pnpm --filter @rtc/client-react-native typecheck
pnpm --filter @rtc/client-react-native test
git add packages/client-react-native/src/ui/AppearanceScreen.tsx packages/client-react-native/src/ui/AppearanceScreen.test.tsx
git commit -m "feat(rn-appearance): rebuild Appearance sheet — theme cards, segmented mode, ambient + power-saver toggles, replay-boot"
```

- [ ] **Step 6: On-device sign-off (record in report).** `pnpm dev:ios`; verify all 6 theme cards switch skins live, dark/light segments the mode, the ambient toggle actually starts/stops the Task 6 aurora, the power-saver toggle stills motion, and replay-boot re-runs the splash. Sign off across a few skins.

---

## Task 8 — Full theme × mode on-device matrix sign-off

**Files:** none (verification task).

- [ ] **Step 1: Run the app on the iOS simulator** (`pnpm dev:ios` from the primary checkout — the native dev-client already carries the Phase 0 modules; rebuild only if Metro reports a native mismatch).

- [ ] **Step 2: Walk all 6 skins × dark/light (12 combos)** via the rebuilt Appearance sheet. For each, confirm: text contrast is legible, the FX keys read correctly (grid visible where `gridC` is set, glow present on 3D/neon, panels translucent with blur), no clipped shadows on 3D skins, and the ambient intensity matches `aurora` (calm on classic, vivid on neon/holo).

- [ ] **Step 3: Record the pass/fail matrix in the task report.** Any skin that renders wrong → fix in `tokens.ts` (Task 1 values) and re-verify. This is the phase's `all 6 themes × dark/light render correctly on-device` exit gate.

---

## Task 9 — Pin the Appearance visual baseline *(cross-phase — gated on Phase 1 harness)*

**Files:**
- Create (goldens): `packages/client-react-native/tests/visual/__screenshots__/ios-iphone15-18/<tier>/shell/appearance.png` (paths per the Phase 1 harness).
- Modify (if the appearance scenario is not yet registered): the Phase 1 scenario registry to include `shell/appearance`.

**Precondition:** the **Phase 1 visual harness is merged** (`tests/visual/` infra, `EXPO_PUBLIC_VISUAL_HARNESS` route, at least the `simctl` tier). Phase 1 runs in parallel; if it is not yet merged when Tasks 1–8 are complete, **mark this task deferred in the ledger and the phase report**, and pin the baseline as a fast follow once Phase 1 lands. Per spec §7 these goldens are provisional (re-pinned in Phase 7) — deferring the pin does not block Phase 2 sign-off.

- [ ] **Step 1: Confirm Phase 1 is merged** (harness present on the branch base). If not → mark deferred, stop here, note it in the report, and finish the phase.

- [ ] **Step 2: Register the `shell/appearance` scenario** in the Phase 1 registry (pinned skin/mode, sim ports, reduced-motion forced — so the ambient aurora is frozen/absent for a deterministic shot) if the harness does not already carry it.

- [ ] **Step 3: Generate the golden on the pinned device** (`iPhone 15 · iOS 18.x`), eyeball it, and verify the suite passes against its own golden. Follow the Phase 1 README's regenerate recipe (`:update` script, Metro from the worktree).

- [ ] **Step 4: Commit.**
```bash
git add packages/client-react-native/tests/visual/
git commit -m "test(rn-visual): pin appearance-sheet baseline (provisional — re-pinned in Phase 7)"
```

---

## Task 10 — Gate wiring + full gauntlet

**Files:**
- Modify: `knip.json` (RN block — new `@expo-google-fonts/orbitron` dep; `src/ui/ambient/**` entries), `packages/motion-core/*` knip if needed, any tsconfig/eslint include for the new dirs.

- [ ] **Step 1: Wire the new surfaces into the gates.** Add `@expo-google-fonts/orbitron` where the sibling font packages are declared in `knip.json`; ensure `src/ui/ambient/**` and the new `motion-core` files are covered by typecheck + eslint includes (they should be picked up by existing globs — verify, don't assume).

- [ ] **Step 2: Run the full local gauntlet at repo root.**
```bash
pnpm biome ci .
pnpm eslint .
pnpm eslint . --config eslint.config.typed.mjs
pnpm typecheck
pnpm test
pnpm knip
pnpm build
```
Expected: all clean. Fix the recurring RN traps (`func-style`, `useExplicitType`, `no-floating-promises`, `newspaper-order`). `motion-core` must build (`tsc --build && tsc-alias`) and the RN Expo export smoke should still bundle (it carries the Phase-0 worklets x86 tolerance on CI).

- [ ] **Step 3: Commit.**
```bash
git add knip.json
git commit -m "chore(rn): wire Phase 2 deps + dirs into repo gates"
```

---

## Self-Review (completed against the spec)

- **Spec §5 Phase 2 coverage:** FX-key theme extension + translucent panels (Task 1); Orbitron wordmark (Task 2); ambient Skia background honoring the toggle (Tasks 5–6); motion-core primitives — tick-flash (Task 3) + countdown-ring (Task 4), with FLIP/rank-glide noted as *already present*; thin Skia/Reanimated shell pattern established by `AmbientBackground` (Task 6); Appearance sheet rebuilt to fidelity + **power-saver surfaced** per cross-cutting §4 (Task 7); 6×2 on-device matrix (Task 8); appearance baseline pinned, cross-phase-gated (Task 9). ✔
- **No-domain-change (spec §8):** every preference consumed (`animatedBackground`, `powerSaver`) already exists in `PreferencesPort`/presenters/`createViewModel`; reduced-motion uses RN OS-level `useReducedMotion()`, not a new stored pref. No `@rtc/domain`/`client-core`/wire edits. ✔
- **Additive theme model:** `RnTheme` + `DepthTokens` extended, all existing fields/consumers preserved; handoff is the value source, not the shape. ✔
- **Placeholder scan:** the two "confirm the exact live export name" notes (`THEME_MODES` iteration, `useAnimatedBackground` field name, the boot-replay seam, `useThemePreference` setter vs `cycle`) are flagged as *implementer-confirms-against-source*, each naming the exact file to check — not silent TODOs.
- **Type consistency:** `resolveAmbientEnabled(boolean, boolean)` used identically in Tasks 5/6; motion-core signatures (`tickDirection`, `nextTickFlash`, `countdownProgress`, `ringDashOffset`) defined once and re-exported; `RnTheme` FX fields (`gridC:string`, `aurora:number`, `glowC:string|null`) consistent across Tasks 1/6/7.
- **Cross-phase seam explicit:** Task 9's dependency on the parallel Phase 1 harness is called out with a deferral path, matching the rehaul's provisional-goldens phasing.
```
