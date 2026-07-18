# Power-Saver "Freeze" Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third power-saver level — **Freeze** — that disables *all* decorative motion (on top of Calm's ambient-removal + price-conflation) so the web app is snappy on GPU-less Citrix/VDI hardware, while keeping the market readable (live numbers + direction colour) and the static-neon HUD intact.

**Architecture:** The boolean `powerSaver` preference becomes an ordered enum `PowerSaverLevel = "off" | "calm" | "freeze"` (`Freeze ⊇ Calm`). Freeze is realised in the **view layer only** via one global CSS catch-all keyed on `[data-power-saver="freeze"]` (neutralises every animation/transition at once) plus JS gates for imperative motion CSS can't reach (WAAPI FLIP/rank-glide reuse their reduced-motion no-op; the FPS-meter rAF loop pauses; the boot canvas is skipped). Preference plumbing lands in every client; Freeze **visuals** land in React + Solid; RN accepts the enum but renders Freeze as Calm (deferred follow-up).

**Tech Stack:** TypeScript, RxJS, React 19 + `@react-rxjs/core` (react-bindings), SolidJS + `@rx-state/core` (solid-bindings), CSS Modules + global `index.css`, Vitest, Playwright, pnpm workspaces + Turborepo.

**Design spec:** [`docs/superpowers/specs/2026-07-18-power-saver-freeze-tier-design.md`](../specs/2026-07-18-power-saver-freeze-tier-design.md)

## Global Constraints

- **Ordered enum, `Freeze ⊇ Calm`:** `type PowerSaverLevel = "off" | "calm" | "freeze"`; default `"off"`. `isCalm = level !== "off"` drives **everything Calm does today** (ambient layer removal, `--fx-play: paused`, price/history conflation — **unchanged rates**). `isFreeze = level === "freeze"` drives the new catch-all + JS gates. Freeze adds NO further price slowdown — it removes the *flash*, not the *data*.
- **Rename, don't retype.** The port accessor is renamed `powerSaver` → `powerSaverLevel` (and `setPowerSaver` → `setPowerSaverLevel`). Do NOT keep the name with a `boolean → string` type change: every current `if (powerSaver)` is a truthy test that `"off"` would silently pass.
- **Storage key unchanged, value migrated.** Key stays `rtc-power-saver` (localStorage + AsyncStorage). Read-migration: a valid level string passes; legacy `"true"` → `"calm"`; `"false"` / missing / invalid → `"off"`. Writes always store the level string.
- **Keep the repo green at every task boundary.** Task 1 folds in ALL `PreferencesPort` implementors (simulator + 3 storage adapters) and keeps a presenter compat shim (`enabled$`/`set`/`toggle`) so the untouched bindings/components/harness keep compiling; the shim is removed in Task 2 when the bindings switch. Each task ends compiling + its covering tests green.
- **The contract flip is atomic across frameworks (Task 2).** The shared `@rtc/ui-contract` harness (`world.ts`, `mount.ts`), page objects, and power specs are consumed by BOTH clients' contract runs, and the fake `usePowerSaver` hooks live in each client's mount adapter. Changing the observable power-saver contract therefore requires both bindings + both clients' components + the shared harness + the specs to move together — it cannot be split React-then-Solid.
- **CSS parity gate.** Any new/edited React `*.module.css` must have a byte-identical Solid twin, OR be added to `REACT_ONLY_MODULE_CSS`. The global `index.css` catch-all is a non-module file — add the identical block to BOTH clients.
- **Both contract-coverage gates.** CI job-1 runs BOTH `@rtc/client-react` and `@rtc/client-solid` `test:ui:contract:coverage`. Shared power specs must pass against BOTH clients (both implement Freeze) — no `notYetPortedSpecs` exclusion is added or removed for `shell/power`.
- **Braces on all control statements** (Biome `style/useBlockStatements`); no `≥2`-up relative imports (use `#/` subpath alias); run `pnpm lint:eslint` not just Biome before declaring green (Biome-clean ≠ CI-clean).
- **Preference blast-radius checklist** (all must be touched): `@rtc/domain` port + `PreferencesSimulator` + `PowerSaverLevel` type; `PreferencesPortContract`; three storage adapters (React LS, Solid LS, RN AsyncStorage); `PowerSaverPresenter` + composition; both bindings' `createViewModel` (+ tests); `PowerSaverRoot` / `PowerSaverToggle` / `PreferencesModal` / `AmbientBackground` (React + Solid); RN `AppearanceScreen`; the `@rtc/ui-contract` harness + page objects + power specs + visual fixtures; grep-gates / eslint-selectors keyed on the literal `powerSaver` name.

---

### Task 1: Domain enum + port + all persistence implementors (green, no behaviour change)

Introduce `PowerSaverLevel`, rename the port, and migrate every `PreferencesPort` implementor (simulator + three storage adapters) with legacy-boolean read-migration. Give `PowerSaverPresenter` its new stream surface while KEEPING the old `enabled$`/`set`/`toggle` as a compat shim so bindings/components/harness stay green. No observable UI change (the single header toggle still maps to off/calm).

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts`
- Modify: `packages/domain/src/ports/preferencesPort.ts:43-44` (+ type import)
- Modify: `packages/domain/src/simulators/PreferencesSimulator.ts:27,48,71-73,120-126`
- Modify: `packages/domain/src/index.ts` (exports)
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts:164-184`
- Modify: `packages/client-core/src/presenters/PowerSaverPresenter.ts`
- Modify: `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts:129,156-158,221-228` (+ imports)
- Modify: `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` (byte-parallel)
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts:93,120,155-158,220-229`
- Test: `packages/client-react/src/app/adapters/preferences.contract.test.ts:58-61,107`; Solid twin; `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.test.ts`

**Interfaces:**
- Produces: `type PowerSaverLevel = "off" | "calm" | "freeze"`; `DEFAULT_POWER_SAVER_LEVEL`; `POWER_SAVER_LEVELS`; `nextPowerSaverLevel(current)`; `isPowerSaverLevel(v)`. Port: `powerSaverLevel$(): Observable<PowerSaverLevel>`, `setPowerSaverLevel(level)`. Presenter: `level$`, `isCalm$`, `isFreeze$`, `setLevel(level)` + compat `enabled$`, `set(on)`, `toggle(current)`.

- [ ] **Step 1: Add the enum, defaults, cycle + guard helpers to `preferences.ts`** (mirror the `ThemeModePreference` cycle pattern at `preferences.ts:104-119`)

```ts
/** Power-saver level. Ordered ladder Off → Calm → Freeze; Freeze ⊇ Calm.
 *  - off:    full "wow-effect" experience.
 *  - calm:   ambient backdrop removed, decorative loops paused, prices conflated.
 *  - freeze: everything Calm does PLUS all remaining motion killed (tick-flash,
 *            FLIP/rank-glide, transitions, spinners) for GPU-less Citrix/VDI boxes. */
export type PowerSaverLevel = "off" | "calm" | "freeze";

export const DEFAULT_POWER_SAVER_LEVEL: PowerSaverLevel = "off";

/** The header ⌁ button cycles through these in order: off → calm → freeze → off. */
export const POWER_SAVER_LEVELS: readonly PowerSaverLevel[] = [
  "off",
  "calm",
  "freeze",
];

/** The next level in the header cycle (wraps around). */
export function nextPowerSaverLevel(current: PowerSaverLevel): PowerSaverLevel {
  const i = POWER_SAVER_LEVELS.indexOf(current);
  return (
    POWER_SAVER_LEVELS[(i + 1) % POWER_SAVER_LEVELS.length] ??
    DEFAULT_POWER_SAVER_LEVEL
  );
}

/** Storage/type guard — a valid stored level string. Legacy boolean migration
 *  (`"true"` → `"calm"`) is handled by each adapter, not here. */
export function isPowerSaverLevel(
  value: string | null,
): value is PowerSaverLevel {
  return value === "off" || value === "calm" || value === "freeze";
}
```

- [ ] **Step 2: Rename the port accessor** (`preferencesPort.ts`, replace lines 40-44)

```ts
  /** Power-saver level; default "off". Ordered ladder off → calm → freeze
   * (Freeze ⊇ Calm). While not "off" the client forces the cheap rendering
   * path (still ambience, conflated price re-renders); "freeze" additionally
   * kills all decorative motion. Never mutates any other stored preference. */
  powerSaverLevel$(): Observable<PowerSaverLevel>;
  setPowerSaverLevel(level: PowerSaverLevel): void;
```

Add `PowerSaverLevel` to the type import from `../preferences/preferences.js`.

- [ ] **Step 3: Migrate the simulator** (`PreferencesSimulator.ts`): import `DEFAULT_POWER_SAVER_LEVEL` + `PowerSaverLevel`; seed field (27) `powerSaver?: boolean` → `powerSaverLevel?: PowerSaverLevel`; subject (48) → `BehaviorSubject<PowerSaverLevel>`; init (71-73) `seed.powerSaverLevel ?? DEFAULT_POWER_SAVER_LEVEL`; methods (120-126):

```ts
  powerSaverLevel$(): Observable<PowerSaverLevel> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaverLevel(level: PowerSaverLevel): void {
    this.powerSaverSubject.next(level);
  }
```

- [ ] **Step 4: Export the new symbols** from `packages/domain/src/index.ts` — `PowerSaverLevel` (type), `DEFAULT_POWER_SAVER_LEVEL`, `POWER_SAVER_LEVELS`, `nextPowerSaverLevel`, `isPowerSaverLevel` (mirror the `nextThemeModePreference` export blocks).

- [ ] **Step 5: Update the shared contract clauses** (`PreferencesPortContract.ts:164-184`)

```ts
    it("empty store emits the default powerSaverLevel=off", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.powerSaverLevel$())).toBe("off");
    });

    it("setPowerSaverLevel persists and pushes each level to subscribers", () => {
      const port = makeEmpty();
      const seen: string[] = [];
      const sub = port.powerSaverLevel$().subscribe((level) => {
        return seen.push(level);
      });
      port.setPowerSaverLevel("calm");
      port.setPowerSaverLevel("freeze");
      port.setPowerSaverLevel("off");
      sub.unsubscribe();
      expect(seen).toEqual(["off", "calm", "freeze", "off"]);
    });

    it("reads back a seeded powerSaverLevel", async () => {
      const port = makeSeeded({ powerSaverLevel: "freeze" });
      expect(await firstValueFrom(port.powerSaverLevel$())).toBe("freeze");
    });
```

- [ ] **Step 6: Presenter — new surface + compat shim** (`PowerSaverPresenter.ts`, full rewrite)

```ts
import { map, type Observable, shareReplay } from "rxjs";

import type { PowerSaverLevel, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the power-saver master override. Exposes the
 * replay-current level plus derived predicates: `isCalm$` (level !== "off",
 * drives ambient removal / --fx-play / price conflation) and `isFreeze$`
 * (level === "freeze", drives the view layer's motion catch-all + JS gates).
 * Never mutates other preferences (master-override semantics).
 *
 * `enabled$` / `set` / `toggle` are a temporary compat shim kept until the
 * framework bindings adopt the level surface (removed in Task 2).
 */
export class PowerSaverPresenter {
  readonly level$: Observable<PowerSaverLevel>;
  readonly isCalm$: Observable<boolean>;
  readonly isFreeze$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.level$ = preferences
      .powerSaverLevel$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.isCalm$ = this.level$.pipe(
      map((level) => level !== "off"),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.isFreeze$ = this.level$.pipe(
      map((level) => level === "freeze"),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  setLevel(level: PowerSaverLevel): void {
    this.preferences.setPowerSaverLevel(level);
  }

  // --- compat shim (removed in Task 2 once both bindings adopt the level surface) ---
  /** @deprecated use isCalm$ */
  get enabled$(): Observable<boolean> {
    return this.isCalm$;
  }
  /** @deprecated use setLevel */
  set(on: boolean): void {
    this.setLevel(on ? "calm" : "off");
  }
  /** @deprecated use setLevel(nextPowerSaverLevel(...)) */
  toggle(current: boolean): void {
    this.set(!current);
  }
}
```

Composition stays unchanged this task (still passes `powerSaver.enabled$` → the `isCalm$` alias, identical behaviour).

- [ ] **Step 7: Migrate the React localStorage adapter** (`LocalStoragePreferencesAdapter.ts`)

Add domain imports (`isPowerSaverLevel`, `DEFAULT_POWER_SAVER_LEVEL`, `type PowerSaverLevel`). Add a reader near `readBool` (line 85):

```ts
function readPowerSaverLevel(key: string): PowerSaverLevel {
  try {
    const stored = localStorage.getItem(key);

    if (isPowerSaverLevel(stored)) {
      return stored;
    }

    // Legacy boolean value from the pre-Freeze single toggle.
    if (stored === "true") {
      return "calm";
    }
  } catch {
    // ignore — best-effort read
  }

  return DEFAULT_POWER_SAVER_LEVEL;
}
```

Subject (129) → `BehaviorSubject<PowerSaverLevel>`; init (156-158) → `readPowerSaverLevel(POWER_SAVER_STORAGE_KEY)`; methods (221-228):

```ts
  powerSaverLevel$(): Observable<PowerSaverLevel> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaverLevel(level: PowerSaverLevel): void {
    writeStored(POWER_SAVER_STORAGE_KEY, level);
    this.powerSaverSubject.next(level);
  }
```

- [ ] **Step 8: Update the React adapter test + write the migration test** (`preferences.contract.test.ts`)

In `makeSeeded` (58-61): `seed.powerSaverLevel !== undefined` → `localStorage.setItem(POWER_SAVER_STORAGE_KEY, seed.powerSaverLevel)`. Update the key-persistence test (107). Add:

```ts
  it("migrates a legacy powerSaver=\"true\" to level \"calm\"", async () => {
    localStorage.setItem(POWER_SAVER_STORAGE_KEY, "true");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.powerSaverLevel$())).toBe("calm");
  });

  it("reads a stored freeze level back", async () => {
    localStorage.setItem(POWER_SAVER_STORAGE_KEY, "freeze");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.powerSaverLevel$())).toBe("freeze");
  });
```

Run: `pnpm --filter @rtc/client-react test -- preferences.contract` → PASS.

- [ ] **Step 9: Apply the identical migration to the Solid localStorage adapter + test** (byte-parallel). Run: `pnpm --filter @rtc/client-solid test -- preferences.contract` → PASS.

- [ ] **Step 10: Migrate the RN AsyncStorage adapter** (`AsyncStoragePreferencesAdapter.ts`): import the domain helpers; subject (93) → `BehaviorSubject<PowerSaverLevel>(DEFAULT_POWER_SAVER_LEVEL)`; async hydration (155-158):

```ts
      if (isPowerSaverLevel(powerSaver)) {
        this.powerSaverSubject.next(powerSaver);
      } else if (powerSaver === "true") {
        this.powerSaverSubject.next("calm");
      }
```

Methods (220-229):

```ts
  powerSaverLevel$(): Observable<PowerSaverLevel> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaverLevel(level: PowerSaverLevel): void {
    void AsyncStorage.setItem(POWER_SAVER_STORAGE_KEY, level);
    this.powerSaverSubject.next(level);
  }
```

Update `AsyncStoragePreferencesAdapter.test.ts` for level read/write + the `"true"`→`"calm"` migration.

- [ ] **Step 11: Run the touched suites + typecheck**

Run: `pnpm --filter @rtc/domain test && pnpm --filter @rtc/client-core test && pnpm --filter @rtc/client-react test -- preferences.contract && pnpm --filter @rtc/client-solid test -- preferences.contract && pnpm --filter @rtc/client-react-native test -- AsyncStoragePreferences && pnpm --filter @rtc/domain typecheck && pnpm --filter @rtc/client-core typecheck && pnpm --filter @rtc/client-react typecheck && pnpm --filter @rtc/client-solid typecheck && pnpm --filter @rtc/client-react-native typecheck`
Expected: PASS (bindings/components/harness unchanged, driven by the presenter compat shim).

- [ ] **Step 12: Commit**

```bash
git add packages/domain packages/client-core packages/client-react/src/app packages/client-solid/src/app packages/client-react-native/src/app
git commit -m "feat(domain): PowerSaverLevel enum + port/adapters with legacy migration"
```

---

### Task 2: Three-state controls + shared contract harness (atomic, both frameworks)

Switch both bindings' `usePowerSaver()` to the level surface, rewire all four shell components in BOTH clients (cycling header button + segmented Preferences control), map the RN screen to its 2-state toggle, repoint composition to `isCalm$`, delete the presenter compat shim, and migrate the shared `@rtc/ui-contract` harness + page objects + power specs + visual seeds. End state: all three states selectable; Freeze behaves == Calm (visuals land in Tasks 3–4).

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts:122-126,381-385,703-712`
- Modify: `packages/solid-bindings/src/createViewModel.ts:148-152,411-414,740-747`
- Modify: `packages/client-react/src/ui/shell/power/PowerSaverRoot.tsx`, `.../chrome/PowerSaverToggle.tsx` (+ `.module.css`), `.../prefs/PreferencesModal.tsx:23-26,74-80`, `.../background/AmbientBackground.tsx:26-51`
- Modify: `packages/client-solid/src/ui/shell/…` the four Solid twins (+ byte-identical `PowerSaverToggle.module.css`)
- Modify: `packages/client-react-native/src/ui/AppearanceScreen.tsx`
- Modify: `packages/client-core/src/composition.ts` (`powerSaver.enabled$` → `powerSaver.isCalm$`, both usages); `packages/client-core/src/presenters/PowerSaverPresenter.ts` (delete compat shim)
- Modify (shared harness): `packages/ui-contract/src/shared/harness/world.ts:196-197,244,357,525,615,630`, `packages/ui-contract/src/shared/mount.ts:57-58,226`, the per-client fake `usePowerSaver` hooks in each client's contract mount adapter (`packages/client-react/tests/…` + `packages/client-solid/tests/…`), page objects `PowerSaverRootPage.ts`, `AmbientBackgroundPage.ts`, `PreferencesModalPage.ts`, `HeaderChromePage.ts`
- Modify (specs): `packages/ui-contract/src/specs/shell/power/PowerSaverSurfaces.contract.spec.ts`, `.../PowerSaverRoot.contract.spec.ts`
- Modify (visual seeds): `packages/ui-contract/src/visual/fixtures.ts:924`, `.../appData.ts:85`, `.../scenarios.ts`, `.../scenarioActions.ts`
- Test: `packages/react-bindings/src/createViewModel.streams.test.tsx:178`, `packages/solid-bindings/src/createViewModel.streams.test.tsx:178`, the React/Solid component tests + `AppearanceScreen.test.tsx`

**Interfaces:**
- Consumes: presenter `level$` / `isCalm$` / `isFreeze$` / `setLevel`; `nextPowerSaverLevel`, `PowerSaverLevel` (domain).
- Produces (react-bindings): `usePowerSaver(): { level: PowerSaverLevel; isCalm: boolean; isFreeze: boolean; setLevel: (l) => void; cycle: () => void }`. Solid: the same with accessor functions (`level: () => PowerSaverLevel`, etc.).
- Produces (harness): `mount(..., { powerSaverLevel?: PowerSaverLevel })`; command log `powerSaverLevelSets: PowerSaverLevel[]`; `PowerSaverRootPage.powerSaverFlag()` now returns the level string; `HeaderChromePage` gains `cyclePowerSaver()` + reads the toggle's `data-level`; `PreferencesModalPage` gains `powerSaverLevel()` + `selectPowerSaverLevel(level)`.

- [ ] **Step 1: react-bindings `usePowerSaver()`** — replace the interface (122-126), bind block (381-385), and hook (703-712):

```ts
interface UsePowerSaverResult {
  level: PowerSaverLevel;
  isCalm: boolean;
  isFreeze: boolean;
  setLevel: (level: PowerSaverLevel) => void;
  cycle: () => void;
}
```

```ts
  const [usePowerSaverLevel] = bind(presenters.powerSaver.level$, "off");

  function setPowerSaverLevel(level: PowerSaverLevel): void {
    presenters.powerSaver.setLevel(level);
  }
```

```ts
    usePowerSaver: () => {
      const level = usePowerSaverLevel();
      return {
        level,
        isCalm: level !== "off",
        isFreeze: level === "freeze",
        setLevel: setPowerSaverLevel,
        cycle: () => {
          return setPowerSaverLevel(nextPowerSaverLevel(level));
        },
      };
    },
```

Add `nextPowerSaverLevel` + `type PowerSaverLevel` to the `@rtc/domain` imports. Rewrite the binding stream test (`createViewModel.streams.test.tsx:178`): `level` defaults `"off"`; `cycle()` advances `off → calm → freeze → off`; `setLevel("freeze")` → `isFreeze` true. Run `pnpm --filter @rtc/react-bindings test` → PASS.

- [ ] **Step 2: solid-bindings `usePowerSaver()`** — the accessor-based twin (148-152, 411-414, 740-747), using the file's `state(...)` / `toSignal(...)` idiom: `level`/`isCalm`/`isFreeze` are accessors; `cycle: () => setPowerSaverLevel(nextPowerSaverLevel(level()))`. Rewrite its stream test. Run `pnpm --filter @rtc/solid-bindings test` → PASS.

- [ ] **Step 3: PowerSaverRoot (React + Solid)** — write the level string + `--fx-play` on `isCalm`:

```tsx
// React
  const { level, isCalm } = usePowerSaver();
  useLayoutEffect(() => {
    document.documentElement.dataset.powerSaver = level;
    document.documentElement.style.setProperty(
      "--fx-play",
      isCalm ? "paused" : "running",
    );
  }, [level, isCalm]);
```

Solid twin: `dataset.powerSaver = level()`, `--fx-play` on `isCalm()`.

- [ ] **Step 4: PowerSaverToggle becomes a cycling button (React)** (Solid twin mirrors it; copy the CSS byte-identically):

```tsx
import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./PowerSaverToggle.module.css";

const FILL: Record<string, string> = { off: "○", calm: "◐", freeze: "●" };
const NEXT_LABEL: Record<string, string> = {
  off: "Calm",
  calm: "Freeze",
  freeze: "Off",
};

/**
 * Header cycling control for the power-saver ladder (off → calm → freeze → off).
 * The ⌁ glyph carries a fill indicator (○ ◐ ●) of the current level; the
 * Preferences segmented control is the direct-jump / screen-reader path.
 */
export function PowerSaverToggle(): ReactElement {
  const { usePowerSaver } = useViewModel();
  const { level, cycle } = usePowerSaver();
  return (
    <button
      type="button"
      data-testid="power-saver-toggle"
      aria-label={`Power saver: ${level}. Activate to switch to ${NEXT_LABEL[level]}.`}
      data-level={level}
      data-active={level === "off" ? "false" : "true"}
      className={styles.button}
      onClick={cycle}
    >
      <span aria-hidden="true" className={styles.glyph}>
        ⌁
      </span>
      <span aria-hidden="true" className={styles.fill}>
        {FILL[level]}
      </span>
    </button>
  );
}
```

Add `.glyph` / `.fill` to `PowerSaverToggle.module.css` (small inline-flex; `.fill` `font-size:.7em; opacity:.85`); keep the existing 32px button box. Copy the CSS verbatim to the Solid twin (cssParity gate).

- [ ] **Step 5: PreferencesModal — segmented Off/Calm/Freeze via `PrefSegment` (React + Solid)**

```tsx
  const { level: powerSaverLevel, setLevel: setPowerSaverLevel } =
    usePowerSaver();
```

```tsx
              <PrefSegment
                label="Power saver"
                options={POWER_SAVER_OPTIONS}
                value={powerSaverLevel}
                onChange={(value: string) => {
                  setPowerSaverLevel(value as PowerSaverLevel);
                }}
                testid="pref-segment-powerSaver"
              />
```

```ts
const POWER_SAVER_OPTIONS: readonly PrefSegmentOption[] = [
  { value: "off", label: "Off" },
  { value: "calm", label: "Calm" },
  { value: "freeze", label: "Freeze" },
];
```

Import `type PowerSaverLevel`. Solid twin uses the Solid `PrefSegment` + accessor `level()`.

- [ ] **Step 6: AmbientBackground uses `isCalm` (React + Solid)** — `const { isCalm } = usePowerSaver();`, every `powerSaver` → `isCalm` / `!powerSaver` → `!isCalm`; the component's own `data-power-saver` attribute becomes `isCalm ? "on" : "off"` (React) / `isCalm() ? "on" : "off"` (Solid). Update `AmbientBackground.test.tsx` (Solid) mock to the new shape.

- [ ] **Step 7: RN AppearanceScreen maps the new shape to its 2-state toggle** — read `{ isCalm, setLevel }`; `on={isCalm}`, `onToggle={() => setLevel(isCalm ? "off" : "calm")}`. Update `AppearanceScreen.test.tsx`.

- [ ] **Step 8: Repoint composition + delete the presenter compat shim** — `composition.ts` both `powerSaver.enabled$` → `powerSaver.isCalm$`; `PowerSaverPresenter.ts` delete the `enabled$` getter, `set`, `toggle`, and their comment block.

- [ ] **Step 9: Migrate the shared contract harness**

- `world.ts`: `powerSaverSets: boolean[]` → `powerSaverLevelSets: PowerSaverLevel[]` (197, + comment 196); `powerSaver: BehaviorSubject<boolean>` → `BehaviorSubject<PowerSaverLevel>` (244); `powerSaverSeed?: boolean` → `powerSaverLevelSeed?: PowerSaverLevel` (357); init (525) `?? "off"`; log init (615) `powerSaverLevelSets: []`.
- `mount.ts`: seed field (57-58) `powerSaver?: boolean` → `powerSaverLevel?: PowerSaverLevel`; pass-through (226).
- Per-client fake `usePowerSaver` hooks (in each client's contract mount adapter): return the new shape `{ level, isCalm, isFreeze, setLevel, cycle }` driven by the world's `powerSaver` subject; `setLevel`/`cycle` push into `powerSaverLevelSets`.
- Page objects: `PowerSaverRootPage.powerSaverFlag()` (now the level string); `PreferencesModalPage` → replace `powerSaverOn()`/`togglePowerSaver()`/`powerSaverSets()` with `powerSaverLevel()` (reads the segment's active value) + `selectPowerSaverLevel(level)` + `powerSaverLevelSets()`; `HeaderChromePage` → replace `powerSaverPressed()`/`clickPowerSaver()` with a `powerSaverLevel()` reading the toggle's `data-level` + `cyclePowerSaver()`.

- [ ] **Step 10: Rewrite the power specs for three states** (`PowerSaverSurfaces.contract.spec.ts`, `PowerSaverRoot.contract.spec.ts`)

Assert, through the shared harness (DOM/attribute level — jsdom, no compositing):
- `PowerSaverRoot` stamps `data-power-saver` = the seeded level (`off` / `calm` / `freeze`) and `--fx-play` `paused` when not off, `running` when off.
- Cycling the header control advances `off → calm → freeze → off` (assert the toggle `data-level`).
- Selecting `Freeze` in the Preferences segment records `powerSaverLevelSets` ⊇ `["freeze"]` and reflects it.
- AmbientBackground: aurora layers absent when the level is `calm` OR `freeze` (Freeze ⊇ Calm), present when `off`.

Delete the stale "react-only" comment block (13-17) — both clients now implement it.

- [ ] **Step 11: Update the visual seeds** — `fixtures.ts:924` `powerSaver: true` → `powerSaverLevel: "calm"`; `appData.ts:85` field rename; `scenarios.ts` / `scenarioActions.ts` comments + seed usage. (No new Freeze visual scenario — deferred; see the self-review note.)

- [ ] **Step 12: Run bindings + both clients + client-core + BOTH contract-coverage gates**

Run: `pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/solid-bindings test && pnpm --filter @rtc/client-core test && pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-react-native test && pnpm --filter @rtc/client-react test:ui:contract:coverage && pnpm --filter @rtc/client-solid test:ui:contract:coverage && pnpm lint:eslint`
Expected: PASS for all (this includes the CI-only Solid contract-coverage gate that a React-only change previously tripped).

- [ ] **Step 13: Commit**

```bash
git add packages/react-bindings packages/solid-bindings packages/client-core packages/client-react packages/client-solid packages/client-react-native packages/ui-contract
git commit -m "feat(clients): three-state power-saver controls (cycler + segmented) + contract"
```

---

### Task 3: React freeze visuals (catch-all + JS gates)

Make `data-power-saver="freeze"` actually kill all motion in the React client.

**Files:**
- Modify: `packages/client-react/src/index.css` (append the catch-all)
- Modify: `packages/client-react/src/ui/shell/motion/useFlipGrid.ts:29-33,83,~110` (add `freeze` option)
- Modify: `packages/client-react/src/ui/equities/watchlist/useRankGlide.ts:169` (freeze gate)
- Modify: hook consumers to pass `freeze`: `.../fx/liveRates/LiveRatesPanel.tsx:34`, `.../fx/liveRates/WatchlistView.tsx:32`, `.../credit/rfqs/RfqsPanel.tsx:194`, the `useRankGlide` watchlist consumer
- Modify: `.../shell/status/useLiveMetrics.ts:37,69` (pause under freeze), `.../shell/boot/BootSequence.tsx:35` (skip canvas under freeze)
- Test: a focused `useFlipGrid` freeze no-op unit test

**Interfaces:** Consumes `usePowerSaver().isFreeze` (react-bindings). Produces `useFlipGrid(deps, { enter?, exit?, freeze? })`; `useRankGlide(…, { freeze? })`.

- [ ] **Step 1: Append the global catch-all to `index.css`**

```css
/* Power-saver "freeze" tier: neutralise ALL decorative motion at once for
 * GPU-less Citrix/VDI boxes. 0.01ms (not `none`) keeps `forwards` end-states
 * resolving and animationend/transitionend events firing, so JS choreography
 * waiting on them does not hang. Imperative motion (WAAPI, rAF) is gated in TS.
 * The static neon HUD (box/text-shadow) is deliberately kept. */
[data-power-saver="freeze"] *,
[data-power-saver="freeze"] *::before,
[data-power-saver="freeze"] *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
}
```

- [ ] **Step 2: Add the `freeze` option to `useFlipGrid` (TDD)** — write a failing test rendering a `useFlipGrid` harness with `freeze: true`, change deps, assert `HTMLElement.prototype.animate` is NOT called (spy). Implement: extend the options type (29-33) with `freeze = false`; change the guard at line 83 to `!prefersReducedMotion() && !freeze` (and the enter/exit branches ~94/~110). Run → PASS.

- [ ] **Step 3: Thread `freeze` from the FLIP/glide consumers** — in `LiveRatesPanel.tsx`, `WatchlistView.tsx`, `RfqsPanel.tsx`: `const { isFreeze } = usePowerSaver();` and pass `freeze: isFreeze` in the `useFlipGrid(...)` options. In `useRankGlide.ts` add a `freeze` option, extend the guard at line 169 (`&& !freeze`), and pass `freeze: isFreeze` from its watchlist consumer.

- [ ] **Step 4: Pause the FPS-meter rAF under freeze** (`useLiveMetrics.ts`) — read `isFreeze` via `useViewModel().usePowerSaver()`; extend the effect guard (37) to `if (frozen || isFreeze) { return; }` and add `isFreeze` to the deps (69). The readout holds its last value.

- [ ] **Step 5: Skip the boot canvas under a persisted freeze** (`BootSequence.tsx:35`) — OR `usePowerSaver().isFreeze` into the existing reduced-motion early-return so a Freeze box never runs the splash rAF.

- [ ] **Step 6: Run the React suite + lint** — `pnpm --filter @rtc/client-react test && pnpm --filter @rtc/client-react typecheck && pnpm lint:eslint` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client-react/src
git commit -m "feat(client-react): freeze tier — CSS catch-all + WAAPI/rAF/boot gates"
```

---

### Task 4: Solid freeze visuals

Mirror Task 3 for the Solid client (accessor `isFreeze()`); the global CSS block is copied verbatim.

**Files:**
- Modify: `packages/client-solid/src/index.css` (append the byte-identical catch-all)
- Modify: `packages/client-solid/src/ui/shell/motion/useFlipGrid.ts`, `.../equities/watchlist/useRankGlide.ts` (freeze gate)
- Modify: Solid consumers `LiveRatesPanel.tsx`, `WatchlistView.tsx`, `RfqsPanel.tsx`, the rank-glide consumer; `useLiveMetrics.ts` / `BootSequence.tsx` if present in the Solid client
- Test: Solid `useFlipGrid` freeze no-op test

- [ ] **Step 1:** Append the byte-identical catch-all block to `client-solid/src/index.css`.
- [ ] **Step 2:** Port the `useFlipGrid` / `useRankGlide` `freeze` gate (Solid `isFreeze()`); write the Solid no-op test.
- [ ] **Step 3:** Thread `freeze: isFreeze()` from the three Solid FLIP consumers + the rank-glide consumer; gate `useLiveMetrics` / `BootSequence` if those exist in the Solid client (skip any that do not).
- [ ] **Step 4:** `pnpm --filter @rtc/client-solid test && pnpm --filter @rtc/client-solid typecheck` → PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/client-solid/src
git commit -m "feat(client-solid): freeze tier — CSS catch-all + WAAPI/rAF/boot gates"
```

---

### Task 5: Freeze-visual contract assertions + e2e

Now that Freeze visuals exist in both clients, add the motion-killed assertions to the shared contract tier and an end-to-end Playwright proof.

**Files:**
- Modify: `packages/ui-contract/src/specs/shell/power/PowerSaverSurfaces.contract.spec.ts` (add freeze-visual assertions)
- Create/Modify: a Playwright spec under `packages/client-react/tests/e2e/…` (follow the existing preferences/power-saver e2e if present; else add `power-saver-freeze.spec.ts`)

- [ ] **Step 1: Add a freeze-visual contract assertion** — under a `freeze`-seeded mount, assert the tick-flash surface is neutralised (e.g. the tile pips `data-anim` overlay resolves to a ~0 effective `animation-duration`, or a harness-readable marker) — the DOM-level signal that the catch-all is active. Keep it assert-only (jsdom, no compositing). Run BOTH: `pnpm --filter @rtc/client-react test:ui:contract:coverage && pnpm --filter @rtc/client-solid test:ui:contract:coverage` → PASS.

- [ ] **Step 2: Write the e2e** — boot the app (simulator mode), reach Freeze via the header cycler (two clicks) or the Preferences segment, then assert: `document.documentElement.dataset.powerSaver === "freeze"`; a representative animated element's computed `animationDuration` is `0.01ms`/`0s`; reload preserves Freeze and the toggle `data-level` reads `freeze`. Assert computed style, not pixels.

- [ ] **Step 3: Run + commit**

Run: `pnpm --filter @rtc/client-react test:e2e -- power-saver-freeze` (or the repo e2e entry) → PASS.

```bash
git add packages/ui-contract packages/client-react/tests
git commit -m "test: freeze-visual contract assertion + power-saver Freeze e2e"
```

---

### Task 6: Documentation

Rewrite the power-saver doc for the three-state ladder with the compositor-vs-CPU-raster rationale, update the perf cross-link + STATUS, and record the RN follow-up.

**Files:**
- Modify: `docs/power-saver-mode.md` (rewrite)
- Modify: `docs/performance.md` (cross-link)
- Modify: `docs/STATUS.md` (aggressive-freeze idea shipped; add RN-Freeze follow-up + the deferred visual-golden follow-up)
- Modify: `docs/superpowers/specs/2026-07-16-rn-mobile-v1-rehaul-design.md` (§4 RN Freeze follow-up)

- [ ] **Step 1: Rewrite `docs/power-saver-mode.md`** — three levels Off/Calm/Freeze (ordered ladder, `Freeze ⊇ Calm`); the header `⌁` cycler (`○ ◐ ●`) + Preferences segmented control; `rtc-power-saver` now the level string (legacy `"true"` → `calm`). Replace the two-column table with the three-column Off/Calm/Freeze matrix from the design (§4), including the countdown-bar row + its "expiry still fires" note. Add the **"Why a Freeze tier exists"** section: on a GPU there is a compositor so `opacity`/`transform` animations cost the main thread nothing; on a GPU-less Citrix/VDI box there is no compositor, so every frame is CPU-rasterised and streamed as pixels — a "compositor-friendly" tick-flash becomes a continuous CPU-raster-plus-encode tax across every tile, every tick, forever; Freeze stops the per-frame work happening at all; numbers stay live (you lose the shimmer, not the market); static neon stays because a frozen, conflated UI repaints rarely. Document the mechanism (`data-power-saver="freeze"` + the `0.01ms` catch-all, why not `none`; the WAAPI/rAF/boot JS gates). Non-goals: no auto-detection; no further price slowdown; no low-power skin; no server change; **RN Freeze visuals deferred**. Future iterations: mark "aggressive freeze-everything tier" **SHIPPED**; keep "instant refresh on toggle" open.
- [ ] **Step 2: Cross-link from `docs/performance.md`** — one line pointing to Freeze as the hard floor for GPU-less hardware.
- [ ] **Step 3: Update `docs/STATUS.md`** — mark the aggressive-freeze item shipped; add ⚪ follow-ups "Power-saver **Freeze** visuals on React Native" (enum plumbed, renders as Calm today) and "Freeze **visual golden** scenario (deferred — assert-only contract + e2e cover it today)".
- [ ] **Step 4: Note the RN follow-up** in the RN rehaul spec §4.
- [ ] **Step 5: Verify + commit** — `pnpm check:doc-links` → PASS.

```bash
git add docs
git commit -m "docs(power-saver): document the three-state Freeze tier + rationale"
```

---

## Final phase gauntlet (run once, after Task 6)

Full local gauntlet — MUST include BOTH clients' contract-coverage gates and the ESLint pass Biome does not cover (both are CI-only misses that burned the prior power-saver workstream). Chain with `&&` (a bare `set -e` inside a redirected block does NOT halt on failure — false green):

```bash
pnpm build \
  && pnpm typecheck \
  && pnpm test \
  && pnpm --filter @rtc/client-react test:ui:contract:coverage \
  && pnpm --filter @rtc/client-solid test:ui:contract:coverage \
  && pnpm biome ci . \
  && pnpm lint:eslint \
  && pnpm lint:eslint-types \
  && pnpm lint:stylelint \
  && pnpm knip \
  && pnpm check:doc-links
```

All green → push, open PR, follow shipping-repo-changes (poll CI on the HEAD SHA, merge with `--merge` once green).

## Self-review notes (coverage vs. spec)

- Spec §1 (enum + migration) → Task 1. §2 (controls) → Task 2. §3 (mechanism, React+Solid) → Tasks 3–4. §4 (matrix incl. countdown trade-off) → docs Task 6, behaviour realised across Tasks 2–4. §5 (scope; RN deferred) → Task 2 Step 7 + Task 6. §6 (docs) → Task 6. §7 (tests) → Tasks 2 (control contract), 5 (freeze-visual contract + e2e). §8 (blast-radius) → Global Constraints + Tasks 1–2.
- **The contract/harness change is in Task 2, not deferred** — the shared `@rtc/ui-contract` harness + specs are cross-framework and would break the contract tier the moment the components change, so they move with the components (atomic across React + Solid).
- **Visual golden scenario deliberately deferred** to a STATUS follow-up: a frozen UI's static end-states are already covered by the existing goldens + the assert-only contract tier, and a new arch-specific golden set (react/ x86 + react-local/<arch>) is low-value and non-gating. Recorded in Task 6 Step 3.
