# Power-Saver Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One persisted "Power saver" toggle that removes the ambient GPU load and conflates price-driven rendering, without changing the app's functional behaviour or its still visuals.

**Architecture:** A new `powerSaver` boolean preference flows through the existing preference stack (domain `PreferencesPort` → `PreferencesSimulator` / `LocalStoragePreferencesAdapter` → client-core `PowerSaverPresenter` → `usePowerSaver()` ViewModel hook). Rendering reacts via a root `data-power-saver` attribute + inherited `--fx-play` play-state variable (mirror of the `--amb-play` idiom); data rate reacts via a `conflateWhen` RxJS operator applied inside `PriceStreamPresenter`/`PriceHistoryPresenter`, so tiles, blotters, analytics, and the `AnimationDirector` all conflate consistently from one place.

**Tech Stack:** TypeScript, RxJS, React 19, CSS Modules, Vitest (+ fake timers), Testing-Library contract tier, Playwright e2e, dual-set visual goldens.

**Spec:** `docs/superpowers/specs/2026-07-09-power-saver-mode-design.md` — read it first; its "What power saver changes visually" table is the acceptance contract.

## Global Constraints

- Follow `.claude/skills/shipping-repo-changes` — worktree first, PR + CI green, merge commit, cleanup. This plan changes UI: get the user's live acceptance on the dev server BEFORE merging.
- `powerSaver` default is `false`; localStorage key is exactly `rtc-power-saver`.
- Conflation intervals: prices **250ms**, price history **1000ms** (leading + trailing).
- Master-override semantics: power saver must NOT write or mutate any other preference.
- Dumb UI: no rxjs/localStorage/fetch/timers in `packages/client-react/src/ui` (grep-gated). DOM writes to `document.documentElement` are allowed only in provider/effect components (ThemeProvider precedent).
- Biome zero findings, no suppressions; `#/` subpath-alias imports in client-react; inline `style={{…}}` is ESLint-banned except `--custom-property` writes (existing opt-out pattern).
- Visual goldens: additive scenario only; regenerate ONLY the new goldens, BOTH sets (x86 via `update-visual-goldens` workflow, local via `:update` run). Never regenerate the whole set.
- Run the FULL lint gauntlet per task: `pnpm check && pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css && pnpm typecheck`.

---

### Task 1: Domain preference — port, simulator, defaults

**Files:**
- Modify: `packages/domain/src/ports/preferencesPort.ts`
- Modify: `packages/domain/src/simulators/PreferencesSimulator.ts`
- Test: `packages/domain/src/simulators/__tests__/PreferencesSimulator.test.ts` (extend; create in the simulators test dir alongside existing tests if it does not exist — check `ls packages/domain/src/**/__tests__` first and follow the local layout)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PreferencesPort.powerSaver$(): Observable<boolean>`, `PreferencesPort.setPowerSaver(on: boolean): void`, `PreferencesSeed.powerSaver?: boolean`. Every later task relies on these exact names.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "../PreferencesSimulator.js";

describe("PreferencesSimulator powerSaver", () => {
  it("defaults off, replays current, and honours the seed", () => {
    const seen: boolean[] = [];
    const sim = new PreferencesSimulator();
    const sub = sim.powerSaver$().subscribe((on) => {
      seen.push(on);
    });
    sim.setPowerSaver(true);
    sim.setPowerSaver(true); // distinctUntilChanged: no re-emit
    sim.setPowerSaver(false);
    sub.unsubscribe();
    expect(seen).toEqual([false, true, false]);

    const seeded = new PreferencesSimulator({ powerSaver: true });
    let current = false;
    seeded
      .powerSaver$()
      .subscribe((on) => {
        current = on;
      })
      .unsubscribe();
    expect(current).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`powerSaver$ is not a function`)

Run: `pnpm --filter @rtc/domain test -- PreferencesSimulator`

- [ ] **Step 3: Implement**

In `preferencesPort.ts`, after the `animatedBackground` pair (keep doc-comment style):

```ts
  /** Power-saver master override; default false. While on, the client forces
   * the cheap rendering path (still ambience, conflated price re-renders)
   * WITHOUT mutating any other stored preference. */
  powerSaver$(): Observable<boolean>;
  setPowerSaver(on: boolean): void;
```

In `PreferencesSimulator.ts`: add `powerSaver?: boolean;` to `PreferencesSeed`; add the field, constructor init, and methods (mirror `animatedBg` exactly):

```ts
  private readonly powerSaverSubject: BehaviorSubject<boolean>;
  // constructor:
  this.powerSaverSubject = new BehaviorSubject<boolean>(
    seed.powerSaver ?? false,
  );
  // methods:
  powerSaver$(): Observable<boolean> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaver(on: boolean): void {
    this.powerSaverSubject.next(on);
  }
```

- [ ] **Step 4: Run test — expect PASS**, then the domain suite: `pnpm --filter @rtc/domain test`
- [ ] **Step 5: Commit** — `feat(domain): powerSaver preference on PreferencesPort + simulator`

---

### Task 2: localStorage persistence (client-react adapter)

**Files:**
- Modify: `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Test: `packages/client-react/src/app/adapters/preferences.contract.test.ts` (extend — this file contract-tests the adapter against the port; follow its existing per-preference test shape)

**Interfaces:**
- Consumes: Task 1's port methods.
- Produces: `POWER_SAVER_STORAGE_KEY = "rtc-power-saver"` export; adapter implements the new port members.

- [ ] **Step 1: Write the failing test** — add to `preferences.contract.test.ts`, copying that file's existing animated-background cases verbatim with the new key/methods (it already stubs localStorage; reuse its helpers):

```ts
it("powerSaver defaults false, persists to rtc-power-saver, and replays current", () => {
  const adapter = new LocalStoragePreferencesAdapter();
  let current = true;
  adapter
    .powerSaver$()
    .subscribe((on) => {
      current = on;
    })
    .unsubscribe();
  expect(current).toBe(false);

  adapter.setPowerSaver(true);
  expect(localStorage.getItem("rtc-power-saver")).toBe("true");

  const rehydrated = new LocalStoragePreferencesAdapter();
  let stored = false;
  rehydrated
    .powerSaver$()
    .subscribe((on) => {
      stored = on;
    })
    .unsubscribe();
  expect(stored).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL**: `pnpm --filter @rtc/client-react test -- preferences.contract`
- [ ] **Step 3: Implement** — in the adapter add the key constant next to the others, the subject, constructor read, and methods (exact mirror of `animatedBg`):

```ts
export const POWER_SAVER_STORAGE_KEY = "rtc-power-saver";

  private readonly powerSaverSubject: BehaviorSubject<boolean>;
  // constructor:
  this.powerSaverSubject = new BehaviorSubject<boolean>(
    readBool(POWER_SAVER_STORAGE_KEY, false),
  );
  // methods:
  powerSaver$(): Observable<boolean> {
    return this.powerSaverSubject.pipe(distinctUntilChanged());
  }

  setPowerSaver(on: boolean): void {
    writeStored(POWER_SAVER_STORAGE_KEY, on ? "true" : "false");
    this.powerSaverSubject.next(on);
  }
```

- [ ] **Step 4: Run — expect PASS**; also `pnpm --filter @rtc/client-react typecheck` (any other `PreferencesPort` implementors — search `implements PreferencesPort` repo-wide — must be extended in this task too; the RN client, if it has one, gets the identical mirror).
- [ ] **Step 5: Commit** — `feat(client-react): persist powerSaver preference (rtc-power-saver)`

---

### Task 3: PowerSaverPresenter + composition registration

**Files:**
- Create: `packages/client-core/src/presenters/PowerSaverPresenter.ts`
- Modify: `packages/client-core/src/composition.ts` (~L20 import block, ~L108 presenters record type, ~L256 construction — anchor on `AnimatedBackgroundPresenter`)
- Test: `packages/client-core/src/presenters/__tests__/PowerSaverPresenter.test.ts`

**Interfaces:**
- Consumes: Task 1's port.
- Produces: `PowerSaverPresenter { enabled$: Observable<boolean>; set(on: boolean): void; toggle(current: boolean): void }`; `presenters.powerSaver` in the composition root. Tasks 5–6 rely on `presenters.powerSaver.enabled$`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import { PowerSaverPresenter } from "../PowerSaverPresenter";

describe("PowerSaverPresenter", () => {
  it("defaults to off and toggles", () => {
    const presenter = new PowerSaverPresenter(new PreferencesSimulator());
    const seen: boolean[] = [];
    const sub = presenter.enabled$.subscribe((on) => {
      return seen.push(on);
    });
    presenter.toggle(false);
    presenter.set(false);
    sub.unsubscribe();
    expect(seen).toEqual([false, true, false]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**: `pnpm --filter @rtc/client-core test -- PowerSaverPresenter`
- [ ] **Step 3: Implement**

```ts
import { type Observable, shareReplay } from "rxjs";

import type { PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the power-saver master override. Exposes the
 * replay-current enabled flag and the write/toggle operations. While enabled
 * the client forces the cheap rendering path everywhere; it never mutates
 * other preferences (master-override semantics).
 */
export class PowerSaverPresenter {
  readonly enabled$: Observable<boolean>;

  constructor(private readonly preferences: PreferencesPort) {
    this.enabled$ = preferences
      .powerSaver$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  set(on: boolean): void {
    this.preferences.setPowerSaver(on);
  }

  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void {
    this.set(!current);
  }
}
```

In `composition.ts`: import it beside `AnimatedBackgroundPresenter`; add `powerSaver: PowerSaverPresenter;` to the presenters record; construct `powerSaver: new PowerSaverPresenter(ports.preferences),` beside the animatedBackground line. Export the class from the package index if presenters are re-exported there (check `packages/client-core/src/index.ts` and follow suit).

- [ ] **Step 4: Run — expect PASS**, then `pnpm --filter @rtc/client-core test && pnpm --filter @rtc/client-core typecheck`
- [ ] **Step 5: Commit** — `feat(client-core): PowerSaverPresenter wired into the composition root`

---

### Task 4: `conflateWhen` operator

**Files:**
- Create: `packages/client-core/src/presenters/conflateWhen.ts`
- Test: `packages/client-core/src/presenters/__tests__/conflateWhen.test.ts`

**Interfaces:**
- Produces: `conflateWhen<T>(flag$: Observable<boolean>, ms: number): (source: Observable<T>) => Observable<T>`. Task 5 consumes it.

- [ ] **Step 1: Write the failing test** (fake timers; the repo's vitest supports `vi.useFakeTimers`)

```ts
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { conflateWhen } from "../conflateWhen";

describe("conflateWhen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes every emission through while the flag is off", () => {
    const flag$ = new Subject<boolean>();
    const source$ = new Subject<number>();
    const seen: number[] = [];
    const sub = source$
      .pipe(conflateWhen(flag$, 250))
      .subscribe((v) => seen.push(v));
    flag$.next(false);
    source$.next(1);
    source$.next(2);
    source$.next(3);
    expect(seen).toEqual([1, 2, 3]);
    sub.unsubscribe();
  });

  it("throttles leading+trailing while the flag is on", () => {
    const flag$ = new Subject<boolean>();
    const source$ = new Subject<number>();
    const seen: number[] = [];
    const sub = source$
      .pipe(conflateWhen(flag$, 250))
      .subscribe((v) => seen.push(v));
    flag$.next(true);
    source$.next(1); // leading — emitted immediately
    source$.next(2);
    source$.next(3); // conflated; 3 is the trailing value
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(250);
    expect(seen).toEqual([1, 3]);
    sub.unsubscribe();
  });

  it("switches live when the flag flips", () => {
    const flag$ = new Subject<boolean>();
    const source$ = new Subject<number>();
    const seen: number[] = [];
    const sub = source$
      .pipe(conflateWhen(flag$, 250))
      .subscribe((v) => seen.push(v));
    flag$.next(true);
    source$.next(1);
    flag$.next(false); // conflation off — passthrough resumes
    source$.next(2);
    source$.next(3);
    expect(seen).toEqual([1, 2, 3]);
    sub.unsubscribe();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**: `pnpm --filter @rtc/client-core test -- conflateWhen`
- [ ] **Step 3: Implement**

```ts
import {
  asyncScheduler,
  distinctUntilChanged,
  type Observable,
  switchMap,
  throttleTime,
} from "rxjs";

/**
 * Gates a stream behind a boolean flag: while `flag$` is true the source is
 * conflated to at most one emission per `ms` (leading + trailing — the first
 * value after a quiet period is instant, the last value of a burst is never
 * lost); while false the source passes through untouched. Flag changes take
 * effect immediately. Used by the power-saver mode to calm price-driven
 * re-renders without dropping the latest market state.
 */
export function conflateWhen<T>(
  flag$: Observable<boolean>,
  ms: number,
): (source: Observable<T>) => Observable<T> {
  return (source: Observable<T>): Observable<T> => {
    return flag$.pipe(
      distinctUntilChanged(),
      switchMap((on) => {
        return on
          ? source.pipe(
              throttleTime(ms, asyncScheduler, {
                leading: true,
                trailing: true,
              }),
            )
          : source;
      }),
    );
  };
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `feat(client-core): conflateWhen gated-throttle operator`

---

### Task 5: Conflate price + history streams behind the flag

**Files:**
- Modify: `packages/client-core/src/presenters/PriceStreamPresenter.ts`
- Modify: `packages/client-core/src/presenters/PriceHistoryPresenter.ts`
- Modify: `packages/client-core/src/composition.ts` (their construction sites — pass `presenters.powerSaver.enabled$`; construct `powerSaver` BEFORE them, or hoist `const powerSaver = new PowerSaverPresenter(ports.preferences)` above the record literal and reference it twice)
- Test: `packages/client-core/src/presenters/__tests__/PriceStreamPresenter.test.ts` (extend or create), `.../PriceHistoryPresenter.test.ts` (extend or create)

**Interfaces:**
- Consumes: Task 3's `presenters.powerSaver.enabled$`, Task 4's `conflateWhen`.
- Produces: `new PriceStreamPresenter(pricing, powerSaver$)` and `new PriceHistoryPresenter(pricing, powerSaver$)` — constructor signatures change; `price$`/`history$` signatures are unchanged, so no consumer beyond composition is touched. `AnimationDirector` conflates for free because composition feeds it `priceFor` from this presenter.

- [ ] **Step 1: Write the failing test** (PriceStream; mirror for PriceHistory with `history$('EURUSD')` and 1000ms)

```ts
import { BehaviorSubject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PricingSimulator } from "@rtc/domain";

import { PriceStreamPresenter } from "../PriceStreamPresenter";

// Use the same CurrencyPair fixture the existing presenter tests use — check
// __tests__ for a shared pairs fixture/helper before writing a literal.

describe("PriceStreamPresenter power-saver conflation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("conflates ticks to one per 250ms while power saver is on", () => {
    const powerSaver$ = new BehaviorSubject<boolean>(true);
    const presenter = new PriceStreamPresenter(
      new PricingSimulator(),
      powerSaver$,
    );
    let count = 0;
    const sub = presenter.price$(EURUSD).subscribe(() => {
      count += 1;
    });
    vi.advanceTimersByTime(2_000);
    // The simulator ticks several times per second; conflated output is at
    // most 1 leading + 8 trailing emissions in 2s (250ms buckets).
    expect(count).toBeLessThanOrEqual(9);
    sub.unsubscribe();
  });

  it("passes ticks through untouched while power saver is off", () => {
    const powerSaver$ = new BehaviorSubject<boolean>(false);
    const raw = new PriceStreamPresenter(
      new PricingSimulator(),
      powerSaver$,
    );
    let count = 0;
    const sub = raw.price$(EURUSD).subscribe(() => {
      count += 1;
    });
    vi.advanceTimersByTime(2_000);
    expect(count).toBeGreaterThan(9); // unconflated simulator rate
    sub.unsubscribe();
  });
});
```

(Adjust the expected counts to the `PricingSimulator` tick cadence observed in its existing tests — the invariant is `conflated ≤ 1 + elapsed/250ms < unconflated`.)

- [ ] **Step 2: Run — expect FAIL** (constructor arity)
- [ ] **Step 3: Implement**

`PriceStreamPresenter.ts`:

```ts
import { type Observable, shareReplay } from "rxjs";

import {
  type CurrencyPair,
  type Price,
  PriceStreamUseCase,
  type PricingPort,
} from "@rtc/domain";

import { conflateWhen } from "./conflateWhen";

/** Power-saver conflation interval for live prices. */
const PRICE_CONFLATION_MS = 250;

export class PriceStreamPresenter {
  private readonly cache = new Map<string, Observable<Price>>();

  constructor(
    private readonly pricing: PricingPort,
    private readonly powerSaver$: Observable<boolean>,
  ) {}

  price$(pair: CurrencyPair): Observable<Price> {
    const cached = this.cache.get(pair.symbol);
    if (cached) return cached;
    const raw = new PriceStreamUseCase(this.pricing)
      .execute(pair)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    const stream = raw.pipe(
      conflateWhen(this.powerSaver$, PRICE_CONFLATION_MS),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.cache.set(pair.symbol, stream);
    return stream;
  }
}
```

`PriceHistoryPresenter.ts` — identical shape with `HISTORY_CONFLATION_MS = 1000` around its `PriceHistoryUseCase` stream (constructor gains the same second parameter; inner `raw` + outer conflated `shareReplay`).

Composition: update both construction sites to pass the presenter's flag stream, e.g.

```ts
const powerSaver = new PowerSaverPresenter(ports.preferences);
// … inside the record:
powerSaver,
priceStream: new PriceStreamPresenter(ports.pricing, powerSaver.enabled$),
priceHistory: new PriceHistoryPresenter(ports.pricing, powerSaver.enabled$),
```

(Anchor on the actual field names at the construction site — the record keys may differ; keep them as-is, only add the second argument.)

- [ ] **Step 4: Run — expect PASS**, then the full package suite: `pnpm --filter @rtc/client-core test` (AnimationDirector and other consumers must stay green — their inputs are unchanged when the flag is off).
- [ ] **Step 5: Commit** — `feat(client-core): power-saver conflation of price + history streams`

---

### Task 6: `usePowerSaver` hook + `PowerSaverRoot` effect

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` (interface list ~L201, bind block ~L352, hook body ~L638 — anchor on the `useAnimatedBackground` triple)
- Create: `packages/client-react/src/ui/shell/power/PowerSaverRoot.tsx`
- Modify: `packages/client-react/src/AppRoot.tsx` (mount `<PowerSaverRoot />` as a sibling inside `ThemeProvider`'s children, before the workspace content)
- Test: `packages/client-react/tests/ui/contract/specs/shell/power/PowerSaverRoot.contract.spec.ts` + page object `packages/client-react/tests/ui/contract/shared/pages/shell/power/PowerSaverRootPage.ts` (register the component + page in the contract harness's component/page registries — follow how `AmbientBackground` is registered in `@ui-contract/components` and the pages barrel)

**Interfaces:**
- Consumes: `presenters.powerSaver` (Task 3).
- Produces: `usePowerSaver(): { enabled: boolean; setEnabled: (on: boolean) => void; toggle: () => void }` on the ViewModel; `document.documentElement.dataset.powerSaver` and the `--fx-play` root custom property. Tasks 7–9 rely on all three.

- [ ] **Step 1: Write the failing contract test**

```ts
import { PowerSaverRoot } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
  delete document.documentElement.dataset.powerSaver;
  document.documentElement.style.removeProperty("--fx-play");
});

describe("PowerSaverRoot", () => {
  it("stamps data-power-saver=false and --fx-play: running by default", () => {
    mount(PowerSaverRoot, {});
    expect(document.documentElement.dataset.powerSaver).toBe("false");
    expect(
      document.documentElement.style.getPropertyValue("--fx-play"),
    ).toBe("running");
  });

  it("stamps data-power-saver=true and --fx-play: paused when the preference is on", () => {
    mount(PowerSaverRoot, { powerSaver: true });
    expect(document.documentElement.dataset.powerSaver).toBe("true");
    expect(
      document.documentElement.style.getPropertyValue("--fx-play"),
    ).toBe("paused");
  });
});
```

(The `{ powerSaver: true }` mount option flows through `PreferencesSeed` from Task 1 — if the mount harness whitelists seed keys instead of accepting `PreferencesSeed` wholesale, add the key there.)

- [ ] **Step 2: Run — expect FAIL**: `pnpm --filter @rtc/client-react test:ui:contract -- PowerSaverRoot`
- [ ] **Step 3: Implement**

`createViewModel.ts` — three additions mirroring animatedBackground exactly:

```ts
// interface list:
  /** Global power-saver master override — enabled flag plus write/toggle intents. */
  usePowerSaver: () => UsePowerSaverResult;

// result interface (beside UseAnimatedBackgroundResult):
export interface UsePowerSaverResult {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}

// bind block:
  const [usePowerSaverValue] = bind(presenters.powerSaver.enabled$, false);

  function setPowerSaver(on: boolean): void {
    presenters.powerSaver.set(on);
  }

// hook body:
    usePowerSaver: () => {
      const enabled = usePowerSaverValue();
      return {
        enabled,
        setEnabled: setPowerSaver,
        toggle: () => {
          return presenters.powerSaver.toggle(enabled);
        },
      };
    },
```

`PowerSaverRoot.tsx`:

```tsx
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

import { useViewModel } from "@rtc/react-bindings";

/**
 * Applies the power-saver preference to the document root: a
 * `data-power-saver` flag (test/e2e observability) and the inherited
 * `--fx-play` play-state variable that every decorative animation reads
 * (`animation-play-state: var(--fx-play, running)`). Same rationale as
 * ThemeProvider: applying a preference to the document is RENDERING — the
 * View's job — and is deliberately coupled to the web render target.
 * Renders nothing.
 */
export function PowerSaverRoot(): null {
  const { usePowerSaver } = useViewModel();
  const { enabled } = usePowerSaver();

  useLayoutEffect(() => {
    document.documentElement.dataset.powerSaver = enabled ? "true" : "false";
    document.documentElement.style.setProperty(
      "--fx-play",
      enabled ? "paused" : "running",
    );
  }, [enabled]);

  return null;
}
```

Mount in `AppRoot.tsx` directly inside `<ThemeProvider>` (before the existing children). Register the component + a `PowerSaverRootPage` (it needs no queries beyond the documentElement reads shown in the test — if the harness requires a page class per component, give it `hasRoot(): boolean { return true; }`).

- [ ] **Step 4: Run — expect PASS**, plus `pnpm --filter @rtc/react-bindings typecheck && pnpm --filter @rtc/client-react test:ui:contract`
- [ ] **Step 5: Commit** — `feat(client-react): usePowerSaver hook + PowerSaverRoot document flags`

---

### Task 7: Visual gating — ambient layers, logo, connection dot

**Files:**
- Modify: `packages/client-react/src/ui/shell/background/AmbientBackground.tsx`
- Modify: `packages/client-react/src/ui/shell/logo/HudLogo.module.css`
- Modify: `packages/client-react/src/ui/shell/connection/ConnectionStatusBar.module.css`
- Test: `packages/client-react/tests/ui/contract/specs/shell/background/AmbientBackground.contract.spec.ts` (extend) + `packages/client-react/tests/ui/contract/shared/pages/shell/background/AmbientBackgroundPage.ts` (extend)

**Interfaces:**
- Consumes: `usePowerSaver` (Task 6); `--fx-play` root variable (Task 6).
- Produces: `data-power-saver` on the ambient wrap; aurora/sweep/dots absent while ON. Task 9's e2e and golden scenario rely on this exact behaviour.

- [ ] **Step 1: Write the failing contract test** — add to the existing spec:

```ts
  it("keeps only the static grid+vignette when power saver is on", () => {
    const page = mount(AmbientBackground, {
      animatedBackground: true,
      powerSaver: true,
    });
    expect(page.powerSaverFlag()).toBe("true");
    expect(page.hasAuroraLayers()).toBe(false);
  });

  it("renders the full aurora stack when power saver is off", () => {
    const page = mount(AmbientBackground, {
      animatedBackground: true,
      powerSaver: false,
    });
    expect(page.powerSaverFlag()).toBe("false");
    expect(page.hasAuroraLayers()).toBe(true);
  });
```

Page-object additions:

```ts
  /** The `data-power-saver` flag string; null when absent. */
  powerSaverFlag(): string | null {
    return this.el()?.dataset.powerSaver ?? null;
  }

  /** True when the aurora/sweep/dots animated layers are in the DOM. */
  hasAuroraLayers(): boolean {
    return this.el()?.querySelector('[data-layer="aurora"]') !== null;
  }
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

`AmbientBackground.tsx` — read both prefs; skip the animated layers entirely in power saver (absent layers cost no compositing, unlike paused ones); tag the aurora wrapper for the page object:

```tsx
export function AmbientBackground(): ReactElement {
  const { useAnimatedBackground, usePowerSaver } = useViewModel();
  const { enabled } = useAnimatedBackground();
  const { enabled: powerSaver } = usePowerSaver();
  const vars = {
    "--amb-play": enabled && !powerSaver ? "running" : "paused",
  } as CSSProperties;
  return (
    <div
      data-testid="ambient-background"
      aria-hidden="true"
      data-animated={enabled ? "true" : "false"}
      data-power-saver={powerSaver ? "true" : "false"}
      className={styles.wrap}
      style={vars}
    >
      {powerSaver ? null : (
        <>
          <div data-layer="aurora" className={styles.aurora}>
            <div className={styles.layerA} />
            <div className={styles.layerB} />
          </div>
          <div className={styles.sweep} />
          <div className={styles.dots} />
        </>
      )}
      <div className={styles.grid} />
      <div className={styles.vignette} />
    </div>
  );
}
```

(Note the grid moves after the conditional block; z-order is unaffected — the vignette's `z-index: 1` already sits above all layers, and the remaining layers don't overlap meaningfully. Update the component doc-comment: power saver removes the animated layers outright; `data-animated` still reflects the user's own pref — master-override, not a rewrite.)

`HudLogo.module.css` — inside `.spin` and `.spinRev` rules add:

```css
  animation-play-state: var(--fx-play, running);
```

`ConnectionStatusBar.module.css` — inside `.dot[data-status="CONNECTED"]` add the same line.

- [ ] **Step 4: Run — expect PASS**, then the full contract tier + `pnpm test:ui:visual` (existing goldens must be UNCHANGED — default state renders identically; if any golden diffs, the default path regressed: fix, don't regenerate).
- [ ] **Step 5: Commit** — `feat(client-react): power-saver visual gating (ambient layers, logo, dot)`

---

### Task 8: UI surfaces — PreferencesModal row + header quick toggle

**Files:**
- Modify: `packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx` (~L100, DISPLAY column, above the Animated-background PrefToggle)
- Create: `packages/client-react/src/ui/shell/chrome/PowerSaverToggle.tsx` + `PowerSaverToggle.module.css`
- Modify: `packages/client-react/src/ui/shell/chrome/HeaderChrome.tsx` (~L80: insert `<PowerSaverToggle />` between `<EnvBadge />` and `<ThemePicker />`)
- Test: extend `packages/client-react/tests/ui/contract/specs/shell/prefs/PreferencesModal.contract.spec.ts` and the HeaderChrome contract spec (find both under `tests/ui/contract/specs/shell/`; follow their existing toggle-click test shape and page objects)

**Interfaces:**
- Consumes: `usePowerSaver` (Task 6).
- Produces: `data-testid="pref-toggle-powerSaver"` (modal) and `data-testid="power-saver-toggle"` with `aria-pressed` (header). Task 9's e2e relies on `power-saver-toggle`.

- [ ] **Step 1: Write the failing contract tests**

Modal (in the PreferencesModal spec, following its wired animated-bg test):

```ts
  it("wires the Power saver toggle to the preference port", () => {
    const page = mount(PreferencesModal, { open: true, powerSaver: false });
    expect(page.toggleState("pref-toggle-powerSaver")).toBe(false);
    page.clickToggle("pref-toggle-powerSaver");
    expect(page.toggleState("pref-toggle-powerSaver")).toBe(true);
  });
```

Header (in the HeaderChrome spec):

```ts
  it("exposes a power-saver quick toggle that flips aria-pressed", () => {
    const page = mount(HeaderChrome, { activeTab: "fx", powerSaver: false });
    expect(page.powerSaverPressed()).toBe("false");
    page.clickPowerSaver();
    expect(page.powerSaverPressed()).toBe("true");
  });
```

with page-object additions:

```ts
  powerSaverPressed(): string | null {
    return within(this.root)
      .queryByTestId("power-saver-toggle")
      ?.getAttribute("aria-pressed") ?? null;
  }

  clickPowerSaver(): void {
    const btn = within(this.root).getByTestId("power-saver-toggle");
    fireEvent.click(btn);
  }
```

(Match the exact mount-prop and click-helper idioms of each existing spec — HeaderChrome's mount signature carries `activeTab`/`onTabChange` props; keep them.)

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

PreferencesModal — destructure both hooks and add the row above Animated background:

```tsx
  const { useAnimatedBackground, usePowerSaver } = useViewModel();
  const { enabled: powerSaver, toggle: togglePowerSaver } = usePowerSaver();
  // …
              <PrefToggle
                label="Power saver"
                description="Stills ambience & calms price updates. Best on slower hardware."
                on={powerSaver}
                onToggle={togglePowerSaver}
                testid="pref-toggle-powerSaver"
              />
```

(Also update the modal's doc-comment: TWO real wired rows now.)

`PowerSaverToggle.tsx`:

```tsx
import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./PowerSaverToggle.module.css";

/**
 * Header quick toggle for the power-saver master override — one click to
 * trade the ambient wow-effects for headroom on slower hardware. Mirrors the
 * Preferences-modal row (same preference); `aria-pressed` carries the state.
 */
export function PowerSaverToggle(): ReactElement {
  const { usePowerSaver } = useViewModel();
  const { enabled, toggle } = usePowerSaver();
  return (
    <button
      type="button"
      data-testid="power-saver-toggle"
      aria-label="Toggle power saver"
      aria-pressed={enabled ? "true" : "false"}
      data-active={enabled ? "true" : "false"}
      className={styles.button}
      onClick={toggle}
    >
      ⌁
    </button>
  );
}
```

`PowerSaverToggle.module.css` — copy the sizing/hover/focus rules of the adjacent header icon button (see `ThemePicker.module.css`'s mode button class) so it sits visually identical in the cluster, plus:

```css
.button[data-active="true"] {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  box-shadow: var(--glow);
}
```

HeaderChrome — import and insert `<PowerSaverToggle />` between `<EnvBadge />` and `<ThemePicker />`.

- [ ] **Step 4: Run — expect PASS**, then the FULL contract tier + coverage gate: `pnpm test:ui:contract && pnpm test:ui:coverage` (coverage ≥95% is a CI gate — the new component must be covered by the specs above).
- [ ] **Step 5: Commit** — `feat(client-react): power-saver toggle in prefs modal + header chrome`

---

### Task 9: Golden scenario, e2e persistence, closeout

**Files:**
- Modify: `packages/client-react/tests/ui/visual/registry.tsx` (add scenario `fx-power-saver`: the App scenario config with the `powerSaver: true` seed — copy the existing full-App fx scenario entry and add the seed)
- Create: `tests/browser/scenarios/powerSaver.ts`
- Create: `tests/browser/playwright/powerSaver.spec.ts`
- Modify: `tests/browser/run-all.ts` only if suites are enumerated by hand (check; the theme suite's registration is the model)

**Interfaces:**
- Consumes: `power-saver-toggle` testid + `html[data-power-saver]` (Tasks 6/8).

- [ ] **Step 1: Add the golden scenario** — in `registry.tsx`, duplicate the full-App FX entry as `fx-power-saver` with the `powerSaver: true` preference seed (same wrapper dimensions as its sibling — content-width scenarios flake on x86; the App scenarios are already full-bleed). Run `pnpm test:ui:visual -- --update` (or each runner's `:update` script) to capture the new local-arch goldens; verify the capture shows grid+vignette but no aurora and no motion.
- [ ] **Step 2: Write the e2e spec** (model: `tests/browser/playwright/theme.spec.ts`; scenario helpers follow `tests/browser/scenarios/theme.ts` — read it and `scenarios/common.ts` first and use the same ctx accessors):

```ts
import * as common from "../scenarios/common";
import * as powerSaver from "../scenarios/powerSaver";
import { test } from "./_context";
import { withWorkspaceOpen } from "./_openWorkspace";

test.describe("Power saver", () => {
  withWorkspaceOpen();

  test("quick toggle flips the document flag", async ({ ctx }) => {
    await powerSaver.expectDocumentFlag(ctx, "false");
    await powerSaver.clickQuickToggle(ctx);
    await powerSaver.expectDocumentFlag(ctx, "true");
  });

  test("power saver persists across reload", async ({ ctx }) => {
    await powerSaver.clickQuickToggle(ctx);
    await common.reloadPage(ctx);
    await powerSaver.expectDocumentFlag(ctx, "true");
  });
});
```

`scenarios/powerSaver.ts` exposes the two helpers using the suite's page-handle idiom (same accessor `scenarios/theme.ts` uses for its clicks/assertions): `clickQuickToggle` clicks `[data-testid="power-saver-toggle"]`; `expectDocumentFlag(ctx, value)` asserts `html` has `data-power-saver="<value>"` (Playwright: `expect(page.locator("html")).toHaveAttribute("data-power-saver", value)`).

- [ ] **Step 3: Full gauntlet** — `pnpm build && pnpm typecheck && pnpm test && pnpm check && pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css && pnpm test:ui:contract && pnpm test:ui:coverage && pnpm test:ui:visual && pnpm test:e2e:no-cypress` — all green.
- [ ] **Step 4: x86 goldens for the NEW scenario only** — push the branch, run `gh workflow run update-visual-goldens.yml --ref <branch>`, download the artifact, and copy ONLY the new `fx-power-saver` goldens (all three tiers) into `__screenshots__/react/`; leave every other golden untouched.
- [ ] **Step 5: Live acceptance + ship** — start the worktree dev server (`PORT=5199 pnpm --filter @rtc/client-react dev`), have the user toggle power saver and confirm both experiences; optionally verify with a 12s steady-state trace (expect GPU ≤ ~5%, recalcs only on conflated ticks). Then PR + CI loop + `--merge` per `shipping-repo-changes`; commit message `feat(client-react): power-saver mode — one switch between full FX and efficient rendering`.
