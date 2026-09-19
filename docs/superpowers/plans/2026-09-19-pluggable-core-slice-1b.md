# Pluggable Application Core — Slice 1b (Remaining Preferences) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the eleven remaining preference presenters natively into both alternative cores — `creditRfqFilterPreference`, `eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`, `loginWaitPreferences`, `jarvisPreferences`, `animatedBackground`, `ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation` — so every preference presenter in `@rtc/core-api` has three genuinely different implementations and `pnpm core:parity` reads 17/71 for each core.

**Architecture:** Slice 1a established the idiom for a replay-current preference stream in each core and proved it on four of them: in the async core a port Observable becomes a replay-1 refCounted `Topic` through `topicFromObservable` (one synchronous `relay`), published as a `Stream` through `topicToStream`; in the Effect core it becomes a `sharedFold` through `mirrorPort` (a `peek` seed per warm period plus an eagerly-subscribing `fromObservable` producer). Slice 1b adds no primitive: the eleven members are that idiom applied, plus `peek` for the two members whose API includes a synchronous read of the stored value (`bootPreference.current()`, `eqWatchlistSortPreference.cycle()`). The eleven contract suites already exist and are green on all three runners (PR #765); they pass on the alternative cores today only because those members still delegate, and this slice is what makes them witness something. Per core: three source files (single-stream mirrors and toggles in `preferences.ts`; the two multi-stream presenters in `groupedPreferences.ts`; the two synchronous-read presenters in `readPreferences.ts`), two test files, the composition overlay, `parity.json`, `index.ts`, the README. One ruling closes a slice-1a residual: completion is not part of the presenter-stream envelope.

**Tech Stack:** TypeScript 7 `tsc` (6.x API shim for tooling — see `docs/typescript-7.md`), pnpm 12 workspaces + Turborepo (strict env), vitest 4.1, RxJS 7.8 + `@rx-state/core` 0.1.4, `effect` 3.22.2, dependency-cruiser, knip, Playwright.

**Spec:** [`../specs/2026-09-11-pluggable-application-core-design.md`](../specs/2026-09-11-pluggable-application-core-design.md) — slice table row "1b remaining preferences". Slice 0 shipped as PR #717 (plan: [`2026-09-12-pluggable-core-slice-0.md`](2026-09-12-pluggable-core-slice-0.md)); slice 1a as PR #764 (plan: [`2026-09-18-pluggable-core-slice-1a.md`](2026-09-18-pluggable-core-slice-1a.md)); the eleven suites as PR #765.

## Global Constraints

- **Exit criterion (spec, "Slices 1a–7"):** suites for the eleven members exist and are green on RxJS (done — PR #765); both alternative cores have them native; the e2e matrix (`test:e2e`, `test:e2e:async`, `test:e2e:effect`) is green; `parity.json` updated in both cores.
- **Bridge rule:** outside `packages/client-core-{async,effect}/src/bridge/`, `rxjs` and `@rx-state/core` are **type-only** imports (dependency-cruiser `bridge-owns-rxjs` + grep gate 43; `.test.ts` files are exempt). `effect` is importable only inside `packages/client-core-effect/` (`effect-only-in-client-core-effect`). Nothing in this slice adds a value import of `rxjs` anywhere — `peek`, `topicFromObservable` and `fromObservable` already live in `bridge/in.ts`.
- **Types-only rule:** `packages/core-api/src` exports no runtime value (grep gate 42). Nothing in this slice touches `core-api` or `core-contract`.
- **Ordering rule (spec):** a member's suite is green on RxJS before either alternative core ports it. All eleven are (PR #765, merge `8e2f4553d`); no suite is amended here.
- **Workspace packages resolve through `dist`** (`exports` → `./dist/index.js`, no vitest alias). If `packages/core-contract/dist` is missing or stale in your worktree, run `pnpm --filter @rtc/core-contract build` before running either alternative core's tests — a stale `dist` gives a false result in either direction.
- **Shared dep versions must match the repo exactly** (`pnpm check:versions`). This slice adds no dependency.
- **Coverage gates:** each alternative core's `test:coverage` must stay ≥95% statements/lines/functions and ≥85% branches (CI step "Alternative-core coverage gates"). Every new branch in `src/` needs a covering test; the contract runner (`src/coreContract.test.ts`) already exercises every setter, stream, `toggle`, `cycle` and `current` through the eleven suites, so the unit tests below cover what the contract cannot see (port release, behind-the-back reads).
- **Biome:** mandatory braces on every control statement; arrow functions use block bodies with an explicit `return`; zero findings; no `biome-ignore`. Function names state their effect (`rtc/name-functions-by-effect`); slot props/params stay `onX`/`next`; test fixture factories are named `create*` (`rtc/name-fixture-factories`); `func-style` forbids `let f = () => {}`.
- `#/` subpath imports only; never `@/`; ≥2-up relative imports are banned.
- **The port is called once, at construction** (`preferences.x$()` evaluated once per presenter — the RxJS presenters' shape), except where a synchronous read needs a fresh subscription per call (`peek(preferences.x$(), …)` inside `current()`/`cycle()`, as slice 1a's `themePreference.cycle()` does).
- **No new env vars, scripts, packages, primitives or CI jobs** in this slice — the selection, matrix and gates from slice 0 and the idioms from slice 1a are reused as-is. If a member turns out to NEED a new bridge/kernel primitive, that is a finding to ledger and rule on, not something to add quietly.
- Commit after every task with the repo's trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH
  ```

## Rulings recorded up front

1. **Completion is not part of the presenter-stream envelope.** A presenter stream ends with the app (`dispose()`) or with an error; it never forwards a port's completion. Every port shipping today is `BehaviorSubject`-backed or app-lifetime, none completes outside teardown, no suite asserts completion, and neither alternative core has a completion channel (`Topic` has no `complete`; `sharedFold` never calls `subscriber.complete()`). Slice 1a deferred the decision; this slice takes it: the spec's assertion list is narrowed (Task 3 strikes "completion" and says why), the STATUS residual is closed, and no channel is added. Cost if wrong: a slice ≥2 member whose source legitimately ends (none is known) would need `Topic.complete` and a `sharedFold` completion path — one primitive each, added in that slice against a suite that asserts it.
2. **`bootPreference.current()` and `eqWatchlistSortPreference.cycle()` read through `peek`.** The same primitive as slice 1a's `themePreference.cycle()`, with the same fresh-subscription-per-call shape. The open residual "`peek` swallows a failing port" now covers three call sites instead of one; Task 3 rewords it. It stays open — a located error path for `peek` is a bridge change, out of this slice's scope.
3. **Three source files per core, grouped by API shape, not one file per presenter.** `preferences.ts` (existing) takes the five single-stream mirrors and the two boolean toggles — every member whose API is "one stream plus setters". `groupedPreferences.ts` takes `loginWaitPreferences` and `jarvisPreferences` — several independent streams under one presenter. `readPreferences.ts` takes `bootPreference` and `eqWatchlistSortPreference` — the members with a synchronous read of the stored value. Eleven files per core would mirror `client-core`'s one-class-per-file layout at the cost of twenty-two near-identical files; one file would be ~350 lines of the same shape. Cost if wrong: a rename.
4. **The Effect core gains `mirrorPortAsIs`, a two-line sibling of `mirrorPort`.** Every preference stream in this slice is an identity mirror; slice 1a wrote `(s) => { return s; }` at each of its four sites. Twelve more of those is noise a reader has to check individually. `mirrorPortAsIs(host, source, fallback)` is `mirrorPort` with the identity projection, and the four existing sites (three in `preferences.ts`, one in `themePreference.ts`) move to it so the package has one idiom. Not a new primitive: it composes `mirrorPort`, adds no branch, and lives in the same file.
5. **`toggle(current)` writes `!current` and reads nothing** — the contract's `toggle(current) flips the SUPPLIED value, not the stored one` case pins this, and the RxJS presenters do exactly this. The async core's `cycle()` and `current()` in ruling 2 are the ONLY reads.
6. **Equal-state conflation stays as slice 1a left it, uncontracted.** For a boolean or enum preference the port itself de-duplicates writes (`PreferencesSimulator` and the storage adapters skip an unchanged value), so all three cores emit identically for every case in the eleven suites; the Effect fold's `Object.is` guard is never the thing that fires. No new documentation needed beyond §22's existing sentence.

## Parallelism (accelerated SDD)

Task 1 (async core) and Task 2 (Effect core) touch disjoint packages and may run as two parallel implementers on the one worktree, each committing by pathspec (`git commit -- packages/client-core-async` / `-- packages/client-core-effect`) so neither sweeps up the other's work. Each review package is path-scoped the same way. Task 3 last, alone. Covering tests only per implementer; one gauntlet at the end (Task 3).

---

## File structure

```
packages/client-core-async/                      MODIFIED (Task 1)
  src/presenters/preferences.ts                  + createCreditRfqFilterPreferencePresenter, createEqBlotterViewPreferencePresenter,
                                                   createAmbientStylePresenter, createChartSubstratePresenter, createLayoutEnginePresenter,
                                                   createAnimatedBackgroundPresenter, createForceBootAnimationPresenter
  src/presenters/groupedPreferences.ts           NEW  createLoginWaitPreferencesPresenter, createJarvisPreferencesPresenter
  src/presenters/readPreferences.ts              NEW  createBootPreferencePresenter, createEqWatchlistSortPreferencePresenter
  src/presenters/preferenceStreams.test.ts       NEW  table-driven: every new stream holds the port only while warm, released synchronously
  src/presenters/readPreferences.test.ts         NEW  behind-the-back reads; peek leaves nothing warm
  src/composition.ts                             overlay gains the eleven
  src/parity.json                                eleven presenters flipped to "native"
  src/index.ts                                   new exports
  README.md                                      Parity section: seventeen native

packages/client-core-effect/                     MODIFIED (Task 2)
  src/presenters/mirrorPort.ts                   + mirrorPortAsIs(host, source, fallback)
  src/presenters/preferences.ts                  three existing sites → mirrorPortAsIs; + the same seven factories as the async core (host-first)
  src/presenters/themePreference.ts              modePreference$ site → mirrorPortAsIs (no behaviour change)
  src/presenters/groupedPreferences.ts           NEW  the two grouped presenters (host-first)
  src/presenters/readPreferences.ts              NEW  createBootPreferencePresenter(preferences) — no host, it owns no stream;
                                                      createEqWatchlistSortPreferencePresenter(host, preferences)
  src/presenters/preferenceStreams.test.ts       NEW  table-driven: every new stream holds the port only while warm, released after the scope closes
  src/presenters/readPreferences.test.ts         NEW  behind-the-back reads; peek leaves nothing warm
  src/composition.ts                             overlay gains the eleven
  src/parity.json                                eleven presenters flipped to "native"
  src/index.ts                                   new exports
  README.md                                      Parity section: seventeen native

docs/ + CLAUDE.md                                MODIFIED (Task 3)
  docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md   "completion" struck from the assertion list (ruling 1); slice 1b shipped line
  docs/architecture/22-pluggable-application-core.md                       parity paragraph: seventeen native
  docs/adr/ADR-006-pluggable-application-core.md                           "Decided in slice 1b" block (completion; no new primitive needed)
  CLAUDE.md                                                                Current Status sentence, two package rows, the Application core rule
  docs/STATUS.md                                                           headline → slice 2; residuals: completion closed, peek reworded, corrupted lines repaired, plan link
```

---

### Task 1: Async core — the eleven native members

**Files:**
- Modify: `packages/client-core-async/src/presenters/preferences.ts`
- Create: `packages/client-core-async/src/presenters/groupedPreferences.ts`
- Create: `packages/client-core-async/src/presenters/readPreferences.ts`
- Create: `packages/client-core-async/src/presenters/preferenceStreams.test.ts`
- Create: `packages/client-core-async/src/presenters/readPreferences.test.ts`
- Modify: `packages/client-core-async/src/composition.ts`
- Modify: `packages/client-core-async/src/parity.json`
- Modify: `packages/client-core-async/src/index.ts`
- Modify: `packages/client-core-async/README.md`

**Interfaces:**
- Consumes (slice 1a, all in place): `topicFromObservable<T>(source: Observable<T>): Topic<T>` and `peek<T>(source: Observable<T>, fallback: T): T` from `#/bridge/in`; `topicToStream<T>(topic: Topic<T>): Stream<T>` from `#/bridge/out`. From `@rtc/domain`: `PreferencesPort` (stream methods `creditRfqFilter$`, `eqBlotterView$`, `ambientStyle$`, `chartSubstrate$`, `layoutEngine$`, `animatedBackground$`, `forceBootAnimation$`, `loginWaitStyle$`, `loginWaitDelay$`, `jarvisBrain$`, `jarvisEffort$`, `jarvisNarrator$`, `bootVariant$`, `eqWatchlistSort$`, and the matching `setX` writers), `nextEqWatchlistSort`, and the `DEFAULT_*` constants named in the code below. From `@rtc/core-api`: the eleven presenter interfaces, named `<Member>Presenter` with the member's first letter upper-cased (e.g. `CreditRfqFilterPreferencePresenter`, `BootPreferencePresenter`).
- Produces: eleven factories, each `create<Member>Presenter(preferences: PreferencesPort): <Member>Presenter`, exported from the package index; the parity manifest at 17 native.

- [ ] **Step 1: Extend `preferences.ts` with the seven single-stream members**

Replace the import block at the top of `packages/client-core-async/src/presenters/preferences.ts` with:

```ts
import type {
  AmbientStylePresenter,
  AnimatedBackgroundPresenter,
  ChartSubstratePresenter,
  CreditRfqFilterPreferencePresenter,
  EqBlotterViewPreferencePresenter,
  ForceBootAnimationPresenter,
  LayoutEnginePresenter,
  PowerSaverPresenter,
  ThemeSkinPreferencePresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";
import type {
  AmbientStyle,
  ChartSubstrate,
  CreditRfqFilter,
  EqBlotterView,
  LayoutEngine,
  PowerSaverLevel,
  PreferencesPort,
  ThemeSkin,
  ViewMode,
} from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { mapTopic } from "#/kernel/topic";
```

Leave the three existing factories (`createThemeSkinPreferencePresenter`, `createViewModePreferencePresenter`, `createPowerSaverPresenter`) and their doc comments exactly as they are, and append after `createPowerSaverPresenter`:

```ts
export function createCreditRfqFilterPreferencePresenter(
  preferences: PreferencesPort,
): CreditRfqFilterPreferencePresenter {
  return {
    filter$: topicToStream(topicFromObservable(preferences.creditRfqFilter$())),
    setFilter: (filter: CreditRfqFilter) => {
      preferences.setCreditRfqFilter(filter);
    },
  };
}

export function createEqBlotterViewPreferencePresenter(
  preferences: PreferencesPort,
): EqBlotterViewPreferencePresenter {
  return {
    view$: topicToStream(topicFromObservable(preferences.eqBlotterView$())),
    setView: (view: EqBlotterView) => {
      preferences.setEqBlotterView(view);
    },
  };
}

export function createAmbientStylePresenter(
  preferences: PreferencesPort,
): AmbientStylePresenter {
  return {
    style$: topicToStream(topicFromObservable(preferences.ambientStyle$())),
    setStyle: (style: AmbientStyle) => {
      preferences.setAmbientStyle(style);
    },
  };
}

export function createChartSubstratePresenter(
  preferences: PreferencesPort,
): ChartSubstratePresenter {
  return {
    substrate$: topicToStream(
      topicFromObservable(preferences.chartSubstrate$()),
    ),
    setSubstrate: (substrate: ChartSubstrate) => {
      preferences.setChartSubstrate(substrate);
    },
  };
}

export function createLayoutEnginePresenter(
  preferences: PreferencesPort,
): LayoutEnginePresenter {
  return {
    engine$: topicToStream(topicFromObservable(preferences.layoutEngine$())),
    setEngine: (engine: LayoutEngine) => {
      preferences.setLayoutEngine(engine);
    },
  };
}

/** The two boolean gates. `toggle(current)` flips the SUPPLIED value and
 * reads nothing — the caller's rendered state is the truth it flips, and a
 * store-reading toggle would diverge from it exactly when the two disagree
 * (the contract's `toggle(current)` case pins the difference). */

export function createAnimatedBackgroundPresenter(
  preferences: PreferencesPort,
): AnimatedBackgroundPresenter {
  return {
    enabled$: topicToStream(
      topicFromObservable(preferences.animatedBackground$()),
    ),
    set: (on: boolean) => {
      preferences.setAnimatedBackground(on);
    },
    toggle: (current: boolean) => {
      preferences.setAnimatedBackground(!current);
    },
  };
}

export function createForceBootAnimationPresenter(
  preferences: PreferencesPort,
): ForceBootAnimationPresenter {
  return {
    enabled$: topicToStream(
      topicFromObservable(preferences.forceBootAnimation$()),
    ),
    set: (on: boolean) => {
      preferences.setForceBootAnimation(on);
    },
    toggle: (current: boolean) => {
      preferences.setForceBootAnimation(!current);
    },
  };
}
```

- [ ] **Step 2: Create `groupedPreferences.ts`**

```ts
import type {
  JarvisPreferencesPresenter,
  LoginWaitPreferencesPresenter,
} from "@rtc/core-api";
import type {
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
  LoginWaitDelay,
  LoginWaitStyle,
  PreferencesPort,
} from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";

/** Presenters that group several independent preferences under one member
 * because the UI always shows them together. Each stream is its own
 * `topicFromObservable` over its own port stream — its own refCount, its own
 * port subscription — so setting one never emits on another. */

export function createLoginWaitPreferencesPresenter(
  preferences: PreferencesPort,
): LoginWaitPreferencesPresenter {
  return {
    style$: topicToStream(topicFromObservable(preferences.loginWaitStyle$())),
    delay$: topicToStream(topicFromObservable(preferences.loginWaitDelay$())),
    setStyle: (style: LoginWaitStyle) => {
      preferences.setLoginWaitStyle(style);
    },
    setDelay: (delay: LoginWaitDelay) => {
      preferences.setLoginWaitDelay(delay);
    },
  };
}

export function createJarvisPreferencesPresenter(
  preferences: PreferencesPort,
): JarvisPreferencesPresenter {
  return {
    brain$: topicToStream(topicFromObservable(preferences.jarvisBrain$())),
    effort$: topicToStream(topicFromObservable(preferences.jarvisEffort$())),
    narrator$: topicToStream(
      topicFromObservable(preferences.jarvisNarrator$()),
    ),
    setBrain: (brain: JarvisBrain) => {
      preferences.setJarvisBrain(brain);
    },
    setEffort: (effort: JarvisEffort) => {
      preferences.setJarvisEffort(effort);
    },
    setNarrator: (preference: JarvisNarratorPreference) => {
      preferences.setJarvisNarrator(preference);
    },
  };
}
```

- [ ] **Step 3: Create `readPreferences.ts`**

```ts
import type {
  BootPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
} from "@rtc/core-api";
import {
  type BootVariant,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_EQ_WATCHLIST_SORT,
  type EqWatchlistSort,
  nextEqWatchlistSort,
  type PreferencesPort,
} from "@rtc/domain";

import { peek, topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";

/** Presenters whose API includes a synchronous read of the STORED value.
 * Each read is a `peek` of a fresh port subscription (released before it
 * returns, so nothing is left warm) — never a value cached by the presenter,
 * so a write made behind the presenter's back is what the next read sees.
 * The same shape as `themePreference.cycle()`. */

export function createBootPreferencePresenter(
  preferences: PreferencesPort,
): BootPreferencePresenter {
  return {
    current: () => {
      return peek(preferences.bootVariant$(), DEFAULT_BOOT_VARIANT);
    },
    setVariant: (variant: BootVariant) => {
      preferences.setBootVariant(variant);
    },
  };
}

export function createEqWatchlistSortPreferencePresenter(
  preferences: PreferencesPort,
): EqWatchlistSortPreferencePresenter {
  return {
    sort$: topicToStream(topicFromObservable(preferences.eqWatchlistSort$())),
    setSort: (sort: EqWatchlistSort) => {
      preferences.setEqWatchlistSort(sort);
    },
    /** Advance from the TRUE stored value (sym → chg → price → sym), so rapid
     * successive clicks each advance from the real state. */
    cycle: () => {
      preferences.setEqWatchlistSort(
        nextEqWatchlistSort(
          peek(preferences.eqWatchlistSort$(), DEFAULT_EQ_WATCHLIST_SORT),
        ),
      );
    },
  };
}
```

- [ ] **Step 4: Write the failing port-release test** — `preferenceStreams.test.ts`

The contract cannot see whether a preference stream releases its port on the last unsubscribe (the scripted driver has no preferences hook), and §22 guarantee 2 is exactly that. One table over the thirteen new streams (`bootPreference` owns none):

```ts
import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Stream } from "@rtc/core-api";
import { type PreferencesPort, PreferencesSimulator } from "@rtc/domain";

import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
import {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
} from "#/presenters/preferences";
import { createEqWatchlistSortPreferencePresenter } from "#/presenters/readPreferences";

/** A `PreferencesPort` stream method name — the `$`-suffixed members. */
type PortStreamName = Extract<keyof PreferencesPort, `${string}$`>;

interface StreamCase {
  port: PortStreamName;
  stream: (preferences: PreferencesPort) => Stream<unknown>;
}

const CASES: StreamCase[] = [
  {
    port: "creditRfqFilter$",
    stream: (p) => {
      return createCreditRfqFilterPreferencePresenter(p).filter$;
    },
  },
  {
    port: "eqBlotterView$",
    stream: (p) => {
      return createEqBlotterViewPreferencePresenter(p).view$;
    },
  },
  {
    port: "ambientStyle$",
    stream: (p) => {
      return createAmbientStylePresenter(p).style$;
    },
  },
  {
    port: "chartSubstrate$",
    stream: (p) => {
      return createChartSubstratePresenter(p).substrate$;
    },
  },
  {
    port: "layoutEngine$",
    stream: (p) => {
      return createLayoutEnginePresenter(p).engine$;
    },
  },
  {
    port: "animatedBackground$",
    stream: (p) => {
      return createAnimatedBackgroundPresenter(p).enabled$;
    },
  },
  {
    port: "forceBootAnimation$",
    stream: (p) => {
      return createForceBootAnimationPresenter(p).enabled$;
    },
  },
  {
    port: "loginWaitStyle$",
    stream: (p) => {
      return createLoginWaitPreferencesPresenter(p).style$;
    },
  },
  {
    port: "loginWaitDelay$",
    stream: (p) => {
      return createLoginWaitPreferencesPresenter(p).delay$;
    },
  },
  {
    port: "jarvisBrain$",
    stream: (p) => {
      return createJarvisPreferencesPresenter(p).brain$;
    },
  },
  {
    port: "jarvisEffort$",
    stream: (p) => {
      return createJarvisPreferencesPresenter(p).effort$;
    },
  },
  {
    port: "jarvisNarrator$",
    stream: (p) => {
      return createJarvisPreferencesPresenter(p).narrator$;
    },
  },
  {
    port: "eqWatchlistSort$",
    stream: (p) => {
      return createEqWatchlistSortPreferencePresenter(p).sort$;
    },
  },
];

describe("native preference streams (async)", () => {
  it.each(CASES)(
    "$port is subscribed by the first consumer, replays synchronously, and is released SYNCHRONOUSLY by the last",
    ({ port, stream }) => {
      const subject = new BehaviorSubject<unknown>("seed");
      const stream$ = stream(createPortWithSubject(port, subject));
      // Construction calls the port method but subscribes nothing.
      expect(subject.observed).toBe(false);
      const seen: unknown[] = [];
      const sub = stream$.subscribe((value) => {
        seen.push(value);
      });
      expect(seen).toEqual(["seed"]);
      expect(subject.observed).toBe(true);
      sub.unsubscribe();
      // No `await`: a release that waited on a `finally` after an `await`
      // would still read `true` here (see `mapTopic`'s abort listener).
      expect(subject.observed).toBe(false);
    },
  );
});

/** A real simulator whose `<name>` stream method returns the CALLER's own
 * subject, so the test can read that subject's `observed` flag directly. A
 * Proxy rather than an object spread: TypeScript drops a class's methods
 * from a spread type, so `{ ...simulator, [name]: … }` would not satisfy
 * `PreferencesPort`; the proxy keeps every other method — and its `this` —
 * intact (the same shape as `themePreference.test.ts`). */
function createPortWithSubject(
  name: PortStreamName,
  subject: BehaviorSubject<unknown>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === name) {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
```

- [ ] **Step 5: Run it**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/presenters/preferenceStreams.test.ts`
Expected: PASS, 13 rows. This test is a guard over transcription rather than a RED/GREEN driver: a row goes red at `expect(seen).toEqual(["seed"])` if its factory wired a different port method than the one named in `port` (the presenter would then mirror a simulator stream instead of the caller's subject), and at the final `observed` check if a stream held its port past the last unsubscribe. Prove the guard bites once before trusting it: temporarily change `createAmbientStylePresenter` to read `preferences.chartSubstrate$()`, watch the `ambientStyle$` row fail, revert.

- [ ] **Step 6: Write the behind-the-back read test** — `readPreferences.test.ts`

```ts
import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type BootVariant,
  type EqWatchlistSort,
  type PreferencesPort,
  PreferencesSimulator,
} from "@rtc/domain";

import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";

describe("createEqWatchlistSortPreferencePresenter (async)", () => {
  it("cycle() advances from the value the PORT holds now, even one written behind the presenter's back", () => {
    const preferences = new PreferencesSimulator({ eqWatchlistSort: "chg" });
    const presenter = createEqWatchlistSortPreferencePresenter(preferences);
    const seen: EqWatchlistSort[] = [];
    const sub = preferences.eqWatchlistSort$().subscribe((sort) => {
      seen.push(sort);
    });
    // Not through the presenter: a presenter that cached its own last
    // `setSort` would advance from "chg" here and land on "price".
    preferences.setEqWatchlistSort("price");
    presenter.cycle();
    expect(seen).toEqual(["chg", "price", "sym"]);
    sub.unsubscribe();
  });

  it("cycle() leaves nothing warm on the port", () => {
    const subject = new BehaviorSubject<EqWatchlistSort>("sym");
    const presenter = createEqWatchlistSortPreferencePresenter(
      createPortWithEqWatchlistSort(subject),
    );
    presenter.cycle();
    expect(subject.observed).toBe(false);
  });
});

describe("createBootPreferencePresenter (async)", () => {
  it("current() reads the value the PORT holds now, even one written behind the presenter's back", () => {
    const preferences = new PreferencesSimulator({ bootVariant: "core" });
    const presenter = createBootPreferencePresenter(preferences);
    expect(presenter.current()).toBe("core");
    preferences.setBootVariant("laser");
    expect(presenter.current()).toBe("laser");
  });

  it("current() leaves nothing warm on the port", () => {
    const subject = new BehaviorSubject<BootVariant>("geo");
    const presenter = createBootPreferencePresenter(
      createPortWithBootVariant(subject),
    );
    expect(presenter.current()).toBe("geo");
    expect(subject.observed).toBe(false);
  });
});

/** A real simulator whose `eqWatchlistSort$` returns the CALLER's subject —
 * the Proxy shape `themePreference.test.ts` uses, for the same reason
 * (TypeScript drops a class's methods from an object spread). */
function createPortWithEqWatchlistSort(
  subject: BehaviorSubject<EqWatchlistSort>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === "eqWatchlistSort$") {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

function createPortWithBootVariant(
  subject: BehaviorSubject<BootVariant>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === "bootVariant$") {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
```

- [ ] **Step 7: Run both new test files**

Run: `pnpm --filter @rtc/client-core-async exec vitest run src/presenters`
Expected: PASS, all cases (13 table rows + 4 read cases, plus the existing presenter tests).

- [ ] **Step 8: Wire the overlay** — `composition.ts`

Replace the presenter imports and `nativePresenters` in `packages/client-core-async/src/composition.ts`:

```ts
import { createCommands } from "#/commands";
import { createConnectionPresenter } from "#/presenters/connection";
import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
import {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";
import { createThemePreferencePresenter } from "#/presenters/themePreference";
```

```ts
/** Members this core implements natively — slice 1a: the connection fold,
 * the four theme/view/power-saver preferences, and `commands` (see
 * `createCommands`); slice 1b: the eleven remaining preference presenters.
 * Everything else still delegates to the RxJS core. `parity.json` is the
 * committed record of the same fact and `parity.test.ts` proves the two
 * agree by reference. */
function nativePresenters(ports: AppPorts): Partial<Presenters> {
  const { preferences } = ports;
  return {
    connection: createConnectionPresenter(ports.connectionEvents),
    themePreference: createThemePreferencePresenter(
      preferences,
      ports.colorScheme,
    ),
    themeSkinPreference: createThemeSkinPreferencePresenter(preferences),
    viewModePreference: createViewModePreferencePresenter(preferences),
    powerSaver: createPowerSaverPresenter(preferences),
    creditRfqFilterPreference:
      createCreditRfqFilterPreferencePresenter(preferences),
    eqWatchlistSortPreference:
      createEqWatchlistSortPreferencePresenter(preferences),
    eqBlotterViewPreference: createEqBlotterViewPreferencePresenter(preferences),
    bootPreference: createBootPreferencePresenter(preferences),
    loginWaitPreferences: createLoginWaitPreferencesPresenter(preferences),
    jarvisPreferences: createJarvisPreferencesPresenter(preferences),
    animatedBackground: createAnimatedBackgroundPresenter(preferences),
    ambientStyle: createAmbientStylePresenter(preferences),
    chartSubstrate: createChartSubstratePresenter(preferences),
    layoutEngine: createLayoutEnginePresenter(preferences),
    forceBootAnimation: createForceBootAnimationPresenter(preferences),
  };
}
```

(Biome's formatter decides the line breaks; the content is what matters.)

- [ ] **Step 9: Flip the manifest** — `parity.json`

In `packages/client-core-async/src/parity.json`, change these eleven `presenters` entries from `"delegated"` to `"native"`, touching nothing else: `animatedBackground`, `ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation`, `creditRfqFilterPreference`, `eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`, `loginWaitPreferences`, `jarvisPreferences`. (`dockLayoutStore` between them stays `"delegated"` — it is not a preference presenter; slice 6.)

- [ ] **Step 10: Run the parity drift test and the contract runner**

```bash
pnpm --filter @rtc/core-contract build     # only if dist is missing/stale in this worktree
pnpm --filter @rtc/client-core-async test
```

Expected: PASS. `parity.test.ts` — "matches reality" — fails for any member whose manifest entry and overlay disagree (a `"native"` member that is still the RxJS instance, or the reverse), which is the check that Steps 8 and 9 agree. `coreContract.test.ts` — the eleven suites now run against native members: 38 cases under the `async` label green.

- [ ] **Step 11: Export from the index** — append to `packages/client-core-async/src/index.ts` (Biome sorts the export block; keep one alphabetical order per source path):

```ts
export {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
```

and extend the existing `#/presenters/preferences` export with the seven new names:

```ts
export {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
export {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";
```

- [ ] **Step 12: README** — in `packages/client-core-async/README.md`, replace the paragraph beginning `As of slice 1a, six members are **native**` up to and including `for presenters, machines and commands alike.` with:

```
As of slice 1b, seventeen members are **native** — `connection`, every
preference presenter (`themePreference`, `themeSkinPreference`,
`viewModePreference`, `powerSaver`, `creditRfqFilterPreference`,
`eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`,
`loginWaitPreferences`, `jarvisPreferences`, `animatedBackground`,
`ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation`) and
`commands.reconnect` — and everything else still **delegates** to
`@rtc/client-core` (the strangler seam): `composeWithBase` builds the RxJS
app and overlays what this core implements. The native idiom for a
replay-current stream is `topicFromObservable` (a port as a replay-1,
refCounted `Topic` whose producer is one synchronous `relay`), `mapTopic`
for a projection of it, a hand-written `createTopic` producer where two
inputs combine (`mode$`), and `peek` for a synchronous read of the stored
value (`cycle()`, `current()` — `src/presenters/readPreferences.ts`). The
presenter files group by API shape: `preferences.ts` (one stream plus
setters, including the two boolean toggles), `groupedPreferences.ts`
(several independent streams under one member), `readPreferences.ts`.
`src/parity.json` is the committed record of the split and
`src/parity.test.ts` proves manifest and reality agree by reference
identity — for presenters, machines and commands alike.
```

- [ ] **Step 13: Lint, typecheck, coverage**

```bash
pnpm exec biome ci packages/client-core-async
pnpm --filter @rtc/client-core-async typecheck
pnpm --filter @rtc/client-core-async test:coverage
pnpm exec eslint packages/client-core-async/src
```

Expected: all clean; coverage ≥95/95/95/85. If `eslint` is not wired as a per-package script, the root invocation above is the one CI runs (see `ci.yml`, "ESLint").

- [ ] **Step 14: Commit (by pathspec — a parallel implementer may be working in the sibling package)**

```bash
git add packages/client-core-async
git commit -m "feat(client-core-async): the eleven slice-1b preference presenters native — topicFromObservable mirrors, peek reads; parity 17/71

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH" -- packages/client-core-async
```

---

### Task 2: Effect core — the eleven native members

**Files:**
- Modify: `packages/client-core-effect/src/presenters/mirrorPort.ts`
- Modify: `packages/client-core-effect/src/presenters/preferences.ts`
- Modify: `packages/client-core-effect/src/presenters/themePreference.ts` (one call site)
- Create: `packages/client-core-effect/src/presenters/groupedPreferences.ts`
- Create: `packages/client-core-effect/src/presenters/readPreferences.ts`
- Create: `packages/client-core-effect/src/presenters/preferenceStreams.test.ts`
- Create: `packages/client-core-effect/src/presenters/readPreferences.test.ts`
- Modify: `packages/client-core-effect/src/composition.ts`
- Modify: `packages/client-core-effect/src/parity.json`
- Modify: `packages/client-core-effect/src/index.ts`
- Modify: `packages/client-core-effect/README.md`

**Interfaces:**
- Consumes (slice 1a, all in place): `mirrorPort<T, U>(host: EffectHost, source: CoreStream<T>, fallback: T, project: (value: T) => U): CoreStream<U>` from `#/presenters/mirrorPort`; `peek<T>(source: Observable<T>, fallback: T): T` from `#/bridge/in`; `EffectHost` (`{ runtime, scope }`) from `#/bridge/out`. Same `@rtc/domain` and `@rtc/core-api` names as Task 1.
- Produces: `mirrorPortAsIs<T>(host: EffectHost, source: CoreStream<T>, fallback: T): CoreStream<T>`; ten host-first factories `create<Member>Presenter(host: EffectHost, preferences: PreferencesPort): <Member>Presenter`; one host-free factory `createBootPreferencePresenter(preferences: PreferencesPort): BootPreferencePresenter` (it owns no stream, so nothing runs under the host); the parity manifest at 17 native.

- [ ] **Step 1: Add `mirrorPortAsIs`** — append to `packages/client-core-effect/src/presenters/mirrorPort.ts`:

```ts
/** `mirrorPort` with the identity projection: the port's own values,
 * unchanged — what most preference streams are. Same seed, same producer,
 * same conflation note as `mirrorPort`. */
export function mirrorPortAsIs<T>(
  host: EffectHost,
  source: CoreStream<T>,
  fallback: T,
): CoreStream<T> {
  return mirrorPort(host, source, fallback, (value) => {
    return value;
  });
}
```

- [ ] **Step 2: Move the four existing identity sites to it**

In `packages/client-core-effect/src/presenters/preferences.ts`, `createThemeSkinPreferencePresenter`'s `skin$`, `createViewModePreferencePresenter`'s `viewMode$` and `createPowerSaverPresenter`'s `level$` become:

```ts
    skin$: mirrorPortAsIs(host, preferences.themeSkin$(), DEFAULT_THEME_SKIN),
```
```ts
    viewMode$: mirrorPortAsIs(host, preferences.viewMode$(), DEFAULT_VIEW_MODE),
```
```ts
    level$: mirrorPortAsIs(host, level, DEFAULT_POWER_SAVER_LEVEL),
```

(`isCalm$` / `isFreeze$` keep `mirrorPort` — they project.) In `packages/client-core-effect/src/presenters/themePreference.ts`, `modePreference$` becomes:

```ts
    modePreference$: mirrorPortAsIs(
      host,
      modePreference,
      DEFAULT_THEME_MODE_PREFERENCE,
    ),
```

and its import line becomes `import { mirrorPortAsIs } from "#/presenters/mirrorPort";` (it no longer uses `mirrorPort` directly; `sharedFold` for `mode$` is untouched). Run `pnpm --filter @rtc/client-core-effect test` — the existing theme/preference tests must stay green; this is a pure rename of the projection.

- [ ] **Step 3: Extend `preferences.ts` with the seven single-stream members**

Replace the import block at the top of `packages/client-core-effect/src/presenters/preferences.ts` with:

```ts
import type {
  AmbientStylePresenter,
  AnimatedBackgroundPresenter,
  ChartSubstratePresenter,
  CreditRfqFilterPreferencePresenter,
  EqBlotterViewPreferencePresenter,
  ForceBootAnimationPresenter,
  LayoutEnginePresenter,
  PowerSaverPresenter,
  ThemeSkinPreferencePresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";
import {
  type AmbientStyle,
  type ChartSubstrate,
  type CreditRfqFilter,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_ANIMATED_BACKGROUND,
  DEFAULT_CHART_SUBSTRATE,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_FORCE_BOOT_ANIMATION,
  DEFAULT_LAYOUT_ENGINE,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type EqBlotterView,
  type LayoutEngine,
  type PowerSaverLevel,
  type PreferencesPort,
  type ThemeSkin,
  type ViewMode,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { mirrorPort, mirrorPortAsIs } from "#/presenters/mirrorPort";
```

and append after `createPowerSaverPresenter`:

```ts
export function createCreditRfqFilterPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): CreditRfqFilterPreferencePresenter {
  return {
    filter$: mirrorPortAsIs(
      host,
      preferences.creditRfqFilter$(),
      DEFAULT_CREDIT_RFQ_FILTER,
    ),
    setFilter: (filter: CreditRfqFilter) => {
      preferences.setCreditRfqFilter(filter);
    },
  };
}

export function createEqBlotterViewPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): EqBlotterViewPreferencePresenter {
  return {
    view$: mirrorPortAsIs(
      host,
      preferences.eqBlotterView$(),
      DEFAULT_EQ_BLOTTER_VIEW,
    ),
    setView: (view: EqBlotterView) => {
      preferences.setEqBlotterView(view);
    },
  };
}

export function createAmbientStylePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): AmbientStylePresenter {
  return {
    style$: mirrorPortAsIs(
      host,
      preferences.ambientStyle$(),
      DEFAULT_AMBIENT_STYLE,
    ),
    setStyle: (style: AmbientStyle) => {
      preferences.setAmbientStyle(style);
    },
  };
}

export function createChartSubstratePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ChartSubstratePresenter {
  return {
    substrate$: mirrorPortAsIs(
      host,
      preferences.chartSubstrate$(),
      DEFAULT_CHART_SUBSTRATE,
    ),
    setSubstrate: (substrate: ChartSubstrate) => {
      preferences.setChartSubstrate(substrate);
    },
  };
}

export function createLayoutEnginePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): LayoutEnginePresenter {
  return {
    engine$: mirrorPortAsIs(
      host,
      preferences.layoutEngine$(),
      DEFAULT_LAYOUT_ENGINE,
    ),
    setEngine: (engine: LayoutEngine) => {
      preferences.setLayoutEngine(engine);
    },
  };
}

/** The two boolean gates. `toggle(current)` flips the SUPPLIED value and
 * reads nothing — the caller's rendered state is the truth it flips, and a
 * store-reading toggle would diverge from it exactly when the two disagree
 * (the contract's `toggle(current)` case pins the difference). */

export function createAnimatedBackgroundPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): AnimatedBackgroundPresenter {
  return {
    enabled$: mirrorPortAsIs(
      host,
      preferences.animatedBackground$(),
      DEFAULT_ANIMATED_BACKGROUND,
    ),
    set: (on: boolean) => {
      preferences.setAnimatedBackground(on);
    },
    toggle: (current: boolean) => {
      preferences.setAnimatedBackground(!current);
    },
  };
}

export function createForceBootAnimationPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): ForceBootAnimationPresenter {
  return {
    enabled$: mirrorPortAsIs(
      host,
      preferences.forceBootAnimation$(),
      DEFAULT_FORCE_BOOT_ANIMATION,
    ),
    set: (on: boolean) => {
      preferences.setForceBootAnimation(on);
    },
    toggle: (current: boolean) => {
      preferences.setForceBootAnimation(!current);
    },
  };
}
```

- [ ] **Step 4: Create `groupedPreferences.ts`**

```ts
import type {
  JarvisPreferencesPresenter,
  LoginWaitPreferencesPresenter,
} from "@rtc/core-api";
import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_NARRATOR,
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisNarratorPreference,
  type LoginWaitDelay,
  type LoginWaitStyle,
  type PreferencesPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** Presenters that group several independent preferences under one member
 * because the UI always shows them together. Each stream is its own
 * `mirrorPortAsIs` over its own port stream — its own warm period, its own
 * port subscription — so setting one never emits on another. */

export function createLoginWaitPreferencesPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): LoginWaitPreferencesPresenter {
  return {
    style$: mirrorPortAsIs(
      host,
      preferences.loginWaitStyle$(),
      DEFAULT_LOGIN_WAIT_STYLE,
    ),
    delay$: mirrorPortAsIs(
      host,
      preferences.loginWaitDelay$(),
      DEFAULT_LOGIN_WAIT_DELAY,
    ),
    setStyle: (style: LoginWaitStyle) => {
      preferences.setLoginWaitStyle(style);
    },
    setDelay: (delay: LoginWaitDelay) => {
      preferences.setLoginWaitDelay(delay);
    },
  };
}

export function createJarvisPreferencesPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): JarvisPreferencesPresenter {
  return {
    brain$: mirrorPortAsIs(
      host,
      preferences.jarvisBrain$(),
      DEFAULT_JARVIS_BRAIN,
    ),
    effort$: mirrorPortAsIs(
      host,
      preferences.jarvisEffort$(),
      DEFAULT_JARVIS_EFFORT,
    ),
    narrator$: mirrorPortAsIs(
      host,
      preferences.jarvisNarrator$(),
      DEFAULT_JARVIS_NARRATOR,
    ),
    setBrain: (brain: JarvisBrain) => {
      preferences.setJarvisBrain(brain);
    },
    setEffort: (effort: JarvisEffort) => {
      preferences.setJarvisEffort(effort);
    },
    setNarrator: (preference: JarvisNarratorPreference) => {
      preferences.setJarvisNarrator(preference);
    },
  };
}
```

- [ ] **Step 5: Create `readPreferences.ts`**

```ts
import type {
  BootPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
} from "@rtc/core-api";
import {
  type BootVariant,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_EQ_WATCHLIST_SORT,
  type EqWatchlistSort,
  nextEqWatchlistSort,
  type PreferencesPort,
} from "@rtc/domain";

import { peek } from "#/bridge/in";
import type { EffectHost } from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** Presenters whose API includes a synchronous read of the STORED value.
 * Each read is a `peek` of a fresh port subscription (released before it
 * returns, so nothing is left warm) — never a value cached by the presenter,
 * so a write made behind the presenter's back is what the next read sees.
 * The same shape as `themePreference.cycle()`. */

/** No `host`: this presenter owns no stream, so nothing runs under the
 * Effect runtime — `current()` is a synchronous port read and `setVariant`
 * a synchronous port write. */
export function createBootPreferencePresenter(
  preferences: PreferencesPort,
): BootPreferencePresenter {
  return {
    current: () => {
      return peek(preferences.bootVariant$(), DEFAULT_BOOT_VARIANT);
    },
    setVariant: (variant: BootVariant) => {
      preferences.setBootVariant(variant);
    },
  };
}

export function createEqWatchlistSortPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): EqWatchlistSortPreferencePresenter {
  const sort = preferences.eqWatchlistSort$();

  return {
    sort$: mirrorPortAsIs(host, sort, DEFAULT_EQ_WATCHLIST_SORT),
    setSort: (next: EqWatchlistSort) => {
      preferences.setEqWatchlistSort(next);
    },
    /** Advance from the TRUE stored value (sym → chg → price → sym), so rapid
     * successive clicks each advance from the real state. */
    cycle: () => {
      preferences.setEqWatchlistSort(
        nextEqWatchlistSort(peek(sort, DEFAULT_EQ_WATCHLIST_SORT)),
      );
    },
  };
}
```

- [ ] **Step 6: Write the port-release test** — `preferenceStreams.test.ts`

The Effect version of Task 1 Step 4: same table, host-first factories, and release is asserted after the warm period's scope has closed (a `Stream.ensuring` finalizer runs on a fiber, so the port's unsubscribe lands after the caller's tick).

```ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { Stream } from "@rtc/core-api";
import { type PreferencesPort, PreferencesSimulator } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
import {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
} from "#/presenters/preferences";
import { createEqWatchlistSortPreferencePresenter } from "#/presenters/readPreferences";

/** A `PreferencesPort` stream method name — the `$`-suffixed members. */
type PortStreamName = Extract<keyof PreferencesPort, `${string}$`>;

interface StreamCase {
  port: PortStreamName;
  stream: (host: EffectHost, preferences: PreferencesPort) => Stream<unknown>;
}

const CASES: StreamCase[] = [
  {
    port: "creditRfqFilter$",
    stream: (h, p) => {
      return createCreditRfqFilterPreferencePresenter(h, p).filter$;
    },
  },
  {
    port: "eqBlotterView$",
    stream: (h, p) => {
      return createEqBlotterViewPreferencePresenter(h, p).view$;
    },
  },
  {
    port: "ambientStyle$",
    stream: (h, p) => {
      return createAmbientStylePresenter(h, p).style$;
    },
  },
  {
    port: "chartSubstrate$",
    stream: (h, p) => {
      return createChartSubstratePresenter(h, p).substrate$;
    },
  },
  {
    port: "layoutEngine$",
    stream: (h, p) => {
      return createLayoutEnginePresenter(h, p).engine$;
    },
  },
  {
    port: "animatedBackground$",
    stream: (h, p) => {
      return createAnimatedBackgroundPresenter(h, p).enabled$;
    },
  },
  {
    port: "forceBootAnimation$",
    stream: (h, p) => {
      return createForceBootAnimationPresenter(h, p).enabled$;
    },
  },
  {
    port: "loginWaitStyle$",
    stream: (h, p) => {
      return createLoginWaitPreferencesPresenter(h, p).style$;
    },
  },
  {
    port: "loginWaitDelay$",
    stream: (h, p) => {
      return createLoginWaitPreferencesPresenter(h, p).delay$;
    },
  },
  {
    port: "jarvisBrain$",
    stream: (h, p) => {
      return createJarvisPreferencesPresenter(h, p).brain$;
    },
  },
  {
    port: "jarvisEffort$",
    stream: (h, p) => {
      return createJarvisPreferencesPresenter(h, p).effort$;
    },
  },
  {
    port: "jarvisNarrator$",
    stream: (h, p) => {
      return createJarvisPreferencesPresenter(h, p).narrator$;
    },
  },
  {
    port: "eqWatchlistSort$",
    stream: (h, p) => {
      return createEqWatchlistSortPreferencePresenter(h, p).sort$;
    },
  },
];

describe("native preference streams (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it.each(CASES)(
    "$port is subscribed by the first consumer, replays synchronously, and is released once the warm period's scope has closed",
    async ({ port, stream }) => {
      const subject = new BehaviorSubject<unknown>("seed");
      const stream$ = stream(useHost(), createPortWithSubject(port, subject));
      // Construction calls the port method but subscribes nothing:
      // `fromObservable` is only called inside the fold's `run`.
      expect(subject.observed).toBe(false);
      const seen: unknown[] = [];
      const sub = stream$.subscribe((value) => {
        seen.push(value);
      });
      expect(seen).toEqual(["seed"]);
      // Warm in the SAME tick: the producer's `fromObservable` subscribed
      // the port eagerly, before `runFork` (the slice-1a finding).
      expect(subject.observed).toBe(true);
      sub.unsubscribe();
      await tick();
      await tick();
      expect(subject.observed).toBe(false);
    },
  );

  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host: EffectHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

/** A real simulator whose `<name>` stream method returns the CALLER's own
 * subject, so the test can read that subject's `observed` flag directly. A
 * Proxy rather than an object spread: TypeScript drops a class's methods
 * from a spread type, so `{ ...simulator, [name]: … }` would not satisfy
 * `PreferencesPort`; the proxy keeps every other method — and its `this` —
 * intact (the same shape as `themePreference.test.ts`). */
function createPortWithSubject(
  name: PortStreamName,
  subject: BehaviorSubject<unknown>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === name) {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
```

- [ ] **Step 7: Write the behind-the-back read test** — `readPreferences.test.ts`

`cycle()` and `current()` are synchronous port operations in both cores, so this file has no host timing in it; `createEqWatchlistSortPreferencePresenter` still needs a host to construct.

```ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import {
  type BootVariant,
  type EqWatchlistSort,
  type PreferencesPort,
  PreferencesSimulator,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";

describe("createEqWatchlistSortPreferencePresenter (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("cycle() advances from the value the PORT holds now, even one written behind the presenter's back", () => {
    const preferences = new PreferencesSimulator({ eqWatchlistSort: "chg" });
    const presenter = createEqWatchlistSortPreferencePresenter(
      useHost(),
      preferences,
    );
    const seen: EqWatchlistSort[] = [];
    const sub = preferences.eqWatchlistSort$().subscribe((sort) => {
      seen.push(sort);
    });
    // Not through the presenter: a presenter that cached its own last
    // `setSort` would advance from "chg" here and land on "price".
    preferences.setEqWatchlistSort("price");
    presenter.cycle();
    expect(seen).toEqual(["chg", "price", "sym"]);
    sub.unsubscribe();
  });

  it("cycle() leaves nothing warm on the port", () => {
    const subject = new BehaviorSubject<EqWatchlistSort>("sym");
    const presenter = createEqWatchlistSortPreferencePresenter(
      useHost(),
      createPortWithEqWatchlistSort(subject),
    );
    presenter.cycle();
    expect(subject.observed).toBe(false);
  });

  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host: EffectHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

describe("createBootPreferencePresenter (effect)", () => {
  it("current() reads the value the PORT holds now, even one written behind the presenter's back", () => {
    const preferences = new PreferencesSimulator({ bootVariant: "core" });
    const presenter = createBootPreferencePresenter(preferences);
    expect(presenter.current()).toBe("core");
    preferences.setBootVariant("laser");
    expect(presenter.current()).toBe("laser");
  });

  it("current() leaves nothing warm on the port", () => {
    const subject = new BehaviorSubject<BootVariant>("geo");
    const presenter = createBootPreferencePresenter(
      createPortWithBootVariant(subject),
    );
    expect(presenter.current()).toBe("geo");
    expect(subject.observed).toBe(false);
  });
});

/** A real simulator whose `eqWatchlistSort$` returns the CALLER's subject —
 * the Proxy shape `themePreference.test.ts` uses, for the same reason
 * (TypeScript drops a class's methods from an object spread). */
function createPortWithEqWatchlistSort(
  subject: BehaviorSubject<EqWatchlistSort>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === "eqWatchlistSort$") {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

function createPortWithBootVariant(
  subject: BehaviorSubject<BootVariant>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === "bootVariant$") {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
```

- [ ] **Step 8: Run the new test files**

Run: `pnpm --filter @rtc/client-core-effect exec vitest run src/presenters`
Expected: PASS (13 table rows + 4 read cases + the existing presenter tests). A table row red at `expect(subject.observed).toBe(false)` after the two ticks means a mirror's finalizer did not run — check that the factory passed the port stream into `mirrorPortAsIs` rather than building a `fromObservable` of its own outside `run`.

- [ ] **Step 9: Wire the overlay** — `composition.ts`

Replace the presenter imports and `nativePresenters` in `packages/client-core-effect/src/composition.ts`:

```ts
import type { EffectHost } from "#/bridge/out";
import { createCommands } from "#/commands";
import { createConnectionPresenter } from "#/presenters/connection";
import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
import {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";
import { createThemePreferencePresenter } from "#/presenters/themePreference";
```

```ts
/** Members this core implements natively — slice 1a: the connection fold,
 * the four theme/view/power-saver preferences, and `commands` (see
 * `createCommands`); slice 1b: the eleven remaining preference presenters.
 * Everything else still delegates to the RxJS core. `parity.json` is the
 * committed record of the same fact and `parity.test.ts` proves the two
 * agree by reference. Every native stream is a `sharedFold` over `host`, so
 * `app.dispose()` (which closes `host.scope`) ends whatever is still warm;
 * `bootPreference` owns no stream and takes no host. */
function nativePresenters(
  ports: AppPorts,
  host: EffectHost,
): Partial<Presenters> {
  const { preferences } = ports;
  return {
    connection: createConnectionPresenter(host, ports.connectionEvents),
    themePreference: createThemePreferencePresenter(
      host,
      preferences,
      ports.colorScheme,
    ),
    themeSkinPreference: createThemeSkinPreferencePresenter(host, preferences),
    viewModePreference: createViewModePreferencePresenter(host, preferences),
    powerSaver: createPowerSaverPresenter(host, preferences),
    creditRfqFilterPreference: createCreditRfqFilterPreferencePresenter(
      host,
      preferences,
    ),
    eqWatchlistSortPreference: createEqWatchlistSortPreferencePresenter(
      host,
      preferences,
    ),
    eqBlotterViewPreference: createEqBlotterViewPreferencePresenter(
      host,
      preferences,
    ),
    bootPreference: createBootPreferencePresenter(preferences),
    loginWaitPreferences: createLoginWaitPreferencesPresenter(
      host,
      preferences,
    ),
    jarvisPreferences: createJarvisPreferencesPresenter(host, preferences),
    animatedBackground: createAnimatedBackgroundPresenter(host, preferences),
    ambientStyle: createAmbientStylePresenter(host, preferences),
    chartSubstrate: createChartSubstratePresenter(host, preferences),
    layoutEngine: createLayoutEnginePresenter(host, preferences),
    forceBootAnimation: createForceBootAnimationPresenter(host, preferences),
  };
}
```

- [ ] **Step 10: Flip the manifest** — `parity.json`

In `packages/client-core-effect/src/parity.json`, change the same eleven `presenters` entries as Task 1 Step 9 from `"delegated"` to `"native"`: `animatedBackground`, `ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation`, `creditRfqFilterPreference`, `eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`, `loginWaitPreferences`, `jarvisPreferences`. `dockLayoutStore` stays `"delegated"`.

- [ ] **Step 11: Run the parity drift test and the contract runner**

```bash
pnpm --filter @rtc/core-contract build     # only if dist is missing/stale in this worktree
pnpm --filter @rtc/client-core-effect test
```

Expected: PASS. `parity.test.ts` "matches reality" is the check that Steps 9 and 10 agree; `coreContract.test.ts` runs the eleven suites against native members — 38 cases under the `effect` label green. If a suite's `follows setX` case is red with the default still alone in `values` after `settle()`, the mirror's `fromObservable` was not subscribed by the time the write happened — that is the slice-1a eager-subscribe rule; check that no `fromObservable` call was hoisted out of `mirrorPort`.

- [ ] **Step 12: Export from the index** — in `packages/client-core-effect/src/index.ts`, extend the `#/presenters/mirrorPort` export to `export { mirrorPort, mirrorPortAsIs } from "#/presenters/mirrorPort";`, extend the `#/presenters/preferences` export with the seven new names (same list as Task 1 Step 11), and add:

```ts
export {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
export {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";
```

- [ ] **Step 13: README** — in `packages/client-core-effect/README.md`, replace the paragraph beginning `As of slice 1a, six members are **native**` up to and including `for presenters, machines and commands alike.` with:

```
As of slice 1b, seventeen members are **native** — `connection`, every
preference presenter (`themePreference`, `themeSkinPreference`,
`viewModePreference`, `powerSaver`, `creditRfqFilterPreference`,
`eqWatchlistSortPreference`, `eqBlotterViewPreference`, `bootPreference`,
`loginWaitPreferences`, `jarvisPreferences`, `animatedBackground`,
`ambientStyle`, `chartSubstrate`, `layoutEngine`, `forceBootAnimation`) and
`commands.reconnect` — and everything else still **delegates** to
`@rtc/client-core` (the strangler seam): `composeWithBase` builds the RxJS
app, mints a `ManagedRuntime` and a `Scope`, and overlays what this core
implements. The native idiom for a replay-current stream is `sharedFold` (a
`SubscriptionRef` seeded synchronously on every first subscribe, driven by a
producer fiber in a per-warm-period child scope) — `Stream.share` cannot be
the envelope, since it replays to a new subscriber on a fiber rather than in
the caller's tick; `mirrorPort` / `mirrorPortAsIs` are the port-stream
special case (projected / unchanged), `Stream.zipLatest` combines two
inputs (`mode$`), and `peek` reads the stored value synchronously
(`cycle()`, `current()` — `src/presenters/readPreferences.ts`; a presenter
with no stream of its own, `bootPreference`, takes no host). The presenter
files group by API shape: `preferences.ts` (one stream plus setters,
including the two boolean toggles), `groupedPreferences.ts` (several
independent streams under one member), `readPreferences.ts`. One documented
difference from the RxJS core: a `SubscriptionRef` fold conflates
`Object.is`-equal consecutive states. `src/parity.json` records the split
and `src/parity.test.ts` proves manifest and reality agree by reference —
for presenters, machines and commands alike.
```

- [ ] **Step 14: Lint, typecheck, coverage**

```bash
pnpm exec biome ci packages/client-core-effect
pnpm --filter @rtc/client-core-effect typecheck
pnpm --filter @rtc/client-core-effect test:coverage
pnpm exec eslint packages/client-core-effect/src
```

Expected: all clean; coverage ≥95/95/95/85.

- [ ] **Step 15: Commit (by pathspec)**

```bash
git add packages/client-core-effect
git commit -m "feat(client-core-effect): the eleven slice-1b preference presenters native — mirrorPortAsIs mirrors, peek reads; parity 17/71

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH" -- packages/client-core-effect
```

---

### Task 3: Docs, status, and the slice gate (gauntlet + e2e matrix)

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`
- Modify: `docs/architecture/22-pluggable-application-core.md`
- Modify: `docs/adr/ADR-006-pluggable-application-core.md`
- Modify: `CLAUDE.md`
- Modify: `docs/STATUS.md`

**Interfaces:** none produced; consumes Tasks 1 and 2 (both committed, both packages green).

- [ ] **Step 1: Spec — narrow "completion" (ruling 1) and add the shipped line**

In `docs/superpowers/specs/2026-09-11-pluggable-application-core-design.md`, "The core-contract tier", the **Suites** bullet: replace

```
  Assertions are envelope-level only: values, ordering, completion, teardown
  on last unsubscribe, synchronous first value, same-key identity.
```

with

```
  Assertions are envelope-level only: values, ordering, teardown on last
  unsubscribe, synchronous first value, same-key identity. **Amended in
  slice 1b:** completion is NOT in the envelope — a presenter stream ends
  with the app (`dispose()`) or with an error, never by forwarding a port's
  completion; every port shipping today is `BehaviorSubject`-backed or
  app-lifetime and none completes outside teardown, so neither alternative
  core carries a completion channel (ruling 2026-09-19; a later member whose
  source legitimately ends would add one against a suite that asserts it).
```

In "Delivery", after the line `Slice 1a shipped 2026-09-18 (plan: …).` add:

```
Slice 1b shipped 2026-09-19 (plan: [`../plans/2026-09-19-pluggable-core-slice-1b.md`](../plans/2026-09-19-pluggable-core-slice-1b.md)) — no new primitive was needed; every preference presenter is now native in both alternative cores.
```

- [ ] **Step 2: §22 — "The parity manifest"**

In `docs/architecture/22-pluggable-application-core.md`, replace

```
`commands` — and the drift test walks all three. As of slice 1a both
alternative cores list six members `"native"` (`connection`, the four
theme/view/power-saver preferences, `commands.reconnect`) and everything else
`"delegated"`; the manifest says so explicitly rather than leaving it
implied.
```

with

```
`commands` — and the drift test walks all three. As of slice 1b both
alternative cores list seventeen members `"native"` (`connection`, all
fifteen preference presenters, `commands.reconnect`) and everything else
`"delegated"`; the manifest says so explicitly rather than leaving it
implied.
```

- [ ] **Step 3: ADR-006 — add a "Decided in slice 1b" block** after the last bullet of "Learned in slice 1a" (the `commands.reconnect` bullet) and before `## Follow-ups`:

```
**Decided in slice 1b** (2026-09-19):

- **Completion is not part of the presenter-stream envelope.** Neither
  alternative core has a completion channel (`Topic` has no `complete`;
  `sharedFold` never completes its subscribers), no port completes outside
  teardown, and no suite asserts completion — so rather than build a
  channel nobody observes, the spec's assertion list drops the word. A
  presenter stream ends with `dispose()` or with an error. A later member
  whose source legitimately ends adds the channel in its own slice, against
  a suite that asserts it.
- **The preference family needed no new primitive.** Eleven members went
  native on slice 1a's `topicFromObservable` / `mirrorPort` (+ a two-line
  identity sibling, `mirrorPortAsIs`) and `peek` — evidence that the
  1a/1b split landed the idiom in the right place. Per core the presenters
  now group by API shape (`preferences.ts`, `groupedPreferences.ts`,
  `readPreferences.ts`) rather than one file per member.
```

- [ ] **Step 4: `CLAUDE.md`** — three edits:
  - "Current Status" paragraph: replace `with slice 1a's six members (connection, the theme/skin/view-mode/power-saver preferences, `commands.reconnect`) native in both alternative cores` with `with seventeen members native in both alternative cores as of slice 1b (connection, every preference presenter, `commands.reconnect`)`.
  - Package table, `client-core-async` row: replace `Slice 1a: six members native, the rest delegate to @rtc/client-core;` with `Slice 1b: seventeen members native (connection, all fifteen preference presenters, commands.reconnect), the rest delegate to @rtc/client-core;`. `client-core-effect` row: replace `Slice 1a: six members native, the rest delegate to @rtc/client-core.` with `Slice 1b: seventeen members native, the rest delegate to @rtc/client-core.`
  - "Application core rule": replace `(six native as of slice 1a: `connection`, the theme/skin/view-mode/power-saver preferences, `commands.reconnect`)` with `(seventeen native as of slice 1b: `connection`, every preference presenter, `commands.reconnect`)`.

- [ ] **Step 5: `docs/STATUS.md`** — the pluggable-core entry:
  - Headline: replace `**slice 0 shipped (#717, 2026-09-13); slice 1a shipped (2026-09-18); next: slice 1b (the eleven remaining preferences)**` with `**slice 0 shipped (#717, 2026-09-13); slice 1a shipped (#764, 2026-09-19); slice 1b shipped (2026-09-19); next: slice 2 (FX pricing + blotter)**`.
  - Member sentence: replace everything from `— both alt cores port the eleven remaining preference presenters natively (` up to `; the port is what remains.` with `— both alt cores go native for `priceStream`, `priceHistory`, `currencyPairs`, `blotter`, `analytics`, `execution` and the machines `staleFlag`, `analyticsStaleFlag`, `rowHighlight`, `notional`, `tileExecution` (conflation, memoised per-key identity, the racing machine); their suites do not exist yet and must be green on RxJS first; Tag/Layer composition for the Effect core is due here (`priceStream` consumes `powerSaver.isCalm$`, the first native-on-native dependency), as is the `sharedFold` watcher latch.`
  - Plan links: after `· Plan (slice 1a): […]` append ` · Plan (slice 1b): [superpowers/plans/2026-09-19-pluggable-core-slice-1b.md](superpowers/plans/2026-09-19-pluggable-core-slice-1b.md)`.
  - Residual block title: `**Slice-0 and slice-1a residuals still open (deferred to slice 1b).**` → `**Slice-0, slice-1a and slice-1b residuals still open (deferred to slice 2).**`; the next line `Reviewed and accepted for slice 0; the slice-0 items are re-listed unchanged; the slice-1a ones follow:` → `Reviewed and accepted in their slices; re-listed unchanged where nothing moved:`.
  - DELETE the residual `neither alternative core has a completion channel: …` (decided — ruling 1).
  - DELETE the residual ``docs/STATUS.md`'s own lines ~60–64 … repair in a separate docs PR`` — and do the repair here, since this PR edits the entry anyway: the `auth.ts` bullet is currently split around the `selectCore.ts` bullet. Make it read, in this order:
    ```
      - `auth.ts` types `state$` as `Stream` while composition relies on
        replay-current; `StateStream` would express the warmth guarantee (slice 6) —
        `packages/core-api/src/presenters/auth.ts`
      - `selectCore.ts` (both clients) publishes the RAW `import.meta.env.VITE_CORE_IMPL` to `data-core-impl`; under vitest/jsdom (no `define`) that is `"undefined"` — publish the validated value instead; and `tests/browser/scenarios/login.ts` does not collapse an explicitly empty `RTC_CORE_IMPL=""` the way `devServer.ts` → vite's `|| "rxjs"` does
    ```
    (one bullet each, no blank line between them, the stray blank line removed).
  - REWORD the `peek` residual: replace `(a failing preferences or colour-scheme port would show up as a stray global error, not a located one)` with `(a failing preferences or colour-scheme port would show up as a stray global error, not a located one; three call sites since slice 1b — `themePreference.cycle()`, `eqWatchlistSortPreference.cycle()`, `bootPreference.current()`)`.
  - Keep every other residual verbatim. Bump `**Last updated:**` to `2026-09-19` (already that date if nothing else moved it; leave it).

- [ ] **Step 6: Doc links and formatting**

```bash
pnpm check:doc-links
pnpm exec biome ci .
```

Expected: both clean.

- [ ] **Step 7: The local CI mirror**

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @rtc/client-core-async test:coverage
pnpm --filter @rtc/client-core-effect test:coverage
pnpm check:deps
pnpm --filter @rtc/tests gates
pnpm check:core-bundle
pnpm core:parity
```

Expected: all green. `pnpm core:parity` prints `native: async 17/71, effect 17/71`. `check:core-bundle` still reports no foreign-core marker in the rxjs builds; note the three gzip sizes per client in the PR description (informational). A fresh build of the alternative cores' `dist` is a precondition of `check:core-bundle`; `pnpm build` above does it.

- [ ] **Step 8: The e2e matrix — the slice's exit criterion**

```bash
pnpm test:e2e:async
pnpm test:e2e:effect
```

Run each unpiped and read the summary block at the end of the log yourself — never `tail`/`grep` a Playwright run you are judging (the N-failed line sits above N-passed and pipes launder a non-zero exit). Expected: both green on both clients (78/78 each at slice 1a; the count may have moved with unrelated suites since). The login spec's `expectSelectedCoreImpl` assertion proves the right core booted; the layout spec drives the `layoutEngine` preference, which is now native under both legs. The `rxjs` leg has no code change in this slice and runs in CI.

- [ ] **Step 9: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs(pluggable-core): slice 1b receipts — parity 17/71, completion ruling, STATUS to slice 2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JdQtWNPjiNAEu7Ji9fejzH"
```

Then ship per the repo's shipping rules: push, open the PR (body includes the `pnpm core:parity` table and the gzip sizes), loop until CI is green (the `main` ruleset now requires all four jobs, including both `e2e (async core …)` / `e2e (effect core …)` legs), check CodeQL alerts, merge with `--merge`, confirm the merge commit is an ancestor of `origin/main`, clean up the worktree.

---

## Self-review

**Spec coverage (slice 1b row + "done when"):** suites exist and are green on RxJS — already true (PR #765), restated as a global constraint; both alternative cores native for the eleven — Tasks 1 and 2; e2e matrix green — Task 3 Step 8; `parity.json` updated — Tasks 1/2 Steps 9/10. Contract idiom preserved (no suite touched). Bridge rule — no new value import of `rxjs` outside `bridge/` (the tests that import `BehaviorSubject` are `.test.ts`, exempt). Coverage gates — Tasks 1/2 Steps 13/14. Documentation per the spec's "Documentation" section — Task 3. The spec's "completion" word — ruling 1, Task 3 Step 1.

**Placeholder scan:** no TBD/TODO; every code step carries the code. Task 2 Steps 6–7 repeat Task 1's test bodies with the host plumbing added rather than pointing at Task 1, so either task reads alone. Task 2 Step 12's "same list as Task 1 Step 11" names seven identifiers that are spelled out in Task 2 Step 3's own code, so the implementer has them on the page.

**Type consistency:** `topicFromObservable(source): Topic<T>` → `topicToStream(topic): Stream<T>` ✓ (Task 1 every stream). `peek(source, fallback)` with `DEFAULT_BOOT_VARIANT: BootVariant` / `DEFAULT_EQ_WATCHLIST_SORT: EqWatchlistSort` ✓. `mirrorPortAsIs(host, source, fallback): CoreStream<T>` — `source` is the port Observable (a `CoreStream<T>` alias), `fallback` the matching `DEFAULT_*` ✓ (Task 2 every stream). `nextEqWatchlistSort(current: EqWatchlistSort): EqWatchlistSort` ✓. Async factories `(preferences)`; Effect factories `(host, preferences)` except `createBootPreferencePresenter(preferences)` — the composition code in each task matches its own signatures ✓; `preferenceStreams.test.ts` tables call `(p)` in Task 1 and `(h, p)` in Task 2 ✓. `PortStreamName = Extract<keyof PreferencesPort, \`${string}$\`>` names exactly the `$`-suffixed port methods, and every `port:` value in both tables is one of them ✓. `parity.json` keys are the `Presenters` member names (`creditRfqFilterPreference`, not `creditRfqFilter`) ✓ — the drift test's "lists every contract member exactly once" would catch a typo. `PreferencesSimulator` seed keys used in tests (`eqWatchlistSort`, `bootVariant`) exist on `PreferencesSeed` ✓.
