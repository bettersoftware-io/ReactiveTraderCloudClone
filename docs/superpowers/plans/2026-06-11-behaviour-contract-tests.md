# Behaviour/Contract Test Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a jsdom + React Testing Library "behaviour" test tier for `@rtc/client` UI components — sociable contract tests with explicit behavioural assertions, including dynamic re-render tests — whose specs and page objects are framework-neutral and survive a future React→SolidJS/Vue/Svelte swap by changing only a small `react/` trio.

**Architecture:** Three layers. (1) **Neutral specs** under `tests/behaviour/specs/` mirror `src/ui/` and import only `@behaviour/mount`, `@behaviour/components` (tokens), and domain types. (2) **Neutral harness + page objects** under `tests/behaviour/shared/`: a `World` of RxJS `BehaviorSubject`s (one per hook + one for props) that the test pushes to; page objects query raw DOM via `@testing-library/dom` and drive updates via `setProps`/`emit`. (3) A **framework driver** under `tests/behaviour/react/` (`registry.tsx` + `hooksFromWorld.ts` + `render.tsx` + `setup.ts`) is the only swap surface; it turns the neutral World into reactive `AppHooks` via `useSyncExternalStore`. A `setDriver()/getDriver()` seam connects them; the vitest `setupFiles` entry selects the driver.

**Tech Stack:** Vitest 4 (jsdom env), `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@vitejs/plugin-react`, RxJS `BehaviorSubject` (controllable sources), React `useSyncExternalStore`, `@rtc/domain` types.

---

## Design vocabulary (read first)

- **Token** — a neutral handle for a component, exported from `@behaviour/components`
  (e.g. `PnlValue`). Carries the component's prop type `P` and a `makePage`
  factory. The spec names the token; the React `registry` maps the token to a
  React element. Identity-keyed (a `Map`), no string keys.
- **World** — neutral controllable state: a `BehaviorSubject` per hook value, a
  command results bag, and a command log. `mount` builds one per test.
- **Channels** — `mount(Token, { props, hooks, commands })`. `props` = real props
  (incl. callbacks); `hooks` = initial values keyed by hook name; `commands` =
  canned command results.
- **Page object** — extends `MountedComponent<P>`; exposes query methods
  (DOM via `@testing-library/dom`), action methods (`user-event`), update drivers
  (`setProps`, `emit`), and command-log accessors (`createdRfq()`).

---

## File structure

**Create — neutral harness (`tests/behaviour/shared/`), never changes on swap:**
- `harness/world.ts` — `HookValues`, `createWorld()`, `CommandResults`, `CommandLog`, `World`.
- `harness/component.ts` — `ComponentToken`, `PageContext`, `MountedComponent` base, `component()` factory.
- `harness/activeDriver.ts` — `BehaviourDriver` interface + `setDriver`/`getDriver`.
- `mount.ts` — typed `mount(token, opts)` + `cleanupMounted()`.
- `components.ts` — the neutral tokens.
- `pages/fx/analytics/PnlValuePage.ts`, `pages/shell/connection/ConnectionStatusBarPage.ts`, `pages/fx/blotter/FxBlotterPage.ts`, `pages/credit/newRfq/NewRfqFormPage.ts`.

**Create — framework driver (`tests/behaviour/react/`), the only swap surface:**
- `registry.tsx` — `Map<token, (props) => ReactElement>`.
- `hooksFromWorld.ts` — `reactHooks(world): AppHooks` via `useSyncExternalStore`.
- `render.tsx` — `reactDriver` (providers + `PropsHost`).
- `setup.ts` — `setDriver(reactDriver)` + `afterEach(cleanupMounted)`.

**Create — specs (neutral; mirror `src/ui/` + PascalCase):**
- `specs/fx/analytics/PnlValue.behaviour.spec.ts`
- `specs/shell/connection/ConnectionStatusBar.behaviour.spec.ts`
- `specs/fx/blotter/FxBlotter.behaviour.spec.ts`
- `specs/credit/newRfq/NewRfqForm.behaviour.spec.ts`

**Create — config + docs:** `tests/behaviour/vitest.config.ts`, `tests/behaviour/README.md`.

**Modify:** `packages/client/package.json` (deps + script), `tsconfig.json` (alias), `vitest.config.ts` (default-run wiring).

---

## Task 1: Dependencies and editor path alias

**Files:** Modify `packages/client/package.json`, `packages/client/tsconfig.json`.

- [ ] **Step 1: Add the testing-library dev dependencies**

Run (from repo root):
```bash
pnpm --filter @rtc/client add -D @testing-library/react @testing-library/dom @testing-library/user-event
```
Expected: versions written to `devDependencies` (e.g. `@testing-library/react ^16.x`, `/dom ^10.x`, `/user-event ^14.x`); lockfile updates; no React-19 peer errors.

- [ ] **Step 2: Add the `@behaviour/*` path to the client tsconfig (editor DX only)**

Edit `packages/client/tsconfig.json` — add `paths` inside `compilerOptions` (after `lib`):

```json
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "@behaviour/*": ["tests/behaviour/shared/*"]
    }
```

`include` stays `["src"]`, so `pnpm typecheck` scope is unchanged (tests are not type-checked by the build, matching visual-diff). The alias is resolved at runtime by vitest (Task 2); this `paths` entry only feeds the editor.

- [ ] **Step 3: Verify install is clean**

Run: `pnpm --filter @rtc/client exec vitest run 2>&1 | tail -5`
Expected: the existing unit suite still passes.

- [ ] **Step 4: Commit**

```bash
git add packages/client/package.json packages/client/tsconfig.json pnpm-lock.yaml
git commit -m "build(client): add testing-library deps for behaviour test tier"
```

---

## Task 2: Reactive harness vertical slice — PnlValue (static + setProps)

Builds the whole neutral harness + React driver, proven by PnlValue: a pure-prop leaf that exercises the props channel and `setProps` re-render.

**Files:** all `shared/harness/*`, `shared/mount.ts`, `shared/components.ts` (PnlValue token), `shared/pages/fx/analytics/PnlValuePage.ts`, all `react/*` (PnlValue entry), `tests/behaviour/vitest.config.ts`; test `specs/fx/analytics/PnlValue.behaviour.spec.ts`; modify `package.json`.

- [ ] **Step 1: Write the failing spec**

Create `packages/client/tests/behaviour/specs/fx/analytics/PnlValue.behaviour.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@behaviour/mount";
import { PnlValue } from "@behaviour/components";

describe("PnlValue", () => {
  it("shows a positive value with a + sign", () => {
    expect(mount(PnlValue, { props: { value: 500 } }).text()).toBe("+500");
  });

  it("shows a negative value with a - sign", () => {
    expect(mount(PnlValue, { props: { value: -500 } }).text()).toBe("-500");
  });

  it("treats zero as positive", () => {
    expect(mount(PnlValue, { props: { value: 0 } }).text()).toBe("+0");
  });

  it("abbreviates thousands with one decimal and a k suffix", () => {
    expect(mount(PnlValue, { props: { value: 12_500 } }).text()).toBe("+12.5k");
    expect(mount(PnlValue, { props: { value: -2_500 } }).text()).toBe("-2.5k");
  });

  it("abbreviates millions with two decimals and an m suffix", () => {
    expect(mount(PnlValue, { props: { value: 1_500_000 } }).text()).toBe("+1.50m");
  });

  it("re-renders when its value prop changes", () => {
    const pnl = mount(PnlValue, { props: { value: 100 } });
    expect(pnl.text()).toBe("+100");
    pnl.setProps({ value: 12_500 });
    expect(pnl.text()).toBe("+12.5k");
  });
});
```

- [ ] **Step 2: Create the World**

Create `packages/client/tests/behaviour/shared/harness/world.ts`:

```ts
import { BehaviorSubject } from "rxjs";
import {
  ConnectionStatus,
  type Trade,
  type Instrument,
  type Dealer,
  type Rfq,
  type Quote,
  type CurrencyPair,
  type PositionUpdates,
  type CreateRfqInput,
} from "@rtc/domain";

/** The value each NULLARY query hook yields. Parametric hooks (usePrice etc.)
 *  are returned as static empties by the adapter and are not in this map. */
export interface HookValues {
  useConnectionStatus: ConnectionStatus;
  useTrades: readonly Trade[];
  useAnalytics: PositionUpdates | null;
  useRfqs: readonly Rfq[];
  useAllQuotes: ReadonlyMap<number, Quote>;
  useCurrencyPairs: readonly CurrencyPair[];
  useInstruments: readonly Instrument[];
  useDealers: readonly Dealer[];
}

const DEFAULTS: HookValues = {
  useConnectionStatus: ConnectionStatus.CONNECTED,
  useTrades: [],
  useAnalytics: null,
  useRfqs: [],
  useAllQuotes: new Map(),
  useCurrencyPairs: [],
  useInstruments: [],
  useDealers: [],
};

/** Canned results emitted by command hooks. */
export interface CommandResults {
  createRfq?: number;
}

/** Inputs captured from command hooks during a test. */
export interface CommandLog {
  createRfq: CreateRfqInput[];
}

export interface World {
  readonly sources: { [K in keyof HookValues]: BehaviorSubject<HookValues[K]> };
  readonly results: CommandResults;
  readonly commands: CommandLog;
  /** Push new values for one or more hooks (drives re-renders). */
  push(patch: Partial<HookValues>): void;
}

export function createWorld(
  initial: Partial<HookValues> = {},
  results: CommandResults = {},
): World {
  const merged: HookValues = { ...DEFAULTS, ...initial };
  const sources = {} as { [K in keyof HookValues]: BehaviorSubject<HookValues[K]> };
  for (const key of Object.keys(merged) as (keyof HookValues)[]) {
    // Each subject is typed by its own key; the cast bridges the per-key union.
    (sources[key] as BehaviorSubject<unknown>) = new BehaviorSubject<unknown>(merged[key]);
  }
  return {
    sources,
    results,
    commands: { createRfq: [] },
    push(patch) {
      for (const key of Object.keys(patch) as (keyof HookValues)[]) {
        (sources[key] as BehaviorSubject<unknown>).next(patch[key]);
      }
    },
  };
}
```

- [ ] **Step 3: Create the component/token/page base**

Create `packages/client/tests/behaviour/shared/harness/component.ts`:

```ts
import type { HookValues, CommandLog } from "./world";

/** Everything a page object needs: the rendered root + update drivers + command log. */
export interface PageContext<P> {
  readonly root: HTMLElement;
  setProps(next: Partial<P>): void;
  emit(patch: Partial<HookValues>): void;
  readonly commands: CommandLog;
}

/** Base class for all page objects. Provides the neutral update drivers. */
export abstract class MountedComponent<P> {
  protected readonly root: HTMLElement;
  private readonly ctx: PageContext<P>;

  constructor(ctx: PageContext<P>) {
    this.root = ctx.root;
    this.ctx = ctx;
  }

  /** Push new props → re-render the same instance. */
  setProps(next: Partial<P>): void {
    this.ctx.setProps(next);
  }

  /** Push new hook data → re-render the same instance. */
  emit(patch: Partial<HookValues>): void {
    this.ctx.emit(patch);
  }

  /** Inputs recorded by the faked command hooks (unit-mode convenience). */
  protected commandLog(): CommandLog {
    return this.ctx.commands;
  }
}

/** Neutral handle for a component: carries its prop type and a page factory. */
export interface ComponentToken<P, Page extends MountedComponent<P>> {
  readonly makePage: (ctx: PageContext<P>) => Page;
}

export function component<P, Page extends MountedComponent<P>>(
  makePage: (ctx: PageContext<P>) => Page,
): ComponentToken<P, Page> {
  return { makePage };
}
```

- [ ] **Step 4: Create the driver seam**

Create `packages/client/tests/behaviour/shared/harness/activeDriver.ts`:

```ts
import type { BehaviorSubject } from "rxjs";
import type { World } from "./world";
import type { ComponentToken, MountedComponent } from "./component";

export interface RenderInputs<P> {
  /** Reactive props source; the driver renders the component from its latest value. */
  readonly propsSubject: BehaviorSubject<Partial<P>>;
  /** The controllable hook world; the driver turns it into reactive AppHooks. */
  readonly world: World;
}

export interface MountedRoot {
  readonly root: HTMLElement;
  readonly unmount: () => void;
}

/** A framework adapter that knows how to render a token into the DOM. */
export interface BehaviourDriver {
  render<P, Page extends MountedComponent<P>>(
    token: ComponentToken<P, Page>,
    inputs: RenderInputs<P>,
  ): MountedRoot;
}

let active: BehaviourDriver | null = null;

export function setDriver(driver: BehaviourDriver): void {
  active = driver;
}

export function getDriver(): BehaviourDriver {
  if (!active) {
    throw new Error(
      "No behaviour-test driver registered. Ensure the tier's setupFiles entry " +
        "(tests/behaviour/react/setup.ts) ran before the spec.",
    );
  }
  return active;
}
```

- [ ] **Step 5: Create the typed mount + cleanup**

Create `packages/client/tests/behaviour/shared/mount.ts`:

```ts
import { BehaviorSubject } from "rxjs";
import { createWorld, type HookValues, type CommandResults } from "./harness/world";
import {
  getDriver,
  type MountedRoot,
} from "./harness/activeDriver";
import type {
  ComponentToken,
  MountedComponent,
  PageContext,
} from "./harness/component";

export interface MountOptions<P> {
  props?: P;
  hooks?: Partial<HookValues>;
  commands?: CommandResults;
}

const mounted: MountedRoot[] = [];

export function mount<P, Page extends MountedComponent<P>>(
  token: ComponentToken<P, Page>,
  opts: MountOptions<P> = {},
): Page {
  const world = createWorld(opts.hooks, opts.commands);
  const propsSubject = new BehaviorSubject<Partial<P>>(opts.props ?? {});
  const rendered = getDriver().render(token, { propsSubject, world });
  mounted.push(rendered);

  const ctx: PageContext<P> = {
    root: rendered.root,
    setProps: (next) =>
      propsSubject.next({ ...propsSubject.getValue(), ...next }),
    emit: (patch) => world.push(patch),
    commands: world.commands,
  };
  return token.makePage(ctx);
}

/** Unmount everything mounted since the last cleanup (call in afterEach). */
export function cleanupMounted(): void {
  while (mounted.length > 0) mounted.pop()!.unmount();
}
```

- [ ] **Step 6: Create the PnlValue page object**

Create `packages/client/tests/behaviour/shared/pages/fx/analytics/PnlValuePage.ts`:

```ts
import { MountedComponent } from "../../../harness/component";

export interface PnlValueProps {
  value: number;
}

/** Page object for the PnlValue leaf. */
export class PnlValuePage extends MountedComponent<PnlValueProps> {
  /** The formatted P&L text the user sees, e.g. "+12.5k". */
  text(): string {
    return this.root.textContent?.trim() ?? "";
  }
}
```

- [ ] **Step 7: Create the tokens module (PnlValue only for now)**

Create `packages/client/tests/behaviour/shared/components.ts`:

```ts
import { component } from "./harness/component";
import { PnlValuePage, type PnlValueProps } from "./pages/fx/analytics/PnlValuePage";

export const PnlValue = component<PnlValueProps, PnlValuePage>(
  (ctx) => new PnlValuePage(ctx),
);
```

- [ ] **Step 8: Create the React hook adapter**

Create `packages/client/tests/behaviour/react/hooksFromWorld.ts`:

```ts
import { useSyncExternalStore } from "react";
import { EMPTY, of, type Observable } from "rxjs";
import type { BehaviorSubject } from "rxjs";
import type {
  ExecuteTradeResult,
  RfqQuoteResult,
} from "@rtc/domain";
import type { AppHooks } from "../../../src/ui/hooks/createAppHooks";
import type { World } from "../shared/harness/world";

/** Subscribe a React component to a BehaviorSubject; re-render on each emission. */
function useSubject<T>(subject: BehaviorSubject<T>): T {
  return useSyncExternalStore(
    (onChange) => {
      const sub = subject.subscribe(onChange);
      return () => sub.unsubscribe();
    },
    () => subject.getValue(),
  );
}

/** Build a reactive AppHooks backed by the neutral World. */
export function reactHooks(world: World): AppHooks {
  const s = world.sources;
  return {
    // Parametric query hooks are not exercised by the current slice.
    usePrice: () => null,
    usePriceHistory: () => [],
    useQuotesForRfq: () => [],
    // Nullary query hooks: reactive, re-render on push.
    useTrades: () => useSubject(s.useTrades),
    useAnalytics: () => useSubject(s.useAnalytics),
    useRfqs: () => useSubject(s.useRfqs),
    useAllQuotes: () => useSubject(s.useAllQuotes),
    useCurrencyPairs: () => useSubject(s.useCurrencyPairs),
    useInstruments: () => useSubject(s.useInstruments),
    useDealers: () => useSubject(s.useDealers),
    useConnectionStatus: () => useSubject(s.useConnectionStatus),
    // Commands: record input, emit canned result.
    useExecuteTrade: () => () => EMPTY as Observable<ExecuteTradeResult>,
    useCreateRfq: () => (input) => {
      world.commands.createRfq.push(input);
      return of(world.results.createRfq ?? 0);
    },
    useAcceptQuote: () => () => EMPTY as Observable<void>,
    useCancelRfq: () => () => EMPTY as Observable<void>,
    usePassQuote: () => () => EMPTY as Observable<void>,
    useQuoteRfq: () => () => EMPTY as Observable<void>,
    useRequestRfqQuote: () => () => EMPTY as Observable<RfqQuoteResult>,
  };
}
```

- [ ] **Step 9: Create the React registry (PnlValue entry)**

Create `packages/client/tests/behaviour/react/registry.tsx`:

```tsx
import type { ReactElement } from "react";
import type { ComponentToken, MountedComponent } from "../shared/harness/component";
import { PnlValue } from "../shared/components";
import { PnlValue as PnlValueComponent } from "../../../src/ui/fx/analytics/PnlValue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToken = ComponentToken<any, MountedComponent<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ElementFor = (props: Record<string, any>) => ReactElement;

/** token → React element factory. Identity-keyed; no string keys. */
export const registry = new Map<AnyToken, ElementFor>([
  [PnlValue, (p) => <PnlValueComponent value={p.value as number} />],
]);
```

- [ ] **Step 10: Create the React render driver**

Create `packages/client/tests/behaviour/react/render.tsx`:

```tsx
import { render as rtlRender } from "@testing-library/react";
import { useSyncExternalStore, type ReactElement } from "react";
import type { BehaviorSubject } from "rxjs";
import { ThemeProvider } from "../../../src/ui/shell/theme/ThemeProvider";
import { HooksProvider } from "../../../src/ui/hooks/HooksProvider";
import type { BehaviourDriver } from "../shared/harness/activeDriver";
import { reactHooks } from "./hooksFromWorld";
import { registry } from "./registry";

/** Renders the component from the latest props on the subject; re-renders on push. */
function PropsHost<P>({
  subject,
  build,
}: {
  subject: BehaviorSubject<Partial<P>>;
  build: (props: Partial<P>) => ReactElement;
}) {
  const props = useSyncExternalStore(
    (onChange) => {
      const sub = subject.subscribe(onChange);
      return () => sub.unsubscribe();
    },
    () => subject.getValue(),
  );
  return build(props);
}

export const reactDriver: BehaviourDriver = {
  render(token, { propsSubject, world }) {
    const build = registry.get(token);
    if (!build) throw new Error("No React registry entry for the given token.");
    const hooks = reactHooks(world);
    const { container, unmount } = rtlRender(
      <ThemeProvider>
        <HooksProvider hooks={hooks}>
          <PropsHost subject={propsSubject} build={build} />
        </HooksProvider>
      </ThemeProvider>,
    );
    return { root: container, unmount };
  },
};
```

- [ ] **Step 11: Create the React setup file**

Create `packages/client/tests/behaviour/react/setup.ts`:

```ts
import { afterEach } from "vitest";
import { setDriver } from "../shared/harness/activeDriver";
import { cleanupMounted } from "../shared/mount";
import { reactDriver } from "./render";

setDriver(reactDriver);
afterEach(() => cleanupMounted());
```

- [ ] **Step 12: Create the focused behaviour vitest config**

Create `packages/client/tests/behaviour/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@behaviour": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    // Pin root to the package dir (two levels up) so include/setup/report paths
    // are stable regardless of invocation cwd — mirrors the visual-diff configs.
    root: fileURLToPath(new URL("../..", import.meta.url)),
    environment: "jsdom",
    include: ["tests/behaviour/specs/**/*.behaviour.spec.ts"],
    setupFiles: ["./tests/behaviour/react/setup.ts"],
    passWithNoTests: false,
    reporters: ["default", "html"],
    outputFile: { html: "reports/behaviour/report/index.html" },
  },
});
```

- [ ] **Step 13: Add the `test:behaviour` script**

Edit `packages/client/package.json` `scripts` — add after the `test` line:

```json
    "test:behaviour": "vitest run -c tests/behaviour/vitest.config.ts",
```

- [ ] **Step 14: Run the spec to verify it passes**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 1 file, 6 tests (PnlValue, incl. the `setProps` re-render). The expected strings derive from `PnlValue.formatPnl`; if the `setProps` test fails but the statics pass, the `PropsHost`/`useSyncExternalStore` wiring is the suspect.

- [ ] **Step 15: Commit**

```bash
git add packages/client/tests/behaviour packages/client/package.json
git commit -m "test(client): reactive behaviour harness + PnlValue contract specs"
```

---

## Task 3: ConnectionStatusBar (static + emit)

Hook-connected display. Proves the `hooks` channel + `emit`-driven re-render.

**Files:** create `shared/pages/shell/connection/ConnectionStatusBarPage.ts`; modify `shared/components.ts`, `react/registry.tsx`; test `specs/shell/connection/ConnectionStatusBar.behaviour.spec.ts`.

- [ ] **Step 1: Write the failing spec**

Create `packages/client/tests/behaviour/specs/shell/connection/ConnectionStatusBar.behaviour.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@behaviour/mount";
import { ConnectionStatusBar } from "@behaviour/components";
import { ConnectionStatus } from "@rtc/domain";

describe("ConnectionStatusBar", () => {
  it("labels a connecting session", () => {
    expect(
      mount(ConnectionStatusBar, { hooks: { useConnectionStatus: ConnectionStatus.CONNECTING } })
        .statusText(),
    ).toBe("Connecting...");
  });

  it("labels a connected session", () => {
    expect(
      mount(ConnectionStatusBar, { hooks: { useConnectionStatus: ConnectionStatus.CONNECTED } })
        .statusText(),
    ).toBe("Connected");
  });

  it("labels a disconnected session", () => {
    expect(
      mount(ConnectionStatusBar, { hooks: { useConnectionStatus: ConnectionStatus.DISCONNECTED } })
        .statusText(),
    ).toBe("Disconnected");
  });

  it("labels an idle session", () => {
    expect(
      mount(ConnectionStatusBar, { hooks: { useConnectionStatus: ConnectionStatus.IDLE_DISCONNECTED } })
        .statusText(),
    ).toBe("Idle");
  });

  it("labels an offline session", () => {
    expect(
      mount(ConnectionStatusBar, { hooks: { useConnectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED } })
        .statusText(),
    ).toBe("Offline");
  });

  it("reflects a live connection drop", () => {
    const bar = mount(ConnectionStatusBar, {
      hooks: { useConnectionStatus: ConnectionStatus.CONNECTED },
    });
    expect(bar.statusText()).toBe("Connected");
    bar.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    expect(bar.statusText()).toBe("Disconnected");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: FAIL — `ConnectionStatusBar` is not exported from `@behaviour/components` (TypeScript/import error).

- [ ] **Step 3: Create the page object**

Create `packages/client/tests/behaviour/shared/pages/shell/connection/ConnectionStatusBarPage.ts`:

```ts
import { within } from "@testing-library/dom";
import { MountedComponent } from "../../../harness/component";

export class ConnectionStatusBarPage extends MountedComponent<Record<string, never>> {
  /** The human-readable connection status label, e.g. "Connected". */
  statusText(): string {
    return (
      within(this.root).getByTestId("connection-status").textContent?.trim() ?? ""
    );
  }
}
```

- [ ] **Step 4: Add the token**

Edit `packages/client/tests/behaviour/shared/components.ts` — add:

```ts
import { ConnectionStatusBarPage } from "./pages/shell/connection/ConnectionStatusBarPage";

export const ConnectionStatusBar = component<Record<string, never>, ConnectionStatusBarPage>(
  (ctx) => new ConnectionStatusBarPage(ctx),
);
```

- [ ] **Step 5: Add the registry entry**

Edit `packages/client/tests/behaviour/react/registry.tsx`:
- Add imports:
  ```tsx
  import { ConnectionStatusBar } from "../shared/components";
  import { ConnectionStatusBar as ConnectionStatusBarComponent } from "../../../src/ui/shell/connection/ConnectionStatusBar";
  ```
- Add a `Map` entry: `[ConnectionStatusBar, () => <ConnectionStatusBarComponent />],`

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 2 files, 12 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/client/tests/behaviour
git commit -m "test(client): ConnectionStatusBar behaviour specs (incl. live update)"
```

---

## Task 4: FxBlotter (static list + streamed-trade emit)

Sociable list/table (real BlotterHeader/BlotterRow/QuickFilter). Proves collection queries, empty state, and `emit`-driven append on the same instance.

**Files:** create `shared/pages/fx/blotter/FxBlotterPage.ts`; modify `shared/components.ts`, `react/registry.tsx`; test `specs/fx/blotter/FxBlotter.behaviour.spec.ts`.

- [ ] **Step 1: Write the failing spec**

Create `packages/client/tests/behaviour/specs/fx/blotter/FxBlotter.behaviour.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Direction, TradeStatus, type Trade } from "@rtc/domain";
import { mount } from "@behaviour/mount";
import { FxBlotter } from "@behaviour/components";

const trade = (tradeId: number, over: Partial<Trade> = {}): Trade => ({
  tradeId,
  tradeName: `Trade ${tradeId}`,
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.09221,
  status: TradeStatus.Done,
  tradeDate: "2026-06-06",
  valueDate: "2026-06-08",
  ...over,
});

const t1 = trade(4001, { currencyPair: "EURUSD" });
const t2 = trade(4002, { currencyPair: "USDJPY", notional: 5_000_000, status: TradeStatus.Rejected });

describe("FxBlotter", () => {
  it("renders one row per trade", () => {
    expect(mount(FxBlotter, { hooks: { useTrades: [t1, t2] } }).tradeRowCount()).toBe(2);
  });

  it("shows each trade's key cells, including rejected trades", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
    expect(blotter.hasCell("EURUSD")).toBe(true);
    expect(blotter.hasCell("USDJPY")).toBe(true);
    expect(blotter.hasCell("5,000,000")).toBe(true);
    expect(blotter.hasCell("Rejected")).toBe(true);
  });

  it("exposes the trade columns", () => {
    const headers = mount(FxBlotter, { hooks: { useTrades: [t1] } }).columnHeaders();
    expect(headers.some((h) => h.includes("Trade ID"))).toBe(true);
    expect(headers.some((h) => h.includes("Status"))).toBe(true);
  });

  it("shows an empty-state message when there are no trades", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [] } });
    expect(blotter.tradeRowCount()).toBe(0);
    expect(blotter.emptyMessage()).toMatch(/no trades yet/i);
  });

  it("appends a newly streamed trade to the same blotter", () => {
    const blotter = mount(FxBlotter, { hooks: { useTrades: [t1, t2] } });
    expect(blotter.tradeRowCount()).toBe(2);
    blotter.emit({ useTrades: [t1, t2, trade(4003, { currencyPair: "GBPUSD" })] });
    expect(blotter.tradeRowCount()).toBe(3);
    expect(blotter.hasCell("GBPUSD")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: FAIL — `FxBlotter` is not exported from `@behaviour/components`.

- [ ] **Step 3: Create the page object**

Create `packages/client/tests/behaviour/shared/pages/fx/blotter/FxBlotterPage.ts`:

```ts
import { within } from "@testing-library/dom";
import { MountedComponent } from "../../../harness/component";

export class FxBlotterPage extends MountedComponent<Record<string, never>> {
  private table(): HTMLElement {
    return within(this.root).getByTestId("blotter-table");
  }

  /** Number of trade rows shown (0 when the empty-state row is showing). */
  tradeRowCount(): number {
    if (this.emptyMessage() !== null) return 0;
    return this.table().querySelectorAll("tbody tr").length;
  }

  /** The empty-state message, or null when trades are present. */
  emptyMessage(): string | null {
    const el = within(this.root).queryByText(/no trades/i);
    return el?.textContent?.trim() ?? null;
  }

  /** True when a body cell with the given exact text is present. */
  hasCell(text: string): boolean {
    const tbody = this.table().querySelector("tbody");
    if (!tbody) return false;
    return within(tbody as HTMLElement).queryByText(text) !== null;
  }

  /** Column header labels, in order. */
  columnHeaders(): string[] {
    return within(this.table())
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim() ?? "");
  }
}
```

- [ ] **Step 4: Add the token**

Edit `packages/client/tests/behaviour/shared/components.ts` — add:

```ts
import { FxBlotterPage } from "./pages/fx/blotter/FxBlotterPage";

export const FxBlotter = component<Record<string, never>, FxBlotterPage>(
  (ctx) => new FxBlotterPage(ctx),
);
```

- [ ] **Step 5: Add the registry entry**

Edit `packages/client/tests/behaviour/react/registry.tsx`:
- Add imports:
  ```tsx
  import { FxBlotter } from "../shared/components";
  import { FxBlotter as FxBlotterComponent } from "../../../src/ui/fx/blotter/FxBlotter";
  ```
- Add a `Map` entry: `[FxBlotter, () => <FxBlotterComponent />],`

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 3 files, 17 tests. If `columnHeaders().some(... "Trade ID")` fails, check `src/ui/fx/blotter/BlotterHeader.tsx` for the actual header text; the `.includes` match tolerates sort/filter chrome in the `<th>`.

- [ ] **Step 7: Commit**

```bash
git add packages/client/tests/behaviour
git commit -m "test(client): FxBlotter behaviour specs (incl. streamed trade)"
```

---

## Task 5: NewRfqForm (sociable interaction + command spy)

Real InstrumentSearch/DealerSelection/QuantityInput children; only `useCreateRfq` faked. Proves user-event actions, the command recorder, validation, and async confirmation. Reuses the credit fixture for instruments/dealers.

**Files:** create `shared/pages/credit/newRfq/NewRfqFormPage.ts`; modify `shared/components.ts`, `react/registry.tsx`; test `specs/credit/newRfq/NewRfqForm.behaviour.spec.ts`.

- [ ] **Step 1: Write the failing spec**

Create `packages/client/tests/behaviour/specs/credit/newRfq/NewRfqForm.behaviour.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Direction, type Instrument, type Dealer, ADAPTIVE_BANK_NAME } from "@rtc/domain";
import { mount } from "@behaviour/mount";
import { NewRfqForm } from "@behaviour/components";

const instruments: readonly Instrument[] = [
  { id: 1, name: "US Treasury 10Y", cusip: "912828ZQ6", ticker: "T 1.5 02/34", maturity: "2034-02-15", interestRate: 1.5, benchmark: "10Y" },
  { id: 2, name: "Apple Inc 2030", cusip: "037833EK8", ticker: "AAPL 2.4 30", maturity: "2030-05-11", interestRate: 2.4, benchmark: "7Y" },
];
const dealers: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
];

const ready = () =>
  mount(NewRfqForm, {
    props: { onCreated: () => {} },
    hooks: { useInstruments: instruments, useDealers: dealers },
    commands: { createRfq: 555 },
  });

describe("NewRfqForm", () => {
  it("keeps submit disabled until an instrument and quantity are provided", async () => {
    const form = ready();
    expect(form.isSubmitDisabled()).toBe(true);
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    expect(form.isSubmitDisabled()).toBe(false);
  });

  it("submits the entered RFQ details to the create-RFQ command", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    await form.setDirection(Direction.Sell);
    await form.submit();
    expect(form.createdRfq()).toMatchObject({
      instrumentId: 2,
      quantity: 5,
      direction: Direction.Sell,
    });
  });

  it("confirms creation to the user", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    await form.submit();
    await form.shouldShowConfirmation();
  });

  it("blocks submission when the quantity exceeds the maximum", async () => {
    const form = ready();
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(200_000_000);
    expect(form.hasQuantityError()).toBe(true);
    expect(form.isSubmitDisabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: FAIL — `NewRfqForm` is not exported from `@behaviour/components`.

- [ ] **Step 3: Create the page object**

Create `packages/client/tests/behaviour/shared/pages/credit/newRfq/NewRfqFormPage.ts`:

```ts
import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { type Direction, type CreateRfqInput } from "@rtc/domain";
import { MountedComponent } from "../../../harness/component";

export interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
}

export class NewRfqFormPage extends MountedComponent<NewRfqFormProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q() {
    return within(this.root);
  }

  /** Type into the instrument search and pick the named result. */
  async chooseInstrument(name: string): Promise<void> {
    const search = this.q().getByPlaceholderText(/search by ticker/i);
    await this.user.type(search, name);
    const option = await this.q().findByText(name);
    await this.user.click(option);
  }

  async setQuantity(value: number): Promise<void> {
    const input = this.q().getByPlaceholderText(/enter quantity/i);
    await this.user.clear(input);
    await this.user.type(input, String(value));
  }

  async setDirection(direction: Direction): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: direction }));
  }

  async submit(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /submit rfq/i }));
  }

  isSubmitDisabled(): boolean {
    const btn = this.q().getByRole("button", {
      name: /submit rfq/i,
    }) as HTMLButtonElement;
    return btn.disabled;
  }

  hasQuantityError(): boolean {
    return this.q().queryByText(/max quantity exceeded/i) !== null;
  }

  /** The RFQ input recorded by the faked create-RFQ command, or null. */
  createdRfq(): CreateRfqInput | null {
    return this.commandLog().createRfq[0] ?? null;
  }

  /** Resolves once the post-submit confirmation is shown. */
  async shouldShowConfirmation(): Promise<void> {
    await this.q().findByText(/rfq created/i);
  }
}
```

- [ ] **Step 4: Add the token**

Edit `packages/client/tests/behaviour/shared/components.ts` — add:

```ts
import { NewRfqFormPage, type NewRfqFormProps } from "./pages/credit/newRfq/NewRfqFormPage";

export const NewRfqForm = component<NewRfqFormProps, NewRfqFormPage>(
  (ctx) => new NewRfqFormPage(ctx),
);
```

- [ ] **Step 5: Add the registry entry**

Edit `packages/client/tests/behaviour/react/registry.tsx`:
- Add imports:
  ```tsx
  import { NewRfqForm } from "../shared/components";
  import { NewRfqForm as NewRfqFormComponent } from "../../../src/ui/credit/newRfq/NewRfqForm";
  ```
- Add a `Map` entry (props carries the callback; default to a no-op if absent):
  ```tsx
  [NewRfqForm, (p) => <NewRfqFormComponent onCreated={(p.onCreated as ((id: number) => void)) ?? (() => {})} />],
  ```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 4 files, 21 tests. `act(...)` warnings (if any) are non-fatal. If `chooseInstrument` times out on `findByText`, confirm the instrument name passed in the spec exactly matches a fixture instrument (`"Apple Inc 2030"`).

- [ ] **Step 7: Commit**

```bash
git add packages/client/tests/behaviour
git commit -m "test(client): NewRfqForm behaviour specs (sociable interaction + command spy)"
```

---

## Task 6: Fold into default `pnpm test`, document, and verify

**Files:** modify `packages/client/vitest.config.ts`; create `packages/client/tests/behaviour/README.md`.

- [ ] **Step 1: Extend the default vitest config**

Replace `packages/client/vitest.config.ts` with:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@behaviour": fileURLToPath(
        new URL("./tests/behaviour/shared", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/behaviour/specs/**/*.behaviour.spec.ts",
    ],
    setupFiles: ["./tests/behaviour/react/setup.ts"],
    passWithNoTests: true,
    // HTML report (additive; terminal output unchanged). Bare `test` maps to
    // reports/unit/ per the repo-wide rule: test:<a>:<b> => reports/<a>/<b>/.
    reporters: ["default", "html"],
    outputFile: { html: "reports/unit/report/index.html" },
  },
});
```

The behaviour specs now run with the unit suite under `pnpm test` (driver registered via `setupFiles`, alias resolved), while `test:behaviour` remains the focused runner with its own `reports/behaviour/` output.

- [ ] **Step 2: Run the full client suite to verify nothing regressed**

Run: `pnpm --filter @rtc/client test`
Expected: PASS — the prior unit suite (26 files / 69 tests per ADR-001) **plus** the 4 behaviour files / 21 tests = 30 files / 90 tests, all passing.

- [ ] **Step 3: Verify the focused runner still works**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 4 files, 21 tests; HTML report at `packages/client/reports/behaviour/report/index.html`.

- [ ] **Step 4: Verify typecheck and build are unaffected**

Run (from repo root):
```bash
pnpm --filter @rtc/client typecheck && pnpm --filter @rtc/client build
```
Expected: both succeed (`typecheck` covers `src` only; `build` ignores tests).

- [ ] **Step 5: Write the tier README**

Create `packages/client/tests/behaviour/README.md`:

```markdown
# Behaviour (contract) test tier

Sociable React Testing Library tests with explicit behavioural assertions,
complementing the pixel-only `tests/visual-diff/` tier. They assert text, roles,
structure, recorded command/callback inputs, and dynamic re-renders — never
colour or layout (that stays the visual tier's job).

## Layers

- `specs/` — the tests. Mirror `src/ui/` (minus `ui/`) with component PascalCase
  (`specs/fx/analytics/PnlValue.behaviour.spec.ts`). Import only
  `@behaviour/mount`, `@behaviour/components` (tokens), and `@rtc/domain` types.
  **No React / testing-library imports.**
- `shared/` — framework-neutral harness:
  - `harness/world.ts` — a `BehaviorSubject` per hook (the controllable "World")
    plus a command log; `createWorld()`.
  - `harness/component.ts` — `ComponentToken`, the `MountedComponent` page-object
    base (`setProps`/`emit`/`commandLog`), and `component()`.
  - `harness/activeDriver.ts` — the `setDriver`/`getDriver` seam.
  - `mount.ts` — `mount(token, { props, hooks, commands })`.
  - `components.ts` — the neutral tokens.
  - `pages/` — page objects querying raw DOM via `@testing-library/dom`.
- `react/` — **the only framework-specific surface**:
  - `registry.tsx` — token → React element.
  - `hooksFromWorld.ts` — `reactHooks(world)` via `useSyncExternalStore`
    (re-renders the consuming component on each `emit`/`setProps`).
  - `render.tsx` — the driver (providers + a `PropsHost` for the props subject).
  - `setup.ts` — registers the driver via `setDriver`.

## Input channels

`mount(Token, { props?, hooks?, commands? })`:
- `props` — real component props, including callbacks (`onCreated: vi.fn()`).
- `hooks` — initial value per hook, keyed by hook name (`{ useTrades: [...] }`).
- `commands` — canned command results (`{ createRfq: 555 }`).

Drive updates via the returned page object: `page.setProps({...})`,
`page.emit({ useTrades: [...] })`; read recorded commands via accessors like
`page.createdRfq()`.

## Running

- `pnpm --filter @rtc/client test` — runs these with the unit suite (jsdom).
- `pnpm --filter @rtc/client test:behaviour` — focused runner; HTML report at
  `reports/behaviour/report/index.html`.

## Swapping the UI framework (e.g. SolidJS)

1. Add a `solid/` trio — `registry.tsx` (token → Solid element),
   `hooksFromWorld.ts` (`from(subject)` → signal), `render.tsx`
   (`@solidjs/testing-library`, which re-exports the same `@testing-library/dom`
   queries), and `setup.ts`.
2. Point the vitest config's `setupFiles` at `solid/setup.ts`.

`specs/`, `shared/components.ts` (tokens), `shared/pages/**`, `shared/harness/**`,
and `shared/mount.ts` are untouched. The first Solid run's failures are the
behavioural-parity punch-list.

## Dual use: sociable unit and integration

The driver's only output is an `AppHooks` handed to `HooksProvider`. This tier
uses **fake** hooks built from the `World`. The same tokens, page objects, and
specs can drive an **integration** test by handing the provider the real
`createAppHooks(presenters)` (real presenters fed by the domain `simulators`):
the query methods are valid in both modes; `emit`/`setProps`/`createdRfq` are
unit-mode conveniences. (Integration mode is supported by the design but not yet
built.)
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/vitest.config.ts packages/client/tests/behaviour/README.md
git commit -m "test(client): run behaviour tier in default suite + document it"
```

---

## Self-review notes (for the implementer)

- **Spec coverage vs design:** all six design goals are realised — RTL+jsdom
  substrate (Task 1/2); tokens replace string keys/cases (`components.ts`, every
  spec); three input channels `props`/`hooks`/`commands` (mount + every spec);
  dynamic updates via `setProps`/`emit` backed by RxJS Subjects (world.ts,
  hooksFromWorld.ts, PnlValue/ConnectionStatusBar/FxBlotter dynamic tests);
  dual-use documented (README); mirrored layout + `@behaviour/*` alias (Task 1/2,
  every path).
- **Single swap surface:** only `react/registry.tsx`, `react/hooksFromWorld.ts`,
  `react/render.tsx`, `react/setup.ts` import React or `@testing-library/react`.
  Page objects use `@testing-library/dom` + `@testing-library/user-event`
  (DOM-level). Specs import neither. Verify after Task 5:
  `grep -rl "@testing-library/react\|useSyncExternalStore\|from \"react\"" packages/client/tests/behaviour`
  should list **only** files under `tests/behaviour/react/`.
- **Type consistency:** `ComponentToken<P, Page>` / `MountedComponent<P>` /
  `PageContext<P>` (component.ts) flow through `mount` (mount.ts), the tokens
  (components.ts), and every page object. `RenderInputs<P>` / `MountedRoot` /
  `BehaviourDriver` (activeDriver.ts) are implemented by `reactDriver`
  (render.tsx). `HookValues` keys (world.ts) are the `emit`/`hooks` keys in specs
  and the `reactHooks` source reads. `CommandLog.createRfq` is read by
  `NewRfqFormPage.createdRfq()`.
- **Known live-component caveats handled:** NewRfqForm's `setTimeout(onCreated,
  1500)` is avoided (assert recorded `createdRfq()` input + `findBy`
  confirmation, not the delayed callback); FxBlotter's "new trade" highlight is
  colour-only, so the streamed-trade test asserts the row *appeared* (count + a
  new cell), not the flash; `seenTradeIds`/`useRef` survives `emit` because
  `useSyncExternalStore` re-renders the **same instance**; `hasCell` is scoped to
  `<tbody>` so header filter chrome can't cause duplicate-text matches.
- **`Record<string, never>` prop type** is used for the propless components
  (ConnectionStatusBar, FxBlotter); `mount(Token)` is called with no `props`, and
  `setProps`/`emit` typing still resolves.
```
