# Behaviour/Contract Test Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a jsdom + React Testing Library "behaviour" test tier for `@rtc/client` UI components — sociable contract tests with explicit behavioural assertions — whose specs and page objects are framework-neutral and survive a future React→SolidJS/Vue/Svelte swap by changing one driver file.

**Architecture:** Three layers. (1) **Neutral specs** under `tests/behaviour/specs/` mirror `src/ui/` and import only `@behaviour/mount` + domain types. (2) **Neutral page objects + harness** under `tests/behaviour/shared/` query raw DOM via `@testing-library/dom` (framework-agnostic) and record commands via faked `AppHooks`. (3) A **single framework driver** under `tests/behaviour/react/` (`render.tsx` + `registry.tsx` + `setup.ts`) is the only swap surface. A `setDriver()/getDriver()` seam (dependency inversion) connects them; the vitest `setupFiles` entry selects the driver. Reuses the visual-diff tier's neutral data manifest (`shared/fixtures.ts`, `appData.ts`).

**Tech Stack:** Vitest 4 (jsdom env), `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@vitejs/plugin-react`, RxJS (for command observables), `@rtc/domain` types.

---

## File structure

**Create (neutral — never changes on a framework swap):**
- `packages/client/tests/behaviour/shared/activeDriver.ts` — `BehaviourDriver` interface + `setDriver`/`getDriver` seam.
- `packages/client/tests/behaviour/shared/recordingHooks.ts` — `buildRecordingHooks(data, results)`: `AppHooks` whose query hooks read fixture data and whose command hooks record inputs + emit canned Observables.
- `packages/client/tests/behaviour/shared/cases.ts` — `cases` manifest (caseName → componentKey + fixtureKey/data/props/results) + `ComponentKey`/`CaseName` types.
- `packages/client/tests/behaviour/shared/mount.ts` — typed `mount(caseName)` → page object; `cleanupMounted()`.
- `packages/client/tests/behaviour/shared/pages/index.ts` — `componentKey → page-object factory` + `PageByKey` type map.
- `packages/client/tests/behaviour/shared/pages/fx/analytics/PnlValuePage.ts`
- `packages/client/tests/behaviour/shared/pages/shell/connection/ConnectionStatusBarPage.ts`
- `packages/client/tests/behaviour/shared/pages/fx/blotter/FxBlotterPage.ts`
- `packages/client/tests/behaviour/shared/pages/credit/newRfq/NewRfqFormPage.ts`

**Create (framework-specific — the only swap surface):**
- `packages/client/tests/behaviour/react/registry.tsx` — `componentKey → ReactElement` factory (props-aware).
- `packages/client/tests/behaviour/react/render.tsx` — `reactDriver`: `@testing-library/react` render wrapped in `ThemeProvider` + `HooksProvider`.
- `packages/client/tests/behaviour/react/setup.ts` — `setDriver(reactDriver)` + `afterEach(cleanupMounted)`.

**Create (specs — neutral; mirror `src/ui/` + component PascalCase):**
- `packages/client/tests/behaviour/specs/fx/analytics/PnlValue.behaviour.spec.ts`
- `packages/client/tests/behaviour/specs/shell/connection/ConnectionStatusBar.behaviour.spec.ts`
- `packages/client/tests/behaviour/specs/fx/blotter/FxBlotter.behaviour.spec.ts`
- `packages/client/tests/behaviour/specs/credit/newRfq/NewRfqForm.behaviour.spec.ts`

**Create (config + docs):**
- `packages/client/tests/behaviour/vitest.config.ts` — focused `test:behaviour` runner config.
- `packages/client/tests/behaviour/README.md` — tier overview + swap instructions.

**Modify:**
- `packages/client/package.json` — add 3 dev deps + `test:behaviour` script.
- `packages/client/tsconfig.json` — add `@behaviour/*` path (editor DX).
- `packages/client/vitest.config.ts` — add react plugin, `@behaviour` alias, behaviour `setupFiles`, fold behaviour specs into the default `pnpm test` include.

---

## Task 1: Dependencies and editor path alias

**Files:**
- Modify: `packages/client/package.json` (devDependencies)
- Modify: `packages/client/tsconfig.json`

- [ ] **Step 1: Add the testing-library dev dependencies**

Run (from repo root):
```bash
pnpm --filter @rtc/client add -D @testing-library/react @testing-library/dom @testing-library/user-event
```
Expected: pnpm resolves and writes versions into `packages/client/package.json` `devDependencies` (e.g. `@testing-library/react ^16.x`, `@testing-library/dom ^10.x`, `@testing-library/user-event ^14.x`); lockfile updates; no peer-dependency errors against React 19.

- [ ] **Step 2: Add the `@behaviour/*` path to the client tsconfig (editor DX only)**

Edit `packages/client/tsconfig.json` — add a `paths` entry inside `compilerOptions` (after the `lib` line):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "@behaviour/*": ["tests/behaviour/shared/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "../domain" }, { "path": "../shared" }]
}
```

Note: `include` stays `["src"]`, so `pnpm typecheck` scope is unchanged (tests are not type-checked by the build, matching the existing visual-diff tier). The alias is resolved at test runtime by vitest (Task 2); this `paths` entry only feeds the editor's TS server.

- [ ] **Step 3: Verify install is clean**

Run (from repo root):
```bash
pnpm --filter @rtc/client exec vitest run 2>&1 | tail -5
```
Expected: the existing unit suite still passes (e.g. "Test Files … passed"), confirming the new deps did not disturb the current config.

- [ ] **Step 4: Commit**

```bash
git add packages/client/package.json packages/client/tsconfig.json pnpm-lock.yaml
git commit -m "build(client): add testing-library deps for behaviour test tier"
```

---

## Task 2: Harness vertical slice — PnlValue end-to-end

This task builds the entire neutral harness + the React driver, proven by the first (PnlValue) spec. PnlValue is a pure-prop leaf: no hooks, no providers needed, no testid — it proves the prop-driven mount path and the framework-driver seam.

**Files:**
- Create: all `shared/*` harness files, all `react/*` driver files (PnlValue entries only), `tests/behaviour/vitest.config.ts`
- Test: `packages/client/tests/behaviour/specs/fx/analytics/PnlValue.behaviour.spec.ts`
- Modify: `packages/client/package.json` (add `test:behaviour` script)

- [ ] **Step 1: Write the failing spec**

Create `packages/client/tests/behaviour/specs/fx/analytics/PnlValue.behaviour.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@behaviour/mount";

describe("PnlValue", () => {
  it("shows a positive value with a + sign", () => {
    expect(mount("pnl/positive-units").text()).toBe("+500");
  });

  it("shows a negative value with a - sign", () => {
    expect(mount("pnl/negative-units").text()).toBe("-500");
  });

  it("treats zero as positive", () => {
    expect(mount("pnl/zero").text()).toBe("+0");
  });

  it("abbreviates thousands with one decimal and a k suffix", () => {
    expect(mount("pnl/positive-thousands").text()).toBe("+12.5k");
    expect(mount("pnl/negative-thousands").text()).toBe("-2.5k");
  });

  it("abbreviates millions with two decimals and an m suffix", () => {
    expect(mount("pnl/positive-millions").text()).toBe("+1.50m");
  });
});
```

- [ ] **Step 2: Create the driver seam**

Create `packages/client/tests/behaviour/shared/activeDriver.ts`:

```ts
import type { AppHooks } from "../../../src/ui/hooks/createAppHooks";

export interface RenderInputs {
  readonly props: Record<string, unknown>;
  readonly hooks: AppHooks;
}

export interface MountedRoot {
  /** The DOM subtree the component rendered into. */
  readonly root: HTMLElement;
  readonly unmount: () => void;
}

/** A framework adapter that knows how to render a component key into the DOM. */
export interface BehaviourDriver {
  render(componentKey: string, inputs: RenderInputs): MountedRoot;
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

- [ ] **Step 3: Create the recording hooks**

Create `packages/client/tests/behaviour/shared/recordingHooks.ts`:

```ts
import { EMPTY, of, type Observable } from "rxjs";
import type {
  CurrencyPair,
  ExecuteTradeInput,
  ExecuteTradeResult,
  CreateRfqInput,
  RfqQuoteResult,
  QuoteRequest,
} from "@rtc/domain";
import type { AppData } from "../../visual-diff/shared/appData";
import type { AppHooks } from "../../../src/ui/hooks/createAppHooks";

/** Inputs captured from the (faked) command hooks during a test. */
export interface CommandRecorder {
  readonly createRfq: CreateRfqInput[];
}

/** Canned results the faked command hooks emit. */
export interface CommandResults {
  readonly createRfq?: number;
}

export interface RecordingHooks {
  readonly hooks: AppHooks;
  readonly recorder: CommandRecorder;
}

/**
 * Builds an AppHooks whose query hooks read from `data` and whose command
 * hooks record their inputs into `recorder` and emit canned one-shot
 * Observables (so callers' firstValueFrom(...) resolves). This is the sociable
 * boundary: real child components render; only the AppHooks port is faked.
 */
export function buildRecordingHooks(
  data: AppData,
  results: CommandResults = {},
): RecordingHooks {
  const recorder: CommandRecorder = { createRfq: [] };
  const hooks: AppHooks = {
    usePrice: (pair: CurrencyPair) => data.prices[pair.symbol] ?? null,
    usePriceHistory: (symbol: string) => data.priceHistory[symbol] ?? [],
    useTrades: () => data.trades,
    useAnalytics: () => data.analytics,
    useRfqs: () => data.rfqs,
    useQuotesForRfq: (rfqId: number) => data.quotesForRfq[rfqId] ?? [],
    useAllQuotes: () => data.allQuotes,
    useCurrencyPairs: () => data.currencyPairs,
    useInstruments: () => data.instruments,
    useDealers: () => data.dealers,
    useConnectionStatus: () => data.connectionStatus,
    useExecuteTrade: () => (_input: ExecuteTradeInput) =>
      EMPTY as Observable<ExecuteTradeResult>,
    useCreateRfq: () => (input: CreateRfqInput) => {
      recorder.createRfq.push(input);
      return of(results.createRfq ?? 0);
    },
    useAcceptQuote: () => () => EMPTY as Observable<void>,
    useCancelRfq: () => () => EMPTY as Observable<void>,
    usePassQuote: () => () => EMPTY as Observable<void>,
    useQuoteRfq: () => () => EMPTY as Observable<void>,
    useRequestRfqQuote: () => (_symbol: string, _pips: number) =>
      EMPTY as Observable<RfqQuoteResult>,
  };
  return { hooks, recorder };
}
```

- [ ] **Step 4: Create the case manifest (PnlValue cases only for now)**

Create `packages/client/tests/behaviour/shared/cases.ts`:

```ts
import type { AppData } from "../../visual-diff/shared/appData";
import type { CommandResults } from "./recordingHooks";

export type ComponentKey =
  | "PnlValue"
  | "ConnectionStatusBar"
  | "NewRfqForm"
  | "FxBlotter";

export interface CaseDef {
  readonly componentKey: ComponentKey;
  /** Reuse a visual-diff fixture by key. */
  readonly fixtureKey?: string;
  /** Or supply an inline data override (merged over defaultAppData). */
  readonly data?: Partial<AppData>;
  /** Props passed straight to the component (prop-driven leaves). */
  readonly props?: Record<string, unknown>;
  /** Canned command results for interaction tests. */
  readonly results?: CommandResults;
}

export const cases = {
  "pnl/zero": { componentKey: "PnlValue", props: { value: 0 } },
  "pnl/positive-units": { componentKey: "PnlValue", props: { value: 500 } },
  "pnl/negative-units": { componentKey: "PnlValue", props: { value: -500 } },
  "pnl/positive-thousands": { componentKey: "PnlValue", props: { value: 12_500 } },
  "pnl/negative-thousands": { componentKey: "PnlValue", props: { value: -2_500 } },
  "pnl/positive-millions": { componentKey: "PnlValue", props: { value: 1_500_000 } },
} as const satisfies Record<string, CaseDef>;

export type CaseName = keyof typeof cases;
```

- [ ] **Step 5: Create the PnlValue page object**

Create `packages/client/tests/behaviour/shared/pages/fx/analytics/PnlValuePage.ts`:

```ts
/** Page object for the PnlValue leaf. Queries the rendered DOM only. */
export class PnlValuePage {
  constructor(private readonly root: HTMLElement) {}

  /** The formatted P&L text the user sees, e.g. "+12.5k". */
  text(): string {
    return this.root.textContent?.trim() ?? "";
  }
}
```

- [ ] **Step 6: Create the page-object registry**

Create `packages/client/tests/behaviour/shared/pages/index.ts`:

```ts
import type { MountedRoot } from "../activeDriver";
import type { CommandRecorder } from "../recordingHooks";
import type { ComponentKey } from "../cases";
import { PnlValuePage } from "./fx/analytics/PnlValuePage";

/** Concrete page-object type per component key (used to type `mount`). */
export interface PageByKey {
  PnlValue: PnlValuePage;
  ConnectionStatusBar: unknown;
  NewRfqForm: unknown;
  FxBlotter: unknown;
}

type PageFactory = (mounted: MountedRoot, recorder: CommandRecorder) => unknown;

export const pages: Record<ComponentKey, PageFactory> = {
  PnlValue: (m) => new PnlValuePage(m.root),
  ConnectionStatusBar: (m) => m, // replaced in Task 3
  NewRfqForm: (m) => m, // replaced in Task 5
  FxBlotter: (m) => m, // replaced in Task 4
};
```

Note: `ConnectionStatusBar`/`NewRfqForm`/`FxBlotter` are stubbed to `unknown` here and replaced with real page objects in their tasks. This keeps Task 2 self-contained and compiling.

- [ ] **Step 7: Create the typed mount + cleanup**

Create `packages/client/tests/behaviour/shared/mount.ts`:

```ts
import { makeAppData, type AppData } from "../../visual-diff/shared/appData";
import { fixtures } from "../../visual-diff/shared/fixtures";
import { getDriver, type MountedRoot } from "./activeDriver";
import { buildRecordingHooks } from "./recordingHooks";
import { cases, type CaseName } from "./cases";
import { pages, type PageByKey } from "./pages";

type PageFor<K extends CaseName> = PageByKey[(typeof cases)[K]["componentKey"]];

const mounted: MountedRoot[] = [];

/** Render a named case via the active framework driver, return its page object. */
export function mount<K extends CaseName>(name: K): PageFor<K> {
  const def = cases[name];
  const data: AppData = def.fixtureKey
    ? fixtures[def.fixtureKey]
    : makeAppData(def.data ?? {});
  const { hooks, recorder } = buildRecordingHooks(data, def.results);
  const root = getDriver().render(def.componentKey, {
    props: def.props ?? {},
    hooks,
  });
  mounted.push(root);
  return pages[def.componentKey](root, recorder) as PageFor<K>;
}

/** Unmount everything mounted since the last cleanup (call in afterEach). */
export function cleanupMounted(): void {
  while (mounted.length > 0) mounted.pop()!.unmount();
}
```

- [ ] **Step 8: Create the React component registry (PnlValue entry)**

Create `packages/client/tests/behaviour/react/registry.tsx`:

```tsx
import type { ReactElement } from "react";
import type { ComponentKey } from "../shared/cases";
import { PnlValue } from "../../../src/ui/fx/analytics/PnlValue";

/** Maps a neutral component key to a concrete React element, given its props. */
export const behaviourRegistry: Record<
  ComponentKey,
  (props: Record<string, unknown>) => ReactElement
> = {
  PnlValue: (p) => <PnlValue value={p.value as number} />,
  // ConnectionStatusBar / FxBlotter / NewRfqForm entries added in their tasks.
  ConnectionStatusBar: () => <PnlValue value={0} />, // placeholder, replaced in Task 3
  FxBlotter: () => <PnlValue value={0} />, // placeholder, replaced in Task 4
  NewRfqForm: () => <PnlValue value={0} />, // placeholder, replaced in Task 5
};
```

Note: placeholders keep the `Record<ComponentKey, …>` exhaustive and compiling; each is replaced with the real component in its task.

- [ ] **Step 9: Create the React render driver**

Create `packages/client/tests/behaviour/react/render.tsx`:

```tsx
import { render as rtlRender } from "@testing-library/react";
import { ThemeProvider } from "../../../src/ui/shell/theme/ThemeProvider";
import { HooksProvider } from "../../../src/ui/hooks/HooksProvider";
import type { BehaviourDriver } from "../shared/activeDriver";
import type { ComponentKey } from "../shared/cases";
import { behaviourRegistry } from "./registry";

export const reactDriver: BehaviourDriver = {
  render(componentKey, { props, hooks }) {
    const element = behaviourRegistry[componentKey as ComponentKey](props);
    const { container, unmount } = rtlRender(
      <ThemeProvider>
        <HooksProvider hooks={hooks}>{element}</HooksProvider>
      </ThemeProvider>,
    );
    return { root: container, unmount };
  },
};
```

- [ ] **Step 10: Create the React setup file**

Create `packages/client/tests/behaviour/react/setup.ts`:

```ts
import { afterEach } from "vitest";
import { setDriver } from "../shared/activeDriver";
import { cleanupMounted } from "../shared/mount";
import { reactDriver } from "./render";

setDriver(reactDriver);
afterEach(() => cleanupMounted());
```

- [ ] **Step 11: Create the focused behaviour vitest config**

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
    // Pin root to the package dir (two levels up from this suite folder) so
    // include/setup/report paths are stable regardless of invocation cwd —
    // mirrors tests/visual-diff/vitest-browser/vitest-browser.config.ts.
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

- [ ] **Step 12: Add the `test:behaviour` script**

Edit `packages/client/package.json` `scripts` — add (after the `test` line):

```json
    "test:behaviour": "vitest run -c tests/behaviour/vitest.config.ts",
```

- [ ] **Step 13: Run the spec to verify it passes**

Run (from repo root):
```bash
pnpm --filter @rtc/client test:behaviour
```
Expected: PASS — 1 file, 5 tests passed (PnlValue). If a `+1.50m` / `+12.5k` assertion fails, the harness wiring (driver/registry/mount) is the suspect, not the assertions — the expected strings are derived from `PnlValue.formatPnl`.

- [ ] **Step 14: Commit**

```bash
git add packages/client/tests/behaviour packages/client/package.json
git commit -m "test(client): behaviour test harness + PnlValue contract specs"
```

---

## Task 3: ConnectionStatusBar contract specs

Hooks-connected display. Proves query-hook injection (via inline `data`) across all five connection states.

**Files:**
- Create: `packages/client/tests/behaviour/shared/pages/shell/connection/ConnectionStatusBarPage.ts`
- Modify: `packages/client/tests/behaviour/shared/cases.ts`, `shared/pages/index.ts`, `react/registry.tsx`
- Test: `packages/client/tests/behaviour/specs/shell/connection/ConnectionStatusBar.behaviour.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `packages/client/tests/behaviour/specs/shell/connection/ConnectionStatusBar.behaviour.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@behaviour/mount";

describe("ConnectionStatusBar", () => {
  it("labels a connecting session", () => {
    expect(mount("connection-status/connecting").statusText()).toBe("Connecting...");
  });

  it("labels a connected session", () => {
    expect(mount("connection-status/connected").statusText()).toBe("Connected");
  });

  it("labels a disconnected session", () => {
    expect(mount("connection-status/disconnected").statusText()).toBe("Disconnected");
  });

  it("labels an idle session", () => {
    expect(mount("connection-status/idle").statusText()).toBe("Idle");
  });

  it("labels an offline session", () => {
    expect(mount("connection-status/offline").statusText()).toBe("Offline");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: FAIL — unknown case `connection-status/connecting` (not yet in `cases.ts`) / TypeScript error on the case name.

- [ ] **Step 3: Add the connection cases**

Edit `packages/client/tests/behaviour/shared/cases.ts` — add the `ConnectionStatus` import at the top and the five cases inside the `cases` object (after the `pnl/*` entries):

```ts
import { ConnectionStatus } from "@rtc/domain";
```

```ts
  "connection-status/connecting": {
    componentKey: "ConnectionStatusBar",
    data: { connectionStatus: ConnectionStatus.CONNECTING },
  },
  "connection-status/connected": {
    componentKey: "ConnectionStatusBar",
    data: { connectionStatus: ConnectionStatus.CONNECTED },
  },
  "connection-status/disconnected": {
    componentKey: "ConnectionStatusBar",
    data: { connectionStatus: ConnectionStatus.DISCONNECTED },
  },
  "connection-status/idle": {
    componentKey: "ConnectionStatusBar",
    data: { connectionStatus: ConnectionStatus.IDLE_DISCONNECTED },
  },
  "connection-status/offline": {
    componentKey: "ConnectionStatusBar",
    data: { connectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED },
  },
```

- [ ] **Step 4: Create the page object**

Create `packages/client/tests/behaviour/shared/pages/shell/connection/ConnectionStatusBarPage.ts`:

```ts
import { within } from "@testing-library/dom";

export class ConnectionStatusBarPage {
  constructor(private readonly root: HTMLElement) {}

  /** The human-readable connection status label, e.g. "Connected". */
  statusText(): string {
    return (
      within(this.root).getByTestId("connection-status").textContent?.trim() ?? ""
    );
  }
}
```

- [ ] **Step 5: Wire the page object into the registry**

Edit `packages/client/tests/behaviour/shared/pages/index.ts`:
- Add import: `import { ConnectionStatusBarPage } from "./shell/connection/ConnectionStatusBarPage";`
- Change the `PageByKey` field: `ConnectionStatusBar: ConnectionStatusBarPage;`
- Replace the factory entry: `ConnectionStatusBar: (m) => new ConnectionStatusBarPage(m.root),`

- [ ] **Step 6: Wire the real component into the React registry**

Edit `packages/client/tests/behaviour/react/registry.tsx`:
- Add import: `import { ConnectionStatusBar } from "../../../src/ui/shell/connection/ConnectionStatusBar";`
- Replace the placeholder entry with: `ConnectionStatusBar: () => <ConnectionStatusBar />,`

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 2 files, 10 tests (PnlValue 5 + ConnectionStatusBar 5).

- [ ] **Step 8: Commit**

```bash
git add packages/client/tests/behaviour
git commit -m "test(client): ConnectionStatusBar behaviour contract specs"
```

---

## Task 4: FxBlotter contract specs

Sociable list/table (renders the real BlotterHeader/BlotterRow/QuickFilter). Proves collection queries + empty state.

**Files:**
- Create: `packages/client/tests/behaviour/shared/pages/fx/blotter/FxBlotterPage.ts`
- Modify: `packages/client/tests/behaviour/shared/cases.ts`, `shared/pages/index.ts`, `react/registry.tsx`
- Test: `packages/client/tests/behaviour/specs/fx/blotter/FxBlotter.behaviour.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `packages/client/tests/behaviour/specs/fx/blotter/FxBlotter.behaviour.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@behaviour/mount";

describe("FxBlotter", () => {
  it("renders one row per trade", () => {
    expect(mount("fx-blotter/populated").tradeRowCount()).toBe(3);
  });

  it("shows each trade's key cells, including rejected trades", () => {
    const blotter = mount("fx-blotter/populated");
    expect(blotter.hasCell("EURUSD")).toBe(true);
    expect(blotter.hasCell("USDJPY")).toBe(true);
    expect(blotter.hasCell("5,000,000")).toBe(true);
    expect(blotter.hasCell("Rejected")).toBe(true);
  });

  it("exposes the trade columns", () => {
    const headers = mount("fx-blotter/populated").columnHeaders();
    expect(headers.some((h) => h.includes("Trade ID"))).toBe(true);
    expect(headers.some((h) => h.includes("Status"))).toBe(true);
  });

  it("shows an empty-state message when there are no trades", () => {
    const blotter = mount("fx-blotter/empty");
    expect(blotter.tradeRowCount()).toBe(0);
    expect(blotter.emptyMessage()).toMatch(/no trades yet/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: FAIL — unknown case `fx-blotter/populated` / TypeScript error on the case name.

- [ ] **Step 3: Add the blotter cases**

Edit `packages/client/tests/behaviour/shared/cases.ts` — add (after the connection cases):

```ts
  "fx-blotter/populated": { componentKey: "FxBlotter", fixtureKey: "fx-trades" },
  "fx-blotter/empty": { componentKey: "FxBlotter", data: {} },
```

- [ ] **Step 4: Create the page object**

Create `packages/client/tests/behaviour/shared/pages/fx/blotter/FxBlotterPage.ts`:

```ts
import { within } from "@testing-library/dom";

export class FxBlotterPage {
  constructor(private readonly root: HTMLElement) {}

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

- [ ] **Step 5: Wire the page object into the registry**

Edit `packages/client/tests/behaviour/shared/pages/index.ts`:
- Add import: `import { FxBlotterPage } from "./fx/blotter/FxBlotterPage";`
- Change the `PageByKey` field: `FxBlotter: FxBlotterPage;`
- Replace the factory entry: `FxBlotter: (m) => new FxBlotterPage(m.root),`

- [ ] **Step 6: Wire the real component into the React registry**

Edit `packages/client/tests/behaviour/react/registry.tsx`:
- Add import: `import { FxBlotter } from "../../../src/ui/fx/blotter/FxBlotter";`
- Replace the placeholder entry with: `FxBlotter: () => <FxBlotter />,`

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 3 files, 14 tests. If `columnHeaders().some(... "Trade ID")` fails, inspect `src/ui/fx/blotter/BlotterHeader.tsx` for the actual header text; the `.includes` substring match is intentionally tolerant of sort/filter chrome inside the `<th>`.

- [ ] **Step 8: Commit**

```bash
git add packages/client/tests/behaviour
git commit -m "test(client): FxBlotter behaviour contract specs"
```

---

## Task 5: NewRfqForm contract specs

Sociable interaction + command spy. Renders real InstrumentSearch/DealerSelection/QuantityInput children; fakes only `useCreateRfq`. Proves user-event actions, the command recorder, validation, and async confirmation via `findBy`.

**Files:**
- Create: `packages/client/tests/behaviour/shared/pages/credit/newRfq/NewRfqFormPage.ts`
- Modify: `packages/client/tests/behaviour/shared/cases.ts`, `shared/pages/index.ts`, `react/registry.tsx`
- Test: `packages/client/tests/behaviour/specs/credit/newRfq/NewRfqForm.behaviour.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `packages/client/tests/behaviour/specs/credit/newRfq/NewRfqForm.behaviour.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Direction } from "@rtc/domain";
import { mount } from "@behaviour/mount";

describe("NewRfqForm", () => {
  it("keeps submit disabled until an instrument and quantity are provided", async () => {
    const form = mount("new-rfq/ready");
    expect(form.isSubmitDisabled()).toBe(true);
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    expect(form.isSubmitDisabled()).toBe(false);
  });

  it("submits the entered RFQ details to the create-RFQ command", async () => {
    const form = mount("new-rfq/ready");
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
    const form = mount("new-rfq/ready");
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(5);
    await form.submit();
    await form.shouldShowConfirmation();
  });

  it("blocks submission when the quantity exceeds the maximum", async () => {
    const form = mount("new-rfq/ready");
    await form.chooseInstrument("Apple Inc 2030");
    await form.setQuantity(200_000_000);
    expect(form.hasQuantityError()).toBe(true);
    expect(form.isSubmitDisabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: FAIL — unknown case `new-rfq/ready` / TypeScript error on the case name.

- [ ] **Step 3: Add the new-rfq case**

Edit `packages/client/tests/behaviour/shared/cases.ts` — add (after the blotter cases):

```ts
  "new-rfq/ready": {
    componentKey: "NewRfqForm",
    fixtureKey: "credit-populated",
    results: { createRfq: 555 },
  },
```

- [ ] **Step 4: Create the page object**

Create `packages/client/tests/behaviour/shared/pages/credit/newRfq/NewRfqFormPage.ts`:

```ts
import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { type Direction, type CreateRfqInput } from "@rtc/domain";
import type { CommandRecorder } from "../../../recordingHooks";

export class NewRfqFormPage {
  private readonly user: UserEvent = userEvent.setup();

  constructor(
    private readonly root: HTMLElement,
    private readonly recorder: CommandRecorder,
  ) {}

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
    return this.recorder.createRfq[0] ?? null;
  }

  /** Resolves once the post-submit confirmation is shown. */
  async shouldShowConfirmation(): Promise<void> {
    await this.q().findByText(/rfq created/i);
  }
}
```

- [ ] **Step 5: Wire the page object into the registry**

Edit `packages/client/tests/behaviour/shared/pages/index.ts`:
- Add import: `import { NewRfqFormPage } from "./credit/newRfq/NewRfqFormPage";`
- Change the `PageByKey` field: `NewRfqForm: NewRfqFormPage;`
- Replace the factory entry: `NewRfqForm: (m, r) => new NewRfqFormPage(m.root, r),`

- [ ] **Step 6: Wire the real component into the React registry**

Edit `packages/client/tests/behaviour/react/registry.tsx`:
- Add import: `import { NewRfqForm } from "../../../src/ui/credit/newRfq/NewRfqForm";`
- Replace the placeholder entry with:
  `NewRfqForm: (p) => <NewRfqForm onCreated={(p.onCreated as ((id: number) => void)) ?? (() => {})} />,`

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 4 files, 18 tests. `act(...)` warnings (if any) are non-fatal; the `findBy`-based confirmation handles React's async settle. If `chooseInstrument` times out on `findByText`, confirm the fixture instrument name is exactly `"Apple Inc 2030"` (per `visual-diff/shared/fixtures.ts`).

- [ ] **Step 8: Commit**

```bash
git add packages/client/tests/behaviour
git commit -m "test(client): NewRfqForm behaviour contract specs"
```

---

## Task 6: Fold into default `pnpm test`, document, and verify

**Files:**
- Modify: `packages/client/vitest.config.ts`
- Create: `packages/client/tests/behaviour/README.md`

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
Expected: PASS — the prior unit suite (26 files / 69 tests per ADR-001) **plus** the 4 behaviour files / 18 tests = 30 files / 87 tests, all passing.

- [ ] **Step 3: Verify the focused runner still works**

Run: `pnpm --filter @rtc/client test:behaviour`
Expected: PASS — 4 files, 18 tests; HTML report written to `packages/client/reports/behaviour/report/index.html`.

- [ ] **Step 4: Verify typecheck and build are unaffected**

Run (from repo root):
```bash
pnpm --filter @rtc/client typecheck && pnpm --filter @rtc/client build
```
Expected: both succeed. `typecheck` covers `src` only (tests excluded by design), so it is unchanged; `build` is unaffected by test files.

- [ ] **Step 5: Write the tier README**

Create `packages/client/tests/behaviour/README.md`:

```markdown
# Behaviour (contract) test tier

Sociable React Testing Library tests with explicit behavioural assertions,
complementing the pixel-only `tests/visual-diff/` tier. They assert text,
roles, structure, and recorded command inputs — never colour or layout (that
stays the visual tier's job).

## Layers

- `specs/` — the tests. Mirror `src/ui/` (minus `ui/`) with component PascalCase
  (`specs/fx/analytics/PnlValue.behaviour.spec.ts`). Import only
  `@behaviour/mount` and `@rtc/domain` types. **No React / testing-library
  imports.**
- `shared/` — framework-neutral harness: `mount()`, the `cases` manifest,
  `recordingHooks` (sociable AppHooks fake + command recorder), the
  `activeDriver` seam, and `pages/` (page objects querying raw DOM via
  `@testing-library/dom`). Reuses the visual-diff data manifest
  (`../visual-diff/shared/fixtures.ts`, `appData.ts`).
- `react/` — **the only framework-specific surface**: `render.tsx` (the
  `@testing-library/react` driver), `registry.tsx` (component key → element),
  and `setup.ts` (registers the driver via `setDriver`).

## Running

- `pnpm --filter @rtc/client test` — runs these with the unit suite (jsdom).
- `pnpm --filter @rtc/client test:behaviour` — focused runner; HTML report at
  `reports/behaviour/report/index.html`.

## Swapping the UI framework (e.g. SolidJS)

1. Add `tests/behaviour/solid/render.tsx`, `solid/registry.tsx`, `solid/setup.ts`
   (use `@solidjs/testing-library`, which re-exports the same
   `@testing-library/dom` queries the page objects already use).
2. Point the vitest config's `setupFiles` at `solid/setup.ts`.

`specs/`, `shared/pages/`, `shared/mount.ts`, `shared/cases.ts`, and
`shared/recordingHooks.ts` are untouched. The first Solid run's failures are the
behavioural-parity punch-list.
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/vitest.config.ts packages/client/tests/behaviour/README.md
git commit -m "test(client): run behaviour tier in default suite + document it"
```

---

## Self-review notes (for the implementer)

- **Spec coverage vs design:** all five design decisions are realised — substrate (jsdom + `@testing-library/react`, Task 1/2), spec style (query + assert, every spec), directory/script (`tests/behaviour/` + `test:behaviour`, Task 2), run wiring (default + focused, Task 6), and the proving slice's four patterns (Tasks 2–5). The `@behaviour/*` alias and mirrored layout (the post-design refinement) are in Task 1/2 and every page-object path.
- **Single swap surface:** only `react/render.tsx`, `react/registry.tsx`, `react/setup.ts` import React or `@testing-library/react`. Page objects use `@testing-library/dom` + `@testing-library/user-event` (DOM-level, framework-neutral). Specs import neither. Verify this holds after Task 5 with:
  `grep -rl "@testing-library/react\|from \"react\"" packages/client/tests/behaviour` — should list **only** files under `tests/behaviour/react/`.
- **Type consistency:** `BehaviourDriver.render` / `MountedRoot` / `RenderInputs` (activeDriver.ts) are used unchanged by `render.tsx` and `mount.ts`. `CommandRecorder.createRfq` (recordingHooks.ts) is read by `NewRfqFormPage.createdRfq()`. `ComponentKey` union (cases.ts) keys both `behaviourRegistry` and `pages`. `PageByKey` (pages/index.ts) drives `PageFor` in mount.ts.
- **Known live-component caveats already handled:** NewRfqForm's `setTimeout(onCreated, 1500)` is avoided (assert recorded input + `findBy` confirmation, not the callback); BlotterRow's highlight `setTimeout` never fires on initial mount (no new trades); `hasCell` is scoped to `<tbody>` so header filter chrome can't cause duplicate-text matches.
```
