# Aurora Ambient Style + Draggable Preferences Dialog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable "Ambient style" preference (Aurora | Rays, default Aurora) that brings the v5 design's northern-lights curtain background into all three clients, plus a web-only draggable Preferences dialog.

**Architecture:** A new `ambientStyle` string-union preference threaded through the existing clean-architecture seam (domain → port → 4 adapters → contract → client-core presenter → both bindings), consumed by each client's ambient-background component to branch between the new **Aurora** curtain layers and today's **Rays** blobs+sweep. Drag math is a pure `@rtc/motion-core` function with thin React/Solid shells (ADR-005).

**Tech Stack:** TypeScript, RxJS (`BehaviorSubject`/`shareReplay`), React 19 + `@react-rxjs/core`, SolidJS + `@rx-state/core`, React Native + `@shopify/react-native-skia` + `react-native-reanimated`, Vitest, CSS Modules.

**Reference spec:** [`docs/superpowers/specs/2026-07-18-aurora-ambient-style-design.md`](../specs/2026-07-18-aurora-ambient-style-design.md)

## Global Constraints

- **Preference:** `AmbientStyle = "aurora" | "rays"`; `DEFAULT_AMBIENT_STYLE = "aurora"`; storage key `"rtc-ambient-style"`.
- **Naming:** do **not** rename `animatedBackground` / `AnimatedBackgroundPresenter` / `useAnimatedBackground` (the orthogonal motion gate) or the `--aurora-opacity` / `t.aurora` master-opacity tokens. New presenter is `AmbientStylePresenter`; new hook is `useAmbientStyle`.
- **Import style:** `#/`-subpath alias, never `@/`; Biome bans ≥2-up relative imports. Domain source imports use the `.js` extension (see `preferencesPort.ts`).
- **Dependency rule:** `@rtc/domain` and `@rtc/motion-core` gain **no** new runtime deps. `motion-core` stays zero-dependency (no DOM, no rxjs).
- **Compositor doctrine (`docs/performance.md`):** only `transform`/`opacity` may animate; bake blur into gradient falloff where possible (P5/P6); verify zero `compositeFailed` in a trace before merge.
- **All gates cover every package** — a new preference must satisfy the `PreferencesPortContract` for all 4 adapters and both bindings' `createViewModel` stream tests.
- **Braces mandatory** on all control statements (Biome `useBlockStatements`); run `eslint . --fix` after edits for import/padding fixups.
- **Commits:** end messages with the `Co-Authored-By` / `Claude-Session` trailers used in this repo.

---

## Phase 1 — Preference plumbing (foundation; gates Phases 2 & 3)

### Task 1: Domain type, default, and port interface

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts`
- Modify: `packages/domain/src/ports/preferencesPort.ts`
- Modify: `packages/domain/src/index.ts` (re-export — verify the barrel picks up `preferences.ts`; it already re-exports the other prefs, so no edit is likely needed — confirm with a grep)
- Test: `packages/domain/src/preferences/preferences.test.ts` (create if absent; otherwise add a case)

**Interfaces:**
- Produces: `type AmbientStyle = "aurora" | "rays"`, `const AMBIENT_STYLES: readonly AmbientStyle[]`, `const DEFAULT_AMBIENT_STYLE: AmbientStyle`, and on `PreferencesPort`: `ambientStyle$(): Observable<AmbientStyle>`, `setAmbientStyle(style: AmbientStyle): void`.

- [ ] **Step 1: Write the failing test**

Create/extend `packages/domain/src/preferences/preferences.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AMBIENT_STYLES,
  DEFAULT_AMBIENT_STYLE,
} from "./preferences.js";

describe("ambient style preference", () => {
  it("defaults to aurora", () => {
    expect(DEFAULT_AMBIENT_STYLE).toBe("aurora");
  });

  it("enumerates aurora and rays in selector order", () => {
    expect(AMBIENT_STYLES).toEqual(["aurora", "rays"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rtc/domain test -- preferences.test`
Expected: FAIL — `AMBIENT_STYLES`/`DEFAULT_AMBIENT_STYLE` not exported.

- [ ] **Step 3: Add the type + constants**

In `packages/domain/src/preferences/preferences.ts`, after the `EqBlotterView` type (near line 53) add:

```ts
/** The ambient backdrop style. `aurora` is the v5 default — fixed-palette
 * northern-lights curtains; `rays` is the original accent-tinted blobs +
 * rotating conic sweep. Orthogonal to `animatedBackground` (the motion gate)
 * and to the per-skin `--aurora-opacity` master opacity, which gates whichever
 * style is active. */
export type AmbientStyle = "aurora" | "rays";
```

Add the default near the other `DEFAULT_*` block (after `DEFAULT_ANIMATED_BACKGROUND`, ~line 76):

```ts
/** Ambient backdrop style default. Matches the v5 design (northern-lights
 * curtains). Users who pick "rays" keep that choice (persisted under
 * `rtc-ambient-style`). */
export const DEFAULT_AMBIENT_STYLE: AmbientStyle = "aurora";
```

Add the ordered list near `THEME_SKINS` (~line 96), in Preferences-selector order:

```ts
/** The Preferences "Ambient style" segmented control renders these in order. */
export const AMBIENT_STYLES: readonly AmbientStyle[] = ["aurora", "rays"];
```

- [ ] **Step 4: Add the port members**

In `packages/domain/src/ports/preferencesPort.ts`: add `AmbientStyle` to the type import block (lines 3-11) and add the two members to the `PreferencesPort` interface (after `setAnimatedBackground`, ~line 39):

```ts
  /** Replay-current ambient-style stream; emits synchronously on subscribe.
   * Selects Aurora (curtains) vs Rays (blobs + sweep). Orthogonal to the
   * animatedBackground motion gate. */
  ambientStyle$(): Observable<AmbientStyle>;
  setAmbientStyle(style: AmbientStyle): void;
```

- [ ] **Step 5: Verify barrel export**

Run: `grep -n "AmbientStyle\|DEFAULT_AMBIENT_STYLE" packages/domain/src/index.ts` — if the barrel uses `export * from "./preferences/..."` the symbols flow automatically; if it names exports explicitly, add `AmbientStyle`, `AMBIENT_STYLES`, `DEFAULT_AMBIENT_STYLE`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @rtc/domain test -- preferences.test` → PASS.
Run: `pnpm --filter @rtc/domain typecheck` → PASS (interface now has 2 new members; adapters are typechecked in their own packages later, so domain typecheck is clean here).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/preferences/preferences.ts packages/domain/src/ports/preferencesPort.ts packages/domain/src/preferences/preferences.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): add AmbientStyle preference type + port members"
```

---

### Task 2: Port contract + Simulator adapter

**Files:**
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`
- Modify: `packages/domain/src/simulators/PreferencesSimulator.ts`
- Test: `packages/domain/src/simulators/PreferencesSimulator.contract.test.ts` (runs the shared contract — no edit, just re-run)

**Interfaces:**
- Consumes: `AmbientStyle`, `DEFAULT_AMBIENT_STYLE` (Task 1).
- Produces: contract seed field `ambientStyle?: AmbientStyle` and contract assertions that every adapter must satisfy.

- [ ] **Step 1: Add contract assertions (the failing test)**

In `PreferencesPortContract.ts`: add `ambientStyle?: AmbientStyle` to the seed type (near `animatedBackground?`, ~line 28), import `DEFAULT_AMBIENT_STYLE`, and add an assertions block mirroring the `themeSkin` block:

```ts
  it("defaults ambientStyle to aurora and round-trips a write", async () => {
    const port = createPort();
    expect(await firstValueFrom(port.ambientStyle$())).toBe(
      DEFAULT_AMBIENT_STYLE,
    );
    port.setAmbientStyle("rays");
    expect(await firstValueFrom(port.ambientStyle$())).toBe("rays");
    // late subscriber sees the current value synchronously (replay-current)
    expect(await firstValueFrom(port.ambientStyle$())).toBe("rays");
  });
```

(Match the file's existing helper style — `createPort`, `firstValueFrom` — copy the exact shape of the `animatedBackground` assertions already there.)

- [ ] **Step 2: Run — expect the Simulator contract test to FAIL**

Run: `pnpm --filter @rtc/domain test -- PreferencesSimulator.contract`
Expected: FAIL — `port.ambientStyle$ is not a function`.

- [ ] **Step 3: Implement in the Simulator**

In `PreferencesSimulator.ts`: add `ambientStyle?: AmbientStyle` to the seed (~line 26), a `private readonly ambientStyle = new BehaviorSubject<AmbientStyle>(seed.ambientStyle ?? DEFAULT_AMBIENT_STYLE)` field (~line 69 area), and the two methods (mirror `animatedBackground$`/`setAnimatedBackground`, ~line 112):

```ts
  ambientStyle$(): Observable<AmbientStyle> {
    return this.ambientStyle.asObservable();
  }

  setAmbientStyle(style: AmbientStyle): void {
    this.ambientStyle.next(style);
  }
```

Import `AmbientStyle`, `DEFAULT_AMBIENT_STYLE` from the domain preferences module.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @rtc/domain test -- PreferencesSimulator.contract` → PASS.
Run: `pnpm --filter @rtc/domain typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ports/__contracts__/PreferencesPortContract.ts packages/domain/src/simulators/PreferencesSimulator.ts
git commit -m "feat(domain): PreferencesPortContract + Simulator cover ambientStyle"
```

---

### Task 3: The three storage adapters (React LS, Solid LS, RN AsyncStorage)

All three follow the `themeSkin` precedent exactly. Each has its own contract test that now runs the Task 2 assertions and must go green.

**Files:**
- Modify: `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`
- Tests (re-run, no edit): each package's `preferences.contract.test.ts` / adapter contract test.

**Interfaces:**
- Consumes: `AmbientStyle`, `AMBIENT_STYLES`, `DEFAULT_AMBIENT_STYLE`.
- Produces: `ambientStyle$()` / `setAmbientStyle()` on each adapter; storage key `AMBIENT_STYLE_STORAGE_KEY = "rtc-ambient-style"`.

- [ ] **Step 1: Run the three contract tests — expect FAIL**

Run: `pnpm --filter @rtc/client-react --filter @rtc/client-solid --filter @rtc/client-react-native test -- contract`
Expected: FAIL — adapters lack `ambientStyle$`.

- [ ] **Step 2: React LocalStorage adapter**

In `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`, mirror the `themeSkin` members (grep landmarks: lines 26, 41, 123, 147, 194-200):

Add the import symbols (`AmbientStyle`, `AMBIENT_STYLES`, `DEFAULT_AMBIENT_STYLE`), then:

```ts
export const AMBIENT_STYLE_STORAGE_KEY = "rtc-ambient-style";

function isAmbientStyle(value: string | null): value is AmbientStyle {
  return value !== null && (AMBIENT_STYLES as readonly string[]).includes(value);
}
```

Field + seed (beside `themeSkin`):

```ts
  private readonly ambientStyle: BehaviorSubject<AmbientStyle>;
  // in constructor:
  this.ambientStyle = new BehaviorSubject<AmbientStyle>(
    readStored(AMBIENT_STYLE_STORAGE_KEY, isAmbientStyle, DEFAULT_AMBIENT_STYLE),
  );
```

Methods (beside `themeSkin$`/`setThemeSkin`):

```ts
  ambientStyle$(): Observable<AmbientStyle> {
    return this.ambientStyle.pipe(distinctUntilChanged());
  }

  setAmbientStyle(style: AmbientStyle): void {
    writeStored(AMBIENT_STYLE_STORAGE_KEY, style);
    this.ambientStyle.next(style);
  }
```

- [ ] **Step 3: Solid LocalStorage adapter**

Apply the identical change to `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` (same helpers `readStored`/`writeStored`, same storage key constant, same guard).

- [ ] **Step 4: RN AsyncStorage adapter**

In `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`, mirror the RN `themeSkin` pattern (raw-string storage; grep landmarks lines 40-42, 81-83, 141-143, 190-197). Add:

```ts
const AMBIENT_STYLE_STORAGE_KEY = "rtc-ambient-style";

function isAmbientStyle(value: string | null): value is AmbientStyle {
  return value !== null && (AMBIENT_STYLES as readonly string[]).includes(value);
}
```

Field seeded to `DEFAULT_AMBIENT_STYLE` (no RN override — style default stays aurora):

```ts
  private readonly ambientStyle = new BehaviorSubject<AmbientStyle>(DEFAULT_AMBIENT_STYLE);
```

Add to the `hydrate()` `Promise.all` read block: read `AMBIENT_STYLE_STORAGE_KEY`, and `if (isAmbientStyle(ambientStyle)) { this.ambientStyle.next(ambientStyle); }`. Methods:

```ts
  ambientStyle$(): Observable<AmbientStyle> {
    return this.ambientStyle.pipe(distinctUntilChanged());
  }

  setAmbientStyle(style: AmbientStyle): void {
    void AsyncStorage.setItem(AMBIENT_STYLE_STORAGE_KEY, style).catch(() => {});
    this.ambientStyle.next(style);
  }
```

- [ ] **Step 5: Run the three contract tests → PASS**

Run: `pnpm --filter @rtc/client-react --filter @rtc/client-solid --filter @rtc/client-react-native test -- contract` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts
git commit -m "feat(adapters): implement ambientStyle in all three storage adapters"
```

---

### Task 4: client-core `AmbientStylePresenter`

**Files:**
- Create: `packages/client-core/src/presenters/AmbientStylePresenter.ts`
- Modify: `packages/client-core/src/presenters/index.ts`
- Modify: `packages/client-core/src/composition.ts`
- Test: `packages/client-core/src/presenters/__tests__/AmbientStylePresenter.test.ts`

**Interfaces:**
- Consumes: `PreferencesPort.ambientStyle$/setAmbientStyle`.
- Produces: `class AmbientStylePresenter { readonly style$: Observable<AmbientStyle>; setStyle(style: AmbientStyle): void }`; `Presenters.ambientStyle: AmbientStylePresenter`.

- [ ] **Step 1: Write the failing test**

Create `AmbientStylePresenter.test.ts` (mirror `ThemeSkinPreferencePresenter` test if one exists; otherwise):

```ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { PreferencesSimulator } from "@rtc/domain";
import { AmbientStylePresenter } from "../AmbientStylePresenter.js";

describe("AmbientStylePresenter", () => {
  it("exposes the port stream and writes through", async () => {
    const prefs = new PreferencesSimulator();
    const presenter = new AmbientStylePresenter(prefs);
    expect(await firstValueFrom(presenter.style$)).toBe("aurora");
    presenter.setStyle("rays");
    expect(await firstValueFrom(presenter.style$)).toBe("rays");
  });
});
```

(Verify the exact `@rtc/domain` import path for `PreferencesSimulator` matches the sibling presenter tests.)

- [ ] **Step 2: Run → FAIL** (`AmbientStylePresenter` not found).

Run: `pnpm --filter @rtc/client-core test -- AmbientStylePresenter`

- [ ] **Step 3: Implement the presenter** (copy `ThemeSkinPreferencePresenter.ts` verbatim, swap symbols):

```ts
import { type Observable, shareReplay } from "rxjs";

import type { AmbientStyle, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the ambient-style preference. Exposes the
 * replay-current style stream and the write operation, keeping persistence out
 * of the UI. Orthogonal to AnimatedBackgroundPresenter (the motion gate).
 */
export class AmbientStylePresenter {
  readonly style$: Observable<AmbientStyle>;

  constructor(private readonly preferences: PreferencesPort) {
    this.style$ = preferences
      .ambientStyle$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setStyle(style: AmbientStyle): void {
    this.preferences.setAmbientStyle(style);
  }
}
```

- [ ] **Step 4: Wire it up**

- `presenters/index.ts`: add `export { AmbientStylePresenter } from "./AmbientStylePresenter.js";` (match existing extension convention).
- `composition.ts`: add `ambientStyle: AmbientStylePresenter` to the `Presenters` interface (beside `animatedBackground`, ~line 113) and instantiate `ambientStyle: new AmbientStylePresenter(ports.preferences)` in the presenters object (beside line 272). Import the class.

- [ ] **Step 5: Run → PASS**

Run: `pnpm --filter @rtc/client-core test -- AmbientStylePresenter && pnpm --filter @rtc/client-core typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/client-core/src/presenters/AmbientStylePresenter.ts packages/client-core/src/presenters/index.ts packages/client-core/src/composition.ts packages/client-core/src/presenters/__tests__/AmbientStylePresenter.test.ts
git commit -m "feat(client-core): AmbientStylePresenter + composition wiring"
```

---

### Task 5: Both bindings — `useAmbientStyle`

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts`
- Modify: `packages/solid-bindings/src/createViewModel.ts`
- Test: `packages/react-bindings/src/__tests__/themePreferenceHooks.test.tsx`
- Test: `packages/solid-bindings/src/createViewModel.streams.test.tsx`

**Interfaces:**
- Consumes: `presenters.ambientStyle.style$` / `.setStyle`.
- Produces: `UseAmbientStyleResult { style: AmbientStyle; setStyle: (style: AmbientStyle) => void }`; VM method `useAmbientStyle(): UseAmbientStyleResult`.

- [ ] **Step 1: Write failing binding tests**

In `themePreferenceHooks.test.tsx` add (mirror the `useThemeSkinPreference` case already in the file):

```tsx
it("useAmbientStyle reflects the presenter stream and writes through", async () => {
  const prefs = new PreferencesSimulator();
  const vm = makeViewModel(prefs); // use the file's existing VM factory helper
  const { result } = renderHook(() => vm.useAmbientStyle(), { wrapper });
  expect(result.current.style).toBe("aurora");
  act(() => result.current.setStyle("rays"));
  await waitFor(() => expect(result.current.style).toBe("rays"));
});
```

(Use whatever VM/wrapper helpers the sibling `useThemeSkinPreference` test uses — copy that test's harness exactly.)

Add the analogous case to `createViewModel.streams.test.tsx` for Solid (copy its `useThemeSkinPreference` stream case).

- [ ] **Step 2: Run → FAIL**

Run: `pnpm --filter @rtc/react-bindings --filter @rtc/solid-bindings test -- createViewModel themePreferenceHooks streams`

- [ ] **Step 3: React binding**

In `react-bindings/src/createViewModel.ts` (grep landmarks 111-113, 212, 363-369, 690-691) add `AmbientStyle` to the type imports, then:

```ts
interface UseAmbientStyleResult {
  style: AmbientStyle;
  setStyle: (style: AmbientStyle) => void;
}
```

Add `useAmbientStyle: () => UseAmbientStyleResult;` to the VM type (~line 212). Bind + setter (beside themeSkin, ~363):

```ts
const [useAmbientStyleValue] = bind(
  presenters.ambientStyle.style$,
  DEFAULT_AMBIENT_STYLE,
);
function setAmbientStyle(style: AmbientStyle): void {
  presenters.ambientStyle.setStyle(style);
}
```

Hook (beside `useThemeSkinPreference`, ~690):

```ts
    useAmbientStyle: () => {
      return { style: useAmbientStyleValue(), setStyle: setAmbientStyle };
    },
```

Import `DEFAULT_AMBIENT_STYLE` from `@rtc/domain`.

- [ ] **Step 4: Solid binding**

Apply the mirror in `solid-bindings/src/createViewModel.ts` (interface ~240, hook ~729) following its `useThemeSkinPreference` shape and its `bind` idiom.

- [ ] **Step 5: Run → PASS**

Run: `pnpm --filter @rtc/react-bindings --filter @rtc/solid-bindings test && pnpm --filter @rtc/react-bindings --filter @rtc/solid-bindings typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/react-bindings/src/createViewModel.ts packages/solid-bindings/src/createViewModel.ts packages/react-bindings/src/__tests__/themePreferenceHooks.test.tsx packages/solid-bindings/src/createViewModel.streams.test.tsx
git commit -m "feat(bindings): useAmbientStyle in react + solid createViewModel"
```

---

### Task 6: Phase-1 gauntlet checkpoint

- [ ] **Step 1:** `pnpm build && pnpm typecheck && pnpm test` → all green (plumbing has no UI yet, so nothing renders differently).
- [ ] **Step 2:** `pnpm biome ci . && pnpm eslint . && pnpm stylelint '**/*.css'` (or the repo's exact lint scripts) → clean.
- [ ] **Step 3:** No commit needed if all green; otherwise fix-forward and commit.

---

## Phase 2 — Web Aurora curtains + selector (React, then Solid)

### Task 7: React `AmbientBackground` — Aurora/Rays branch + curtain CSS

**Files:**
- Modify: `packages/client-react/src/ui/shell/background/AmbientBackground.tsx`
- Modify: `packages/client-react/src/ui/shell/background/AmbientBackground.module.css`
- Test: `packages/ui-contract/specs/shell/background/AmbientBackground.contract.spec.ts` (Task 9 covers the shared spec; this task adds the React-local render test if one exists)

**Interfaces:**
- Consumes: `useAmbientStyle()` (Task 5), existing `useAnimatedBackground()`, `usePowerSaver()`.
- Produces: DOM where `data-ambient-style="aurora"|"rays"` is set on `[data-testid="ambient-background"]`, an Aurora layer group under `data-layer="aurora-curtains"`, and the existing blobs+sweep grouped under `data-layer="rays"`.

- [ ] **Step 1: Write the failing contract-style test**

Add to the React ambient test (or the ui-contract spec if that's the render oracle — see Task 9). Minimal React-local assertion:

```tsx
it("renders the aurora curtains when ambientStyle is aurora", () => {
  renderWithVm(<AmbientBackground />, { ambientStyle: "aurora" });
  const root = screen.getByTestId("ambient-background");
  expect(root).toHaveAttribute("data-ambient-style", "aurora");
  expect(root.querySelector('[data-layer="aurora-curtains"]')).not.toBeNull();
  expect(root.querySelector('[data-layer="rays"]')).toBeNull();
});

it("renders the rays layers when ambientStyle is rays", () => {
  renderWithVm(<AmbientBackground />, { ambientStyle: "rays" });
  const root = screen.getByTestId("ambient-background");
  expect(root).toHaveAttribute("data-ambient-style", "rays");
  expect(root.querySelector('[data-layer="rays"]')).not.toBeNull();
});
```

(Use the file's existing VM-render helper; extend the fake VM to expose `useAmbientStyle`.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Update the component**

Read the current `AmbientBackground.tsx`. Add `const { style } = useAmbientStyle();` and set `data-ambient-style={style}` on the root. Split the existing animated block: the two blobs (`.layerA`/`.layerB`) + `.sweep` move under `{style === "rays" && <div data-layer="rays">…</div>}`; add `{style === "aurora" && <div data-layer="aurora-curtains">…</div>}` containing the seven aurora layers (classes below). Keep `.grid`, `.dots`, `.vignette` shared/unchanged. Preserve the `powerSaver` DOM-removal and `--amb-play` gating exactly as today (curtains and rays are both omitted under power saver).

- [ ] **Step 4: Add the Aurora CSS**

Append to `AmbientBackground.module.css`. **Blobs bake blur into the gradient (P6) — no `filter`.** Curtains keep a small blur but animate only `transform`; the repeating-gradient paints once into a promoted layer. Fixed northern-lights palette:

```css
/* AURORA STYLE (v5 "Aurora"): fixed-palette northern-lights curtains.
   Palette is intentionally NOT theme-tinted so it reads as an aurora in every
   skin. Master opacity rides the wrapper at --aurora-opacity (same token that
   gates the rays style). Blob layers bake their softness into the gradient
   falloff (no filter, per docs/performance.md P6); curtain bands keep a small
   blur (they need the comb softened) but animate transform only. */
.auroraWrap {
  position: absolute;
  inset: 0;
  opacity: var(--aurora-opacity);
}

.auroraBlobA {
  position: absolute;
  inset: -12% -6%;
  background:
    radial-gradient(120% 30% at 50% 12%, rgba(61, 255, 171, 0.42) 0%, rgba(45, 212, 191, 0.20) 46%, transparent 74%),
    radial-gradient(90% 24% at 30% 26%, rgba(56, 189, 248, 0.30) 0%, transparent 68%),
    radial-gradient(80% 22% at 74% 6%, rgba(168, 85, 247, 0.38) 0%, rgba(217, 70, 239, 0.14) 52%, transparent 76%);
  opacity: 0.26;
  will-change: transform;
  animation: aurora-a 52s ease-in-out infinite;
  animation-play-state: var(--amb-play, paused);
}

.auroraBlobB {
  position: absolute;
  inset: -12% -6%;
  background:
    radial-gradient(70% 18% at 62% 20%, rgba(217, 70, 239, 0.30) 0%, transparent 64%),
    radial-gradient(95% 26% at 18% 10%, rgba(45, 212, 191, 0.34) 0%, transparent 66%);
  opacity: 0.2;
  will-change: transform;
  animation: aurora-b 68s ease-in-out infinite;
  animation-play-state: var(--amb-play, paused);
}

.auroraCurtainA {
  position: absolute;
  left: -18%;
  right: -18%;
  top: -6%;
  height: 46%;
  background: repeating-linear-gradient(
    94deg,
    transparent 0px, rgba(61, 255, 171, 0.10) 14px, rgba(61, 255, 171, 0.42) 26px,
    rgba(45, 212, 191, 0.18) 40px, transparent 58px, transparent 92px,
    rgba(56, 189, 248, 0.30) 110px, rgba(61, 255, 171, 0.12) 126px, transparent 148px, transparent 205px
  );
  border-radius: 0 0 50% 50% / 0 0 100% 100%;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.95) 6%, rgba(0, 0, 0, 0.6) 45%, rgba(0, 0, 0, 0.18) 75%, transparent 100%);
  opacity: 0.30;
  filter: blur(9px);
  will-change: transform;
  animation: aurora-c 44s ease-in-out infinite;
  animation-play-state: var(--amb-play, paused);
}

.auroraCurtainB {
  position: absolute;
  left: -18%;
  right: -18%;
  top: -4%;
  height: 40%;
  background: repeating-linear-gradient(
    86deg,
    transparent 0px, transparent 44px, rgba(168, 85, 247, 0.36) 66px, rgba(217, 70, 239, 0.16) 84px,
    transparent 106px, transparent 170px, rgba(61, 255, 171, 0.22) 192px, transparent 216px, transparent 275px
  );
  border-radius: 0 0 60% 40% / 0 0 100% 100%;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.9) 4%, rgba(0, 0, 0, 0.5) 42%, rgba(0, 0, 0, 0.12) 72%, transparent 100%);
  opacity: 0.24;
  filter: blur(13px);
  will-change: transform;
  animation: aurora-d 61s ease-in-out infinite;
  animation-play-state: var(--amb-play, paused);
}

.auroraCurtainC {
  position: absolute;
  left: -14%;
  right: -14%;
  top: 2%;
  height: 30%;
  background: repeating-linear-gradient(
    91deg,
    transparent 0px, transparent 26px, rgba(255, 255, 255, 0.16) 34px, rgba(61, 255, 171, 0.30) 42px,
    transparent 54px, transparent 120px
  );
  border-radius: 0 0 45% 55% / 0 0 100% 100%;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.9) 8%, rgba(0, 0, 0, 0.35) 55%, transparent 92%);
  opacity: 0.22;
  filter: blur(5px);
  will-change: transform;
  animation: aurora-e 27s ease-in-out infinite;
  animation-play-state: var(--amb-play, paused);
}

.auroraWash {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 52%;
  background: linear-gradient(180deg, rgba(168, 85, 247, 0.14) 0%, rgba(56, 189, 248, 0.06) 55%, transparent 100%);
  opacity: 0.5;
}
```

Add the three curtain keyframes (kebab-case, house convention) beside the existing `aurora-a`/`aurora-b`:

```css
@keyframes aurora-c {
  0% { transform: translate3d(-4%, -2%, 0) skewX(-4deg) scaleY(1.05); }
  50% { transform: translate3d(5%, 2%, 0) skewX(5deg) scaleY(1.18); }
  100% { transform: translate3d(-4%, -2%, 0) skewX(-4deg) scaleY(1.05); }
}
@keyframes aurora-d {
  0% { transform: translate3d(4%, 1%, 0) skewX(6deg) scaleY(1.14); }
  50% { transform: translate3d(-5%, -2%, 0) skewX(-5deg) scaleY(1.02); }
  100% { transform: translate3d(4%, 1%, 0) skewX(6deg) scaleY(1.14); }
}
@keyframes aurora-e {
  0% { transform: translate3d(-2%, 0, 0) skewX(-2deg) scaleY(1); }
  33% { transform: translate3d(3%, 1%, 0) skewX(4deg) scaleY(1.22); }
  66% { transform: translate3d(-1%, -1%, 0) skewX(-3deg) scaleY(1.08); }
  100% { transform: translate3d(-2%, 0, 0) skewX(-2deg) scaleY(1); }
}
```

Add the three curtain classes to the existing `@media (prefers-reduced-motion: reduce)` `animation: none` list.

- [ ] **Step 5: Run → PASS** the render tests.

Run: `pnpm --filter @rtc/client-react test -- AmbientBackground`

- [ ] **Step 6: Commit**

```bash
git add packages/client-react/src/ui/shell/background/AmbientBackground.tsx packages/client-react/src/ui/shell/background/AmbientBackground.module.css
git commit -m "feat(client-react): Aurora curtain style behind ambientStyle branch"
```

---

### Task 8: React Preferences — "Ambient style" selector row

**Files:**
- Modify: `packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx`
- Test: React PreferencesModal test (or the ui-contract spec, Task 9)

**Interfaces:**
- Consumes: `useAmbientStyle()`, the existing `PrefSegment` component.
- Produces: a real (non-decorative) `PrefSegment` row labelled "Ambient style" with options Aurora/Rays wired to `setStyle`.

- [ ] **Step 1: Failing test**

```tsx
it("shows the current ambient style and switches it", async () => {
  const setStyle = vi.fn();
  renderModal({ ambientStyle: "aurora", setAmbientStyle: setStyle });
  const rays = screen.getByRole("button", { name: /rays/i });
  await userEvent.click(rays);
  expect(setStyle).toHaveBeenCalledWith("rays");
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

In `PreferencesModal.tsx`: read `const { style: ambientStyle, setStyle: setAmbientStyle } = useAmbientStyle();` (beside the existing `useAnimatedBackground`/`usePowerSaver` reads, ~line 24). In the DISPLAY section, directly below the "Animated background" toggle (~line 87), add a real segment row:

```tsx
<PrefSegment
  label="Ambient style"
  hint="Northern-lights curtains or the original accent rays."
  options={[
    { id: "aurora", label: "Aurora" },
    { id: "rays", label: "Rays" },
  ]}
  value={ambientStyle}
  onChange={(id) => setAmbientStyle(id as AmbientStyle)}
/>
```

(Match `PrefSegment`'s actual prop names — read the component; the shape above is illustrative. Import `AmbientStyle` from `@rtc/domain`.)

- [ ] **Step 4: Run → PASS.**  `pnpm --filter @rtc/client-react test -- PreferencesModal`

- [ ] **Step 5: Commit**

```bash
git add packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx
git commit -m "feat(client-react): Ambient style selector row in Preferences"
```

---

### Task 9: Solid parity + shared ui-contract specs

**Files:**
- Modify: `packages/client-solid/src/ui/shell/background/AmbientBackground.tsx` + `.module.css`
- Modify: `packages/client-solid/src/ui/shell/prefs/PreferencesModal.tsx`
- Modify: `packages/ui-contract/specs/shell/background/AmbientBackground.contract.spec.ts`
- Modify: `packages/ui-contract/specs/shell/prefs/PreferencesModal.contract.spec.ts`
- Modify: `packages/ui-contract/shared/pages/shell/...` (page objects — add ambient-style segment accessor)
- Modify: `packages/ui-contract/visual/appData.ts` + `visual/fixtures.ts` (both-style scenarios)

**Interfaces:**
- Consumes: everything from Tasks 7-8.
- Produces: a shared contract assertion both React and Solid pass; a page-object accessor `ambientStyleSegment` / `selectAmbientStyle(style)`.

- [ ] **Step 1: Add the shared contract spec (failing for Solid)**

In `AmbientBackground.contract.spec.ts`, assert both branches render (`data-ambient-style` + presence of `aurora-curtains`/`rays` layers) via the harness. In `PreferencesModal.contract.spec.ts`, assert the "Ambient style" segment exists, shows the active option, and calls the VM setter. Add the page-object accessor.

- [ ] **Step 2: Run the Solid contract tier → FAIL** (Solid UI not updated yet).

Run: `pnpm --filter @rtc/client-solid test -- contract`

- [ ] **Step 3: Port the Solid UI**

Copy the React changes into the Solid components: `AmbientBackground.tsx` (Solid `<Show>`/`<Switch>` for the branch, same `data-*` attributes), the `.module.css` (identical content), and `PreferencesModal.tsx` (Solid `PrefSegment` equivalent, same options/labels/hint).

- [ ] **Step 4: Run both contract tiers → PASS**

Run: `pnpm --filter @rtc/client-react --filter @rtc/client-solid test -- contract`

- [ ] **Step 5: Regenerate visual goldens (local witness only; CI regenerates post-merge)**

Add both-style scenarios to `visual/appData.ts` / `fixtures.ts`, then regenerate per the repo's visual workflow (`RTC_VISUAL_MAX_PARALLEL=1`). Goldens are **not** a PR gate (post-merge `visual.yml`), so this is a witness step; commit any intended golden changes.

- [ ] **Step 6: Commit**

```bash
git add packages/client-solid packages/ui-contract
git commit -m "feat(client-solid,ui-contract): ambient-style parity + shared contract specs"
```

---

### Task 10: React/Solid performance verification (compositor doctrine)

**Files:** none (verification + possible CSS tweak to Task 7/9).

- [ ] **Step 1: Trace the Aurora steady state**

Run `pnpm dev:react`, select Aurora + Animated background ON, on a holo/neon skin. Capture a Chrome performance trace per `docs/performance.md` §3 (profiling recipe).

- [ ] **Step 2: Assert zero `compositeFailed`**

Inspect the trace for `compositeFailed` events on the curtain/blob layers. Steady state must show **zero**.

- [ ] **Step 3: If any curtain shows `compositeFailed`** (most likely from `filter: blur()` on an animated layer): reduce the blur radius and widen the transparent bands in the `repeating-linear-gradient` to preserve softness, or move the blur into a static parent while animating a child — re-trace until zero. Apply the same change to both web clients' CSS.

- [ ] **Step 4: Record the result** — note the measured steady-state GPU delta for the `performance.md` update (Task 16). Commit any CSS tweak.

```bash
git commit -am "perf(client-*): keep Aurora curtains compositor-only (zero compositeFailed)"
```

---

## Phase 3 — React Native Aurora (Skia approximation)

### Task 11: RN `ambientStyle` VM read + segmented selector

**Files:**
- Modify: `packages/client-react-native/src/ui/AppearanceScreen.tsx`
- Test: `packages/client-react-native/src/ui/AppearanceScreen.test.tsx` (if present)

**Interfaces:**
- Consumes: `useAmbientStyle()` (Task 5).
- Produces: a segmented control in the Motion section with `testID` `appearance-ambient-aurora` / `appearance-ambient-rays`.

- [ ] **Step 1: Failing test** — assert both testIDs render and pressing "Rays" calls `setStyle("rays")` (mirror the existing Mode dark/light segmented test).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — read `const { style: ambientStyle, setStyle } = useAmbientStyle();`; add a segmented row copying the inline dark/light pattern (lines 81-110, styles 325-353):

```tsx
<View style={styles.segmented}>
  <Pressable testID="appearance-ambient-aurora"
    style={ambientStyle === "aurora" ? styles.segmentActive : styles.segment}
    onPress={() => { setStyle("aurora"); }}>
    <Text style={styles.segmentLabel}>Aurora</Text>
  </Pressable>
  <Pressable testID="appearance-ambient-rays"
    style={ambientStyle === "rays" ? styles.segmentActive : styles.segment}
    onPress={() => { setStyle("rays"); }}>
    <Text style={styles.segmentLabel}>Rays</Text>
  </Pressable>
</View>
```

- [ ] **Step 4: Run → PASS.** `pnpm --filter @rtc/client-react-native test -- AppearanceScreen`
- [ ] **Step 5: Commit** `feat(client-react-native): Ambient style segmented selector`

---

### Task 12: RN `AmbientBackground` — Skia Aurora branch (approximation)

**Files:**
- Modify: `packages/client-react-native/src/ui/ambient/AmbientBackground.tsx`
- Test: `packages/client-react-native/src/ui/ambient/AmbientBackground.test.tsx`

**Interfaces:**
- Consumes: `useAmbientStyle()`, existing `useAmbientEnabled()`, the Reanimated `progress` value.
- Produces: an aurora curtain layer set drawn when `style === "aurora"`; the existing blobs+grid remain as the `rays` branch.

> **Highest-risk task. Approximation, not pixel-match. Needs the user's iOS simulator + an Opus paint review before merge.**

- [ ] **Step 1: Failing unit test** (Skia is mocked in `jest.setup.ts`, so assert branch logic, not pixels):

```tsx
it("draws the aurora curtain group when ambientStyle is aurora and ambient is enabled", () => {
  renderAmbient({ ambientStyle: "aurora", animatedBackground: true, reducedMotion: false });
  expect(screen.getByTestId("ambient-aurora-curtains")).toBeTruthy();
});
it("draws the rays blobs when ambientStyle is rays", () => {
  renderAmbient({ ambientStyle: "rays", animatedBackground: true, reducedMotion: false });
  expect(screen.getByTestId("ambient-rays-blobs")).toBeTruthy();
});
```

(Add matching `testID` wrappers/groups. Extend the test's fake VM to expose `useAmbientStyle`. Mirror the existing `AmbientBackground.test.tsx` harness.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the branch**

Read the current component. Keep `useAmbientEnabled()` as the mount gate unchanged. Add `const { style } = useAmbientStyle();`. Wrap the existing blobs under a `rays` group (`testID="ambient-rays-blobs"`); add an `aurora` group (`testID="ambient-aurora-curtains"`). The HUD grid stays shared. Aurora curtains in Skia (approximation):

- Three vertical curtain bands as `<Rect>`/`<RoundedRect>` (or a `<Path>` with an arched bottom), each filled with a vertical `<LinearGradient>` shader using the fixed aurora palette color-stops, softened with `<Blur blur={6..12} />`.
- Fade top→bottom with a gradient mask: wrap each band in `<Mask mask={<Rect><LinearGradient .../></Rect>}>` (opaque→transparent top-to-bottom), or composite a `BlendMode.DstIn` gradient over the group.
- Sway via the existing single `progress` shared value driving each band's `transform` (a small horizontal translate + skew analogue), reusing the per-blob `sign` phase idea.
- Static opacities scaled by `t.aurora` (the RN master-opacity token), matching the web layer opacities (0.2–0.3 range).

- [ ] **Step 4: Run unit test → PASS.** `pnpm --filter @rtc/client-react-native test -- ambient`

- [ ] **Step 5: On-device verification (needs user's simulator)**

Run `pnpm dev:ios`. Toggle Aurora/Rays in Appearance with Animated background ON; confirm the curtains read as an aurora, sway smoothly, respect the master opacity per skin, and that turning Animated background OFF / OS reduced-motion still freezes/hides correctly. Screenshot both styles.

- [ ] **Step 6: Opus paint review**

Request an Opus review of the RN visual (the established net for RN paint bugs). If faithful curtains prove impractical in Skia, fall back to the documented simplified aurora (layered blurred gradient bands without the repeating comb) — still a distinct, credible aurora — and note the deviation in `docs/design/mobile/v1/dev-handoff/HANDOFF.md`.

- [ ] **Step 7: Commit** `feat(client-react-native): Skia Aurora curtain approximation behind ambientStyle`

---

## Phase 4 — Draggable Preferences dialog (web only; parallelizable with Phase 2/3)

### Task 13: `@rtc/motion-core` — `clampDragOffset`

**Files:**
- Create: `packages/motion-core/src/drag/clampDragOffset.ts`
- Modify: `packages/motion-core/src/index.ts`
- Test: `packages/motion-core/src/drag/clampDragOffset.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DragOffset { x: number; y: number }
  export interface Size { width: number; height: number }
  export function clampDragOffset(next: DragOffset, dialog: Size, viewport: Size, margin: number): DragOffset;
  ```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { clampDragOffset } from "./clampDragOffset.js";

const dialog = { width: 800, height: 600 };
const viewport = { width: 1440, height: 900 };
// centered dialog: free travel = (viewport - dialog) / 2 minus margin.
// x range ±(1440-800)/2 = ±320 → minus margin 16 → ±304. y: ±(900-600)/2-16 = ±134.

describe("clampDragOffset", () => {
  it("passes through an in-bounds offset unchanged", () => {
    expect(clampDragOffset({ x: 100, y: -50 }, dialog, viewport, 16)).toEqual({ x: 100, y: -50 });
  });
  it("clamps x to the right edge", () => {
    expect(clampDragOffset({ x: 9999, y: 0 }, dialog, viewport, 16)).toEqual({ x: 304, y: 0 });
  });
  it("clamps y to the top edge", () => {
    expect(clampDragOffset({ x: 0, y: -9999 }, dialog, viewport, 16)).toEqual({ x: 0, y: -134 });
  });
  it("degrades gracefully when the dialog is larger than the viewport", () => {
    // range would be negative; clamp collapses to 0 so the dialog stays centered.
    const big = { width: 2000, height: 1200 };
    expect(clampDragOffset({ x: 500, y: 500 }, big, viewport, 16)).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @rtc/motion-core test -- clampDragOffset`

- [ ] **Step 3: Implement**

```ts
export interface DragOffset {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Clamp a drag offset so a viewport-centered dialog stays within the viewport
 * by at least `margin` px on every side (keeping its drag-handle header
 * reachable). Pure — the caller supplies measured sizes; no DOM.
 *
 * A centered element can travel (viewport - dialog) / 2 in each direction
 * before its far edge hits the viewport edge; `margin` shrinks that travel.
 * When the dialog is larger than the viewport the travel goes negative, so we
 * floor it at 0 and the dialog holds centered.
 */
export function clampDragOffset(
  next: DragOffset,
  dialog: Size,
  viewport: Size,
  margin: number,
): DragOffset {
  const rangeX = Math.max(0, (viewport.width - dialog.width) / 2 - margin);
  const rangeY = Math.max(0, (viewport.height - dialog.height) / 2 - margin);
  return {
    x: Math.max(-rangeX, Math.min(rangeX, next.x)),
    y: Math.max(-rangeY, Math.min(rangeY, next.y)),
  };
}
```

- [ ] **Step 4: Export** — add `export * from "./drag/clampDragOffset.js";` to `packages/motion-core/src/index.ts` (match the file's extension/barrel convention).

- [ ] **Step 5: Run → PASS + typecheck.** `pnpm --filter @rtc/motion-core test && pnpm --filter @rtc/motion-core typecheck`

- [ ] **Step 6: Commit** `feat(motion-core): clampDragOffset pure drag-clamp math`

---

### Task 14: React draggable dialog shell

**Files:**
- Create: `packages/client-react/src/ui/shell/prefs/useDraggableDialog.ts`
- Modify: `packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx` + `.module.css`
- Test: `packages/client-react/src/ui/shell/prefs/useDraggableDialog.test.ts`

**Interfaces:**
- Consumes: `clampDragOffset` (Task 13).
- Produces: `useDraggableDialog({ open }): { offset: DragOffset; headerProps; dialogStyle }` — `headerProps` spreads `onPointerDown`/`style` onto the header; `dialogStyle` carries `transform: translate(...)`.

- [ ] **Step 1: Failing hook test**

```ts
it("resets the offset to zero when the dialog closes", () => {
  const { result, rerender } = renderHook(({ open }) => useDraggableDialog({ open }), {
    initialProps: { open: true },
  });
  act(() => result.current.setOffsetForTest?.({ x: 40, y: 20 })); // or simulate pointer events
  rerender({ open: false });
  expect(result.current.offset).toEqual({ x: 0, y: 0 });
});
```

(If the hook exposes no test seam, drive it via synthetic pointer events on a mounted header; assert `offset` after `pointerup`, then close → reset. Keep the test deterministic — inject viewport/dialog sizes or stub `getBoundingClientRect`.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the hook**

The hook holds `offset` state, a drag-origin ref, reads `dialogRef`/viewport sizes on `pointerdown`, updates `offset = clampDragOffset(...)` on `pointermove`, releases on `pointerup`/`pointercancel`, and resets `offset` to `{0,0}` in an effect keyed on `open` (so reopening re-centers). `headerProps.onPointerDown` ignores events whose `target` carries `data-nodrag`. Return `dialogStyle = { transform: translate(${offset.x}px, ${offset.y}px) }`.

- [ ] **Step 4: Wire into PreferencesModal**

Call `useDraggableDialog({ open })`; spread `headerProps` on the dialog header; apply `dialogStyle` to the dialog panel; add `data-nodrag` to the ✕ close button; add `cursor: grab` (`:active { cursor: grabbing }`) to the header in the CSS module. Modal semantics (focus trap, backdrop, Esc) unchanged.

- [ ] **Step 5: Run → PASS.** `pnpm --filter @rtc/client-react test -- useDraggableDialog PreferencesModal`

- [ ] **Step 6: Commit** `feat(client-react): draggable Preferences dialog (motion-core clamp)`

---

### Task 15: Solid draggable dialog shell

**Files:**
- Create: `packages/client-solid/src/ui/shell/prefs/useDraggableDialog.ts` (Solid primitive)
- Modify: `packages/client-solid/src/ui/shell/prefs/PreferencesModal.tsx` + `.module.css`
- Test: `packages/client-solid/src/ui/shell/prefs/useDraggableDialog.test.ts`

- [ ] **Step 1: Failing test** — Solid equivalent of Task 14 Step 1 (createRoot/signals; assert `offset()` resets on close).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the Solid primitive using signals + the same `clampDragOffset` import and `data-nodrag`/reset-on-close behavior.
- [ ] **Step 4: Wire into the Solid PreferencesModal** (same header props, `dialogStyle`, cursor CSS).
- [ ] **Step 5: Run → PASS.** `pnpm --filter @rtc/client-solid test -- useDraggableDialog PreferencesModal`
- [ ] **Step 6: Commit** `feat(client-solid): draggable Preferences dialog parity`

---

## Phase 5 — Docs, goldens, and the full gauntlet

### Task 16: Documentation (four-doc template)

**Files:**
- Modify: `packages/client-react/src/ui/shell/background/README.md`
- Modify: `docs/performance.md`
- Modify: `docs/power-saver-mode.md`
- Modify: `docs/design/web/v5/CHANGELOG.md` + `docs/design/web/v5/dev-handoff/HANDOFF.md`
- Modify: `docs/architecture/17-web-client-up-close.md` (only if it cites the ambient layer inventory)
- Modify: `docs/design/mobile/v1/dev-handoff/HANDOFF.md` (RN aurora note, incl. any Skia deviation from Task 12)

- [ ] **Step 1: Background README** — expand the header narrative to describe **both** styles: Aurora (fixed-palette curtains, keyframes `aurora-c`/`aurora-d`/`aurora-e`) vs Rays (`.layerA`/`.layerB`/`.sweep`), the `ambientStyle` preference (default aurora, key `rtc-ambient-style`), and the retained `--aurora-opacity` master-opacity naming (why it wasn't renamed).
- [ ] **Step 2: performance.md** — add a fix-pattern note for the Aurora curtains: blobs bake blur into gradient falloff (P6, no filter); curtain bands keep a small blur but animate transform only, verified zero `compositeFailed` (Task 10). Record the measured steady-state GPU delta. If a trap row is warranted (blurred animated layer), add it to §1.
- [ ] **Step 3: power-saver-mode.md** — extend the "What it changes" table row: the Aurora curtain layers (like the rays blobs/sweep/dots) are **removed from the DOM** under power saver, not paused.
- [ ] **Step 4: design v5 CHANGELOG + HANDOFF** — note the app now ships the Aurora/Rays selector (design→app parity), with the pref key and default.
- [ ] **Step 5: mobile HANDOFF** — note the RN Skia Aurora approximation and any simplified-fallback deviation from Task 12.
- [ ] **Step 6: Run the doc-link gate** — `pnpm check:doc-links` → clean (fix any broken anchors/links).
- [ ] **Step 7: Commit** `docs: document Aurora ambient style across README/perf/power-saver/design`

---

### Task 17: Full gauntlet + STATUS + whole-branch review

- [ ] **Step 1: Full gauntlet** — `pnpm build && pnpm typecheck && pnpm test`, then `pnpm biome ci .`, `pnpm eslint .` (both configs), `pnpm stylelint`, `pnpm knip`, and the **react and solid** UI-contract-coverage gates (both clients render the new UI — power-saver lesson: run BOTH). All green.
- [ ] **Step 2: Update `docs/STATUS.md`** — invoke the tracking-workstream-status skill; add this workstream (or mark it complete on merge).
- [ ] **Step 3: Whole-branch review** — invoke `superpowers:requesting-code-review` (or `/code-review high`) over the full diff; address findings.
- [ ] **Step 4: Ship** — follow `shipping-repo-changes`: push, open PR, loop CI to green, triage catch-up, merge with `--merge`, confirm on `origin/main`, remove the worktree.

---

## Self-review notes (author)

- **Spec coverage:** §2 plumbing → Tasks 1-5; §3 rendering → Tasks 7/9 (web), 11-12 (RN); §3d selector → Tasks 8/9/11; §4 perf → Task 10 + Task 16 Step 2; §5 draggable → Tasks 13-15; §6 docs → Task 16; §7 testing/gates → per-task + Task 17. All covered.
- **Type consistency:** `AmbientStyle`, `DEFAULT_AMBIENT_STYLE`, `AMBIENT_STYLES`, `AMBIENT_STYLE_STORAGE_KEY = "rtc-ambient-style"`, `AmbientStylePresenter.style$`/`setStyle`, `useAmbientStyle()→{ style, setStyle }`, `clampDragOffset(next, dialog, viewport, margin)` used identically throughout.
- **Illustrative-shape caveats:** `PrefSegment` props (Task 8) and the exact VM/wrapper test helpers are marked "match the file" — implementers must read the sibling `themeSkin`/`animatedBackground` code and mirror its exact API rather than the illustrative shape.
