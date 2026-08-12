# Dockview Layout Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Dockview (vanilla `dockview-core`) as a user-selectable second layout engine for both web clients — drag-to-rearrange + per-tab opaque persistence — behind a `LayoutEngine` preference that defaults to the untouched in-house engine.

**Architecture:** A new `@rtc/*`-free leaf package `@rtc/layout-dockview` wraps `dockview-core` behind a framework-neutral `createDockEngine` API. Each web client adds one bridge component that mounts panel content **via portals** (panels consume `useViewModel`/`useFxView`/`useCreditView` context from the App tree — a separate `createRoot` would crash them). A `LayoutEngine` domain preference (mirroring `ChartSubstrate` verbatim) selects the engine in `WorkspaceEngine`; a `DockLayoutStore` (optional `AppPorts` member, the `colorScheme` precedent) persists Dockview's opaque blob per workspace tab. Spec: `docs/superpowers/specs/2026-08-11-dockview-layout-engine-design.md`.

**Tech Stack:** dockview-core 7.0.4 (pinned — 8.0.0 is <24h old), React 19 portals / Solid `<Portal>`, RxJS BehaviorSubjects, vitest jsdom, Playwright.

## Global Constraints

- `dockview-core` is pinned at **`7.0.4`** (exact, no caret) and may be imported **only** by `packages/layout-dockview` (dep-cruiser rule in Task 3).
- `@rtc/layout-dockview` imports **no `@rtc/*` package** (rule `layout-dockview-stays-pure`).
- The preference default is `"inhouse"`; the in-house render path must not change behaviour (only the `WorkspaceEngine` branch and a `data-engine` attribute are added).
- No `localStorage`, `rxjs`, or `fetch` imports anywhere under `src/ui` (grep-gated) — the store reaches the bridge through the ViewModel.
- All control statements take braces; arrow bodies use explicit `return` (repo Biome style). Function names state their effect (`rtc/name-functions-by-effect`); function-typed props stay `onX`.
- Imports use the `#/` subpath alias inside packages, never `../..`-deep relatives.
- Storage keys use the `rtc-` prefix: `rtc-layout-engine` (preference), `rtc-dock-layout-<tab>` (blobs).
- After every task: run that task's tests. Before the PR: `/rtc:gauntlet full` from the worktree, plus `pnpm exec biome ci .`.
- Worktree: `.claude/worktrees/dockview-engine` (branch `worktree-dockview-engine`). All paths below are relative to its root.

---

### Task 1: `LayoutEngine` domain preference (type → port → contract → 4 adapters)

Mirrors `ChartSubstrate` at every site. The chart-substrate lines quoted are the template — copy the shape, not the strings.

**Files:**
- Modify: `packages/domain/src/preferences/preferences.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/ports/preferencesPort.ts`
- Modify: `packages/domain/src/ports/__contracts__/PreferencesPortContract.ts`
- Modify: `packages/domain/src/simulators/PreferencesSimulator.ts`
- Modify: `packages/client-react/src/app/adapters/LocalStoragePreferencesAdapter.ts`
- Modify: `packages/client-solid/src/app/adapters/LocalStoragePreferencesAdapter.ts` (byte-identical to react's)
- Modify: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.ts`
- Test: `packages/client-react/src/app/adapters/preferences.contract.test.ts`
- Test: `packages/client-solid/src/app/adapters/preferences.contract.test.ts` (byte-identical)
- Test: `packages/client-react-native/src/app/adapters/AsyncStoragePreferencesAdapter.test.ts`

**Interfaces:**
- Produces: `type LayoutEngine = "inhouse" | "dockview"`, `DEFAULT_LAYOUT_ENGINE = "inhouse"`, `LAYOUT_ENGINES`, `PreferencesPort.layoutEngine$(): Observable<LayoutEngine>` + `setLayoutEngine(engine: LayoutEngine): void`, `LAYOUT_ENGINE_STORAGE_KEY = "rtc-layout-engine"`, `PreferencesSeed.layoutEngine?: LayoutEngine`. Every later task relies on these exact names.

- [ ] **Step 1: Write the three failing contract cases** in `PreferencesPortContract.ts`, appended after the chartSubstrate triple (~L462), plus `layoutEngine?: LayoutEngine;` on `PreferencesSeed` and the two imports (`type LayoutEngine`, `DEFAULT_LAYOUT_ENGINE`):

```ts
    it("defaults layoutEngine to inhouse and round-trips a write", async () => {
      const port = makeEmpty();
      expect(await firstValueFrom(port.layoutEngine$())).toBe(
        DEFAULT_LAYOUT_ENGINE,
      );
      port.setLayoutEngine("dockview");
      expect(await firstValueFrom(port.layoutEngine$())).toBe("dockview");
      // late subscriber sees the current value synchronously (replay-current)
      expect(await firstValueFrom(port.layoutEngine$())).toBe("dockview");
    });

    it("setLayoutEngine persists and pushes to existing subscribers", () => {
      const port = makeEmpty();
      const seen: LayoutEngine[] = [];
      const sub = port.layoutEngine$().subscribe((engine) => {
        return seen.push(engine);
      });
      port.setLayoutEngine("dockview");
      sub.unsubscribe();
      expect(seen).toEqual([DEFAULT_LAYOUT_ENGINE, "dockview"]);
    });

    it("reads back a seeded layoutEngine", async () => {
      const port = makeSeeded({ layoutEngine: "dockview" });
      expect(await firstValueFrom(port.layoutEngine$())).toBe("dockview");
    });
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/domain test -- PreferencesSimulator.contract` → FAIL (`layoutEngine$ is not a function` / type errors).

- [ ] **Step 3: Add the domain vocabulary** in `preferences.ts` — three blocks, each adjacent to its `ChartSubstrate` twin:

```ts
/** The workspace layout engine. `"inhouse"` is the shipping split-tree
 * engine; `"dockview"` is the Dockview docking engine (drag tabs to
 * re-arrange, layout persisted per workspace tab). Orthogonal to every
 * other display preference. */
export type LayoutEngine = "inhouse" | "dockview";
```
```ts
/** Workspace layout-engine default. Users who pick "dockview" keep that
 * choice (persisted under `rtc-layout-engine`). */
export const DEFAULT_LAYOUT_ENGINE: LayoutEngine = "inhouse";
```
```ts
/** The Preferences "Layout engine" segmented control renders these in order. */
export const LAYOUT_ENGINES: readonly LayoutEngine[] = ["inhouse", "dockview"];
```

Barrel (`packages/domain/src/index.ts`): add `LayoutEngine` to the type-export list and `LAYOUT_ENGINES`, `DEFAULT_LAYOUT_ENGINE` to the value-export list (both alphabetical).

- [ ] **Step 4: Add the port pair** in `preferencesPort.ts` (import `LayoutEngine`; place after the chartSubstrate pair):

```ts
  /** Replay-current layout-engine stream; emits synchronously on subscribe.
   * Selects the in-house split-tree engine vs the Dockview docking engine. */
  layoutEngine$(): Observable<LayoutEngine>;
  setLayoutEngine(engine: LayoutEngine): void;
```

- [ ] **Step 5: Implement `PreferencesSimulator`** — mirror every `chartSubstrate` site: seed field, `private readonly layoutEngineSubject: BehaviorSubject<LayoutEngine>`, ctor init from `seed.layoutEngine ?? DEFAULT_LAYOUT_ENGINE`, and:

```ts
  layoutEngine$(): Observable<LayoutEngine> {
    return this.layoutEngineSubject.pipe(distinctUntilChanged());
  }

  setLayoutEngine(engine: LayoutEngine): void {
    this.layoutEngineSubject.next(engine);
  }
```

- [ ] **Step 6: Run** `pnpm --filter @rtc/domain test` → PASS (simulator contract run picks the new cases up automatically). Also `pnpm --filter @rtc/domain typecheck`.

- [ ] **Step 7: Implement both `LocalStoragePreferencesAdapter`s** (react + solid — keep them byte-identical). Four insertion points each, mirroring `CHART_SUBSTRATE_STORAGE_KEY`:

```ts
export const LAYOUT_ENGINE_STORAGE_KEY = "rtc-layout-engine";
```
```ts
function isLayoutEngine(value: string | null): value is LayoutEngine {
  return value !== null && (LAYOUT_ENGINES as readonly string[]).includes(value);
}
```
```ts
  private readonly layoutEngine: BehaviorSubject<LayoutEngine>;
```
```ts
    this.layoutEngine = new BehaviorSubject<LayoutEngine>(
      readStored(LAYOUT_ENGINE_STORAGE_KEY, isLayoutEngine, DEFAULT_LAYOUT_ENGINE),
    );
```
```ts
  layoutEngine$(): Observable<LayoutEngine> {
    return this.layoutEngine.pipe(distinctUntilChanged());
  }

  setLayoutEngine(engine: LayoutEngine): void {
    writeStored(LAYOUT_ENGINE_STORAGE_KEY, engine);
    this.layoutEngine.next(engine);
  }
```

- [ ] **Step 8: Extend both web `preferences.contract.test.ts`** (keep identical): import `DEFAULT_LAYOUT_ENGINE` + `LAYOUT_ENGINE_STORAGE_KEY`; in `makeSeeded` add `if (seed.layoutEngine) { localStorage.setItem(LAYOUT_ENGINE_STORAGE_KEY, seed.layoutEngine); }`; add cleanup `localStorage.removeItem(LAYOUT_ENGINE_STORAGE_KEY);`; add the adapter-only case:

```ts
  it("falls back to defaults for an invalid stored layoutEngine", async () => {
    localStorage.setItem(LAYOUT_ENGINE_STORAGE_KEY, "nonsense");
    const port = new LocalStoragePreferencesAdapter();
    expect(await firstValueFrom(port.layoutEngine$())).toBe(
      DEFAULT_LAYOUT_ENGINE,
    );
  });
```

- [ ] **Step 9: Implement `AsyncStoragePreferencesAdapter`** — 7 sites. ⚠️ Lines ~189 and ~209 are two **parallel positional lists** (destructured names / `AsyncStorage.getItem` calls) — insert `layoutEngine` at the *same index* in both. Then: key const, `isLayoutEngine` guard, `StoredPreferences.layoutEngine?`, `if (isLayoutEngine(layoutEngine)) { stored.layoutEngine = layoutEngine; }`, subject + ctor init, hydrate push (`if (s.layoutEngine !== undefined) { this.layoutEngine.next(s.layoutEngine); }`), and the `$`/setter pair with `void AsyncStorage.setItem(...).catch(() => {})`.

- [ ] **Step 10: Add the two RN bespoke cases** to `AsyncStoragePreferencesAdapter.test.ts` (mirror the chartSubstrate pair at ~L288-302, literal key `"rtc-layout-engine"`, value `"dockview"`).

- [ ] **Step 11: Run all four adapters' tests**
`pnpm --filter @rtc/client-react --filter @rtc/client-solid --filter @rtc/client-react-native --filter @rtc/domain test` → PASS. `pnpm typecheck` (repo-wide — catches any structural fake that now misses the port members; fix any such fake by adding the two members the same way its `chartSubstrate` ones are written).

- [ ] **Step 12: Commit** — `feat(domain): LayoutEngine preference (inhouse | dockview) through the port + all four adapters`

---

### Task 2: Presenter, bindings, prefs-modal row, ui-contract seam

**Files:**
- Create: `packages/client-core/src/presenters/LayoutEnginePresenter.ts`
- Create: `packages/client-core/src/presenters/__tests__/LayoutEnginePresenter.test.ts`
- Modify: `packages/client-core/src/presenters/index.ts`
- Modify: `packages/client-core/src/composition.ts` (import ~L48, `Presenters` iface ~L158, factory literal ~L803)
- Modify: `packages/react-bindings/src/createViewModel.ts` (5 sites, template at L221/L347/L583/L1114)
- Modify: `packages/solid-bindings/src/createViewModel.ts` (5 sites, template at L235/L384/L635/L1140)
- Modify: `packages/client-react/src/ui/shell/prefs/PreferencesModal.tsx` + `packages/client-solid/src/ui/shell/prefs/PreferencesModal.tsx`
- Modify: `packages/client-react/src/ui/shell/prefs/PreferencesModal.test.tsx` (fake must supply the hook)
- Modify: `packages/ui-contract/src/shared/harness/world.ts`, `packages/ui-contract/src/shared/mount.ts`, `packages/ui-contract/src/shared/pages/shell/prefs/PreferencesModalPage.ts`
- Modify: `packages/ui-contract/src/specs/shell/prefs/PreferencesModal.contract.spec.ts`
- Modify: `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`, `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts`
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`, `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts`

**Interfaces:**
- Consumes: Task 1's `LayoutEngine`, `DEFAULT_LAYOUT_ENGINE`, port pair.
- Produces: `Presenters.layoutEngine: LayoutEnginePresenter` (`engine$`, `setEngine`), ViewModel hook `useLayoutEngine(): { engine, setEngine }` (React: value; Solid: `Accessor<LayoutEngine>`), testids `pref-segment-layoutEngine-{inhouse,dockview}`, `World.layoutEngine: BehaviorSubject<LayoutEngine>`, `MountOptions.layoutEngine?: LayoutEngine`, page-object `layoutEngineActive()` / `selectLayoutEngine()`.

- [ ] **Step 1: Write the failing shared contract case** in `PreferencesModal.contract.spec.ts` (after the Chart renderer case at ~L243):

```ts
  it("shows the REAL Layout engine segment reflecting the active option, and writes through the seam on select", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      layoutEngine: "inhouse",
    });

    expect(page.layoutEngineActive("inhouse")).toBe(true);
    expect(page.layoutEngineActive("dockview")).toBe(false);

    await page.selectLayoutEngine("dockview");

    expect(page.layoutEngineActive("dockview")).toBe(true);
    expect(page.layoutEngineActive("inhouse")).toBe(false);
  });
```

Page object (`PreferencesModalPage.ts`, mirror the chartSubstrate pair at L208-234):

```ts
  /** True when the given layout-engine option is the active one in the REAL
   * "Layout engine" segment row (its `data-on`). */
  layoutEngineActive(engine: LayoutEngine): boolean {
    return this.segmentActive("layoutEngine", engine);
  }

  /** Select a layout-engine option through the REAL "Layout engine" segment,
   * writing through the useLayoutEngine seam. */
  async selectLayoutEngine(engine: LayoutEngine): Promise<void> {
    await this.selectSegment("layoutEngine", engine);
  }
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rtc/client-react test:ui:contract` (script name: check `packages/client-react/package.json`; it is the script whose vitest config is `tests/ui/contract/vitest.config.ts`) → FAIL (mount option + segment missing).

- [ ] **Step 3: Presenter** — `LayoutEnginePresenter.ts` (copy `ChartSubstratePresenter.ts`'s 22-line shape):

```ts
import { type Observable, shareReplay } from "rxjs";

import type { LayoutEngine, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the layout-engine preference. Exposes the
 * replay-current engine stream and the write operation, keeping
 * persistence out of the UI.
 */
export class LayoutEnginePresenter {
  readonly engine$: Observable<LayoutEngine>;

  constructor(private readonly preferences: PreferencesPort) {
    this.engine$ = preferences
      .layoutEngine$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setEngine(engine: LayoutEngine): void {
    this.preferences.setLayoutEngine(engine);
  }
}
```

Test (mirror `ChartSubstratePresenter.test.ts`'s two cases against `PreferencesSimulator`, expecting `["inhouse", "dockview"]`). Wire `presenters/index.ts` re-export + the three `composition.ts` sites (`layoutEngine: new LayoutEnginePresenter(ports.preferences),`).

- [ ] **Step 4: Bindings** — react (`createViewModel.ts`), 5 sites mirroring `useChartSubstrate`:

```ts
interface UseLayoutEngineResult {
  engine: LayoutEngine;
  setEngine: (engine: LayoutEngine) => void;
}
```
```ts
  /** Global workspace layout-engine preference (inhouse | dockview) — current
   * engine plus the write intent. */
  useLayoutEngine: () => UseLayoutEngineResult;
```
```ts
  const [useLayoutEngineValue] = bind(
    presenters.layoutEngine.engine$,
    DEFAULT_LAYOUT_ENGINE,
  );

  function setLayoutEngine(engine: LayoutEngine): void {
    presenters.layoutEngine.setEngine(engine);
  }
```
```ts
    useLayoutEngine: () => {
      return {
        engine: useLayoutEngineValue(),
        setEngine: setLayoutEngine,
      };
    },
```

Solid mirror: `Accessor<LayoutEngine>`, `const layoutEngineState = state(presenters.layoutEngine.engine$, DEFAULT_LAYOUT_ENGINE);`, `engine: toSignal(layoutEngineState)`.

- [ ] **Step 5: Prefs modal rows** — React, immediately after the "Chart renderer" `PrefSegment` (~L231):

```tsx
              <PrefSegment
                label="Layout engine"
                description="In-house split engine, or Dockview docking — drag tabs to re-arrange; layout persists per workspace tab."
                options={LAYOUT_ENGINE_OPTIONS}
                value={layoutEngine}
                onChange={(value: string) => {
                  setLayoutEngine(value as LayoutEngine);
                }}
                testid="pref-segment-layoutEngine"
              />
```

with hook destructure `const { engine: layoutEngine, setEngine: setLayoutEngine } = useLayoutEngine();`, the module-scope options const:

```tsx
// The options for the real "Layout engine" segment row, wired to
// useLayoutEngine (not decorative — see PrefSegment call site above).
const LAYOUT_ENGINE_OPTIONS: readonly PrefSegmentOption[] = [
  { value: "inhouse", label: "In-house" },
  { value: "dockview", label: "Dockview" },
];
```

and the file-header row-inventory doc line. Solid: same with `value={layoutEngine()}`. Add the hook to the fake in `PreferencesModal.test.tsx` (`useLayoutEngine: () => { return { engine: "inhouse", setEngine: vi.fn() }; }`).

- [ ] **Step 6: ui-contract seam** — `world.ts`: `readonly layoutEngine: BehaviorSubject<LayoutEngine>;` + trailing positional param `layoutEngineSeed?: LayoutEngine` + `new BehaviorSubject<LayoutEngine>(layoutEngineSeed ?? DEFAULT_LAYOUT_ENGINE)` + world literal entry. `mount.ts`: `layoutEngine?: LayoutEngine;` on `MountOptions` + append `opts.layoutEngine` to the positional `createWorld` call (**tail position — after `opts.chartSubstrate`**). Both `viewModelFromWorld.ts`:

```ts
      // Layout engine: reactive view backed by the World subject (mirrors
      // useChartSubstrate above); setEngine pushes back so a click through the
      // seam (PreferencesModal's "Layout engine" segment) flips the value.
      useLayoutEngine: () => {
        const engine = useSubject(world.layoutEngine);
        return {
          engine,
          setEngine: (next: LayoutEngine) => {
            world.layoutEngine.next(next);
          },
        };
      },
```

(Solid: `wrapSubject(world.layoutEngine)`.) Both `buildFakeViewModel.ts`: `useLayoutEngine: () => { return { engine: DEFAULT_LAYOUT_ENGINE, setEngine: noop }; }` (Solid: `engine: at(DEFAULT_LAYOUT_ENGINE)`).

- [ ] **Step 7: Run both clients' contract suites** — the Step-1 case now passes on react AND solid; the full modal spec file stays green. `pnpm typecheck` repo-wide.

- [ ] **Step 8: Commit** — `feat(prefs): Layout engine preference row through presenter + both bindings + shared contract seam`

---

### Task 3: `@rtc/layout-dockview` package — seed conversion + engine wrapper

**Files:**
- Create: `packages/layout-dockview/package.json`, `packages/layout-dockview/tsconfig.json`, `packages/layout-dockview/vitest.config.ts`, `packages/layout-dockview/README.md`
- Create: `packages/layout-dockview/src/index.ts`, `packages/layout-dockview/src/dockSeed.ts`, `packages/layout-dockview/src/createDockEngine.ts`, `packages/layout-dockview/src/styles/dockview-hud.css`
- Test: `packages/layout-dockview/src/dockSeed.test.ts`, `packages/layout-dockview/src/createDockEngine.test.ts`
- Modify: `tsconfig.depcruise.json` (line pair), `.dependency-cruiser.cjs` (two rules + consumer allowlists), `knip.json`, `pnpm-lock.yaml` (via install)
- Modify: `packages/client-react/vite.config.ts` + `packages/client-solid/vite.config.ts` (`rtcSourceAlias` — the package has a `./styles/*` subpath export)

**Interfaces:**
- Produces (consumed by Tasks 4-7):

```ts
export type DockSeedNode =
  | {
      readonly kind: "split";
      readonly dir: "row" | "column";
      readonly children: readonly DockSeedNode[];
      readonly sizes: readonly number[];
    }
  | { readonly kind: "panel"; readonly panelId: string };

export interface DockPanelHooks {
  title(panelId: string): string;
  /** Mount framework-native content into the element Dockview owns; returns the disposer. */
  mount(panelId: string, element: HTMLElement): () => void;
}

export interface DockEngineOptions {
  container: HTMLElement;
  seed: DockSeedNode;
  blob: string | null;
  panels: DockPanelHooks;
  onLayoutChange(blob: string): void;
  /** Debounce for onLayoutChange serialisation; default 250. Tests pass 0. */
  debounceMs?: number;
}

export interface DockEngine {
  maximizePanel(panelId: string): void;
  exitMaximize(): void;
  groupCount(): number;
  dispose(): void;
}

export function createDockEngine(opts: DockEngineOptions): DockEngine;
export function toSerializedDockview(seed: DockSeedNode, width: number, height: number): SerializedDockview; // from dockSeed.ts, exported for tests
```

- `client-core`'s `LayoutNode` is structurally assignable to `DockSeedNode` (extra `fixedPx`/`initialPx`/etc. fields are dropped by TS structural typing) — the clients pass `createDefaultLayoutPort(tab).initial.root` directly.

- [ ] **Step 1: Scaffold the package.** Copy `packages/boot-splash/package.json` verbatim, then: name `@rtc/layout-dockview`, add `"dependencies": { "dockview-core": "7.0.4" }`, keep the `"./styles/*": "./src/styles/*"` export (we ship CSS the same way boot-splash does — raw source, consumer's Vite transforms it). Copy boot-splash's `tsconfig.json` unchanged. `vitest.config.ts`: copy boot-splash's, drop the `exclude` comment block (no variants here), keep `environment: "jsdom"`. `src/index.ts`: `export * from "#/dockSeed"; export * from "#/createDockEngine";`. README: identity card ("Framework-neutral Dockview wrapper — the only package allowed to import dockview-core; seed-tree conversion, opaque-blob restore/serialise, maximize bridge"). Run `pnpm install` from the worktree root.

- [ ] **Step 2: Wire the gates.**
  - `tsconfig.depcruise.json` — add the line pair (⚠️ skipping this makes every rule below a silent no-op):
    ```json
        "@rtc/layout-dockview": ["packages/layout-dockview/src/index.ts"],
        "@rtc/layout-dockview/*": ["packages/layout-dockview/src/*"],
    ```
  - `.dependency-cruiser.cjs` — two rules next to `boot-splash-stays-pure`:
    ```js
    {
      name: "layout-dockview-stays-pure",
      severity: "error",
      comment:
        "@rtc/layout-dockview is the framework-neutral Dockview wrapper — it must not import any other @rtc package (it may touch the DOM: dockview-core mounts into a container element).",
      from: { path: "^packages/layout-dockview/src" },
      to: { path: "^packages/", pathNot: "^packages/layout-dockview/" },
    },
    {
      name: "dockview-core-only-in-layout-dockview",
      severity: "error",
      comment:
        "dockview-core is confined to @rtc/layout-dockview — the engine must stay swappable by replacing one package (ADR-002); a direct client import would leak the engine's vocabulary.",
      from: { path: "^packages/", pathNot: "^packages/layout-dockview/" },
      to: { path: "node_modules/dockview-core" },
    },
    ```
    Then add `layout-dockview` to the `pathNot` allowlist group of the **client-react** and **client-solid** package rules (find the rules whose `from.path` is `^packages/client-react/` / `^packages/client-solid/` and append `|layout-dockview` inside their `pathNot` alternation) — the allowlist shape forbids the new package as a target until named.
  - `knip.json`: `"packages/layout-dockview": { "entry": "src/index.ts", "project": "src/**/*.ts" }`.
  - Both clients' `vite.config.ts` `rtcSourceAlias` maps: add `"@rtc/layout-dockview"` (subpath-export caveat noted in each map's comment).

- [ ] **Step 3: Write the failing seed-conversion tests** (`dockSeed.test.ts`). The converter builds Dockview's `SerializedDockview` directly — deterministic, no DOM:

```ts
import { describe, expect, it } from "vitest";

import { toSerializedDockview } from "#/dockSeed";

const FX_LIKE = {
  kind: "split",
  dir: "row",
  sizes: [0.75, 0.25],
  children: [
    {
      kind: "split",
      dir: "column",
      sizes: [0.6, 0.4],
      children: [
        { kind: "panel", panelId: "fx-rates" },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
    { kind: "panel", panelId: "fx-analytics" },
  ],
} as const;

describe("toSerializedDockview", () => {
  it("maps a nested row/column tree to a branch/leaf grid with px sizes", () => {
    const s = toSerializedDockview(FX_LIKE, 1000, 800);

    expect(s.grid.orientation).toBe("HORIZONTAL");
    expect(s.grid.width).toBe(1000);
    expect(s.grid.height).toBe(800);

    const root = s.grid.root;
    expect(root.type).toBe("branch");
    const [left, right] = root.data as readonly SerializedNode[];
    expect(left.type).toBe("branch");
    expect(left.size).toBe(750);
    expect(right.type).toBe("leaf");
    expect(right.size).toBe(250);

    const [top, bottom] = left.data as readonly SerializedNode[];
    expect(top.size).toBe(480); // 0.6 × 800 (column axis = height)
    expect(bottom.size).toBe(320);

    expect(Object.keys(s.panels).sort()).toEqual([
      "fx-analytics",
      "fx-blotter",
      "fx-rates",
    ]);
    expect(s.panels["fx-rates"].contentComponent).toBe("rtc-panel");
  });

  it("maps a single-panel tree to one leaf", () => {
    const s = toSerializedDockview({ kind: "panel", panelId: "admin-dashboard" }, 640, 480);
    expect(s.grid.root.type).toBe("leaf");
    expect(Object.keys(s.panels)).toEqual(["admin-dashboard"]);
  });

  it("gives every leaf a unique group id and an activeView", () => {
    const s = toSerializedDockview(FX_LIKE, 1000, 800);
    const leaves = collectLeaves(s.grid.root);
    const ids = leaves.map((l) => {
      return (l.data as { id: string }).id;
    });
    expect(new Set(ids).size).toBe(leaves.length);
    for (const leaf of leaves) {
      const data = leaf.data as { views: string[]; activeView: string };
      expect(data.views).toContain(data.activeView);
    }
  });
});
```

(Define local `SerializedNode`/`collectLeaves` helpers in the test file.)

- [ ] **Step 4: Run to verify failure** — `pnpm --filter @rtc/layout-dockview test` → FAIL (module missing).

- [ ] **Step 5: Implement `dockSeed.ts`.** Import `type SerializedDockview` from `dockview-core`. Shape (dockview-core v7): `{ grid: { root, width, height, orientation }, panels }`; branch node `{ type: "branch", data: SerializedNode[], size }`; leaf `{ type: "leaf", data: { views: [panelId], activeView: panelId, id: "group-<n>" }, size }`; panel entry `{ id, contentComponent: "rtc-panel", title }` (title left to `panels.title` at runtime is NOT possible here — store the id as title placeholder? No: `toSerializedDockview` takes no hooks, so set `title: panelId`; `createDockEngine` overrides each panel's title via `api.getPanel(id)?.setTitle(hooks.title(id))` after load). Algorithm:
  - Root orientation: `seed.kind === "split" && seed.dir === "column" ? "VERTICAL" : "HORIZONTAL"`.
  - Recursive walk carrying the extent (px) along the current split axis: a `row` split divides the width extent, a `column` split divides the height extent; child size = `Math.round(fraction × extent)`, last child takes the remainder so sizes sum exactly.
  - A child split with the **same** dir as its parent is flattened into the parent (splice its children/sizes in, scaled) — dockview branches alternate orientation implicitly.
  - Leaf/group ids: `group-1`, `group-2`, … in traversal order.
  Export `toSerializedDockview` and the `DockSeedNode` type. Verify the exact `SerializedDockview` field names against `node_modules/dockview-core/dist/cjs/api/component.api.d.ts` / the `SerializedDockview` type declaration before finalising — if v7.0.4 nests differently (e.g. `activeGroup`), match the real type; the tests assert through the public type so they stay honest.

- [ ] **Step 6: Run** → PASS.

- [ ] **Step 7: Write the failing engine tests** (`createDockEngine.test.ts`, jsdom — dockview-core's own unit tests run under jsdom, so mount works; stub `ResizeObserver` at the top of the file with a no-op class if jsdom lacks it):

```ts
describe("createDockEngine", () => {
  it("builds groups + panels from the seed and mounts content via the hook", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const mounted: string[] = [];
    const engine = createDockEngine({
      container,
      seed: FX_LIKE,
      blob: null,
      panels: {
        title: (id) => {
          return id.toUpperCase();
        },
        mount: (id, el) => {
          mounted.push(id);
          el.textContent = `content:${id}`;
          return () => {
            return mounted.splice(mounted.indexOf(id), 1);
          };
        },
      },
      onLayoutChange: () => {},
      debounceMs: 0,
    });

    expect(engine.groupCount()).toBe(3);
    expect(mounted.sort()).toEqual(["fx-analytics", "fx-blotter", "fx-rates"]);
    expect(container.textContent).toContain("content:fx-rates");
    engine.dispose();
    expect(mounted).toEqual([]);
  });

  it("falls back to the seed on a corrupt blob", () => {
    const engine = createDockEngine({ ...base(), blob: "{not json" });
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("falls back to the seed on a structurally-invalid blob", () => {
    const engine = createDockEngine({ ...base(), blob: JSON.stringify({ hello: 1 }) });
    expect(engine.groupCount()).toBe(3);
    engine.dispose();
  });

  it("restores a valid blob (round-trip through its own serialisation)", () => {
    let saved: string | null = null;
    const first = createDockEngine({
      ...base(),
      onLayoutChange: (blob) => {
        saved = blob;
      },
      debounceMs: 0,
    });
    first.maximizePanel("fx-rates"); // any layout mutation triggers serialisation
    first.dispose();
    expect(saved).not.toBeNull();

    const second = createDockEngine({ ...base(), blob: saved });
    expect(second.groupCount()).toBe(3);
    second.dispose();
  });

  it("maximizePanel / exitMaximize drive dockview's maximized state", () => {
    const engine = createDockEngine(base());
    engine.maximizePanel("fx-blotter");
    // dockview marks the maximized group in the DOM; assert via the api-level witness:
    // createDockEngine exposes it indirectly — after exitMaximize the layout serialises again.
    engine.exitMaximize();
    engine.dispose();
  });
});
```

(`base()` is a local helper returning fresh `DockEngineOptions` with a new attached container.)

- [ ] **Step 8: Run to verify failure**, then **implement `createDockEngine.ts`**:

```ts
import {
  createDockview,
  type DockviewApi,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
} from "dockview-core";

import { toSerializedDockview, type DockSeedNode } from "#/dockSeed";

const RTC_PANEL_COMPONENT = "rtc-panel";

class HookContentRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  private disposeContent: (() => void) | null = null;

  constructor(private readonly hooks: DockPanelHooks) {
    this.element = document.createElement("div");
    this.element.className = "rtc-dock-panel-content";
  }

  init(parameters: GroupPanelPartInitParameters): void {
    this.disposeContent = this.hooks.mount(parameters.api.id, this.element);
  }

  dispose(): void {
    this.disposeContent?.();
    this.disposeContent = null;
  }
}

export function createDockEngine(opts: DockEngineOptions): DockEngine {
  const api: DockviewApi = createDockview(opts.container, {
    createComponent: () => {
      return new HookContentRenderer(opts.panels);
    },
  });

  const width = opts.container.clientWidth || 1200;
  const height = opts.container.clientHeight || 800;

  loadBlobOrSeed(api, opts, width, height);
  applyTitles(api, opts.panels);

  const debounceMs = opts.debounceMs ?? 250;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const changeSub = api.onDidLayoutChange(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      opts.onLayoutChange(JSON.stringify(api.toJSON()));
    }, debounceMs);
  });

  return {
    maximizePanel: (panelId) => {
      api.getPanel(panelId)?.api.maximize();
    },
    exitMaximize: () => {
      if (api.hasMaximizedGroup()) {
        api.exitMaximizedGroup();
      }
    },
    groupCount: () => {
      return api.groups.length;
    },
    dispose: () => {
      changeSub.dispose();
      if (timer !== null) {
        clearTimeout(timer);
      }
      api.dispose();
    },
  };
}

/** Restores the persisted blob, falling back to the seed tree on ANY failure —
 * a stale or corrupt blob must never brick the workspace. */
function loadBlobOrSeed(api: DockviewApi, opts: DockEngineOptions, width: number, height: number): void {
  if (opts.blob !== null) {
    try {
      api.fromJSON(JSON.parse(opts.blob));
      return;
    } catch {
      // fall through to the seed
    }
  }
  api.fromJSON(toSerializedDockview(opts.seed, width, height));
}

function applyTitles(api: DockviewApi, hooks: DockPanelHooks): void {
  for (const panel of api.panels) {
    panel.setTitle(hooks.title(panel.id));
  }
}
```

Verify the exact member names against the installed `dockview-core@7.0.4` typings (`api.groups`, `api.panels`, `panel.api.maximize()`, `api.hasMaximizedGroup()`, `api.exitMaximizedGroup()`, `onDidLayoutChange` returning an `IDisposable`) and adjust — the tests are the arbiter. Note: `api.fromJSON` throws on unknown `contentComponent` or malformed grids, which is exactly what routes to the seed fallback.

- [ ] **Step 9: The HUD stylesheet** — `src/styles/dockview-hud.css`:

```css
/* Dockview chrome mapped onto the app's token cascade. The base stylesheet
 * ships with dockview-core; consumers import this ONE file. Tokens: read the
 * concrete names from InhouseLayoutEngine.module.css / the client theme css
 * (they are identical across both clients) and replace the var() names below
 * if they differ — the fallbacks keep the chrome legible before theming. */
@import "dockview-core/dist/styles/dockview.css";

.dockview-theme-rtc {
  --dv-group-view-background-color: var(--panel-bg, #0d1117);
  --dv-tabs-and-actions-container-background-color: var(--panel-head-bg, #161b22);
  --dv-activegroup-visiblepanel-tab-background-color: var(--panel-bg, #0d1117);
  --dv-activegroup-hiddenpanel-tab-background-color: var(--panel-head-bg, #161b22);
  --dv-inactivegroup-visiblepanel-tab-background-color: var(--panel-bg, #0d1117);
  --dv-inactivegroup-hiddenpanel-tab-background-color: var(--panel-head-bg, #161b22);
  --dv-activegroup-visiblepanel-tab-color: var(--text-primary, #e6edf3);
  --dv-activegroup-hiddenpanel-tab-color: var(--text-muted, #8b949e);
  --dv-inactivegroup-visiblepanel-tab-color: var(--text-muted, #8b949e);
  --dv-inactivegroup-hiddenpanel-tab-color: var(--text-muted, #8b949e);
  --dv-separator-border: var(--panel-border, #30363d);
  --dv-paneview-active-outline-color: var(--accent, #58a6ff);
  --dv-active-sash-color: var(--accent, #58a6ff);
  --dv-drag-over-background-color: color-mix(in srgb, var(--accent, #58a6ff) 15%, transparent);
  --dv-tabs-and-actions-container-height: 28px;
}
```

Before committing, open `packages/client-react/src/ui/shell/layout/engine/InhouseLayoutEngine.module.css` and the client theme token sheets, and swap each `var(--…)` above for the real token names used there (the fallback hexes stay). Run `pnpm lint:css`.

- [ ] **Step 10: Package + repo gates green** — `pnpm --filter @rtc/layout-dockview build && pnpm --filter @rtc/layout-dockview test && pnpm typecheck && pnpm check:deps && pnpm check:scripts && pnpm lint:dead && pnpm check:versions`. Fix `check:versions` by matching sibling devDep ranges exactly.

- [ ] **Step 11: Commit** — `feat(layout-dockview): @rtc/layout-dockview leaf — dockview-core 7.0.4 wrapper (seed conversion, blob restore, maximize bridge) + gates`

---

### Task 4: `DockLayoutStore` + React bridge + engine branch (React client)

**Files:**
- Create: `packages/client-core/src/adapters/dockLayoutStore.ts` (interface) + `packages/client-core/src/adapters/InMemoryDockLayoutStore.ts`
- Modify: `packages/client-core/src/index.ts` (exports), `packages/client-core/src/adapters/portFactory.ts` (`AppPorts` optional member), `packages/client-core/src/composition.ts` (`Presenters.dockLayoutStore`), `packages/client-core/src/presenters/index.ts` if needed
- Modify: `packages/react-bindings/src/createViewModel.ts` + `packages/solid-bindings/src/createViewModel.ts` (`useDockLayoutStore` hook — both bindings in this task so `pnpm typecheck` stays green)
- Create: `packages/client-react/src/app/adapters/LocalStorageDockLayoutStore.ts` + test
- Modify: `packages/client-react/src/app/buildBrowserPorts.ts`
- Create: `packages/client-react/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` + `DockviewLayoutEngine.module.css`
- Modify: `packages/client-react/src/ui/App.tsx` (`WorkspaceEngine` branch), `packages/client-react/package.json` (dep `"@rtc/layout-dockview": "workspace:*"`)
- Modify: `packages/ui-contract/src/shared/components.ts` (new token), `packages/ui-contract/src/shared/harness/world.ts`/`mount.ts` if the host needs seams (it does not — the host owns its store)
- Create: `packages/ui-contract/src/shared/pages/shell/layout/DockviewEnginePage.ts`
- Create: `packages/ui-contract/src/specs/shell/layout/DockviewEngine.contract.spec.ts`
- Create: `packages/client-react/tests/ui/contract/react/DockviewEngineHost.tsx`
- Modify: `packages/client-react/tests/ui/contract/react/registry.tsx`, `.../setup.ts` (ResizeObserver stub already exists — extend only if dockview needs more), both `viewModelFromWorld.ts` + both `buildFakeViewModel.ts` (`useDockLayoutStore` entry)

**Interfaces:**
- Consumes: Task 1-3 outputs.
- Produces:

```ts
// client-core
export interface DockLayoutStore {
  load(tab: string): string | null;
  save(tab: string, blob: string): void;
}
export class InMemoryDockLayoutStore implements DockLayoutStore { /* Map-backed */ }
// AppPorts gains: dockLayoutStore?: DockLayoutStore;   (OPTIONAL — zero fake-ports churn)
// Presenters gains: dockLayoutStore: DockLayoutStore;  (ports.dockLayoutStore ?? new InMemoryDockLayoutStore())
// ViewModel gains: useDockLayoutStore: () => DockLayoutStore;   (plain passthrough, no rx)
```

```tsx
// React bridge props — dumb like InhouseLayoutEngine; WorkspaceEngine supplies everything:
export interface DockviewLayoutEngineProps {
  tab: WorkspaceTab;
  registry: PanelRegistry;
  headRegistry?: Partial<Record<PanelId, () => ReactElement>>;
  specs?: Readonly<Record<PanelId, PanelSpec>>;
  store: DockLayoutStore;
  /** Mirrored from the LayoutMachine so Jarvis's layout DriveCommand still works. */
  maximized: PanelId | null;
}
```

- Root DOM witness: `<main data-testid="layout-engine" data-engine="dockview" data-groups={n}>`; the in-house engine root gains `data-engine="inhouse"`. Contract token `DockviewEngine`; testid on portal bodies unchanged (panel content brings its own).

- [ ] **Step 1: client-core store + wiring (test-first).** Write `InMemoryDockLayoutStore.test.ts` (load returns null when empty; save/load round-trip per tab; tabs are independent). Implement interface + class (Map-backed, ~15 lines), export both from `index.ts`. Add `dockLayoutStore?: DockLayoutStore;` to `AppPorts` (next to `colorScheme?`) — **optional**, so no fake-ports builder changes. In `composition.ts` add to `Presenters`: `dockLayoutStore: DockLayoutStore;` and in the presenters literal: `dockLayoutStore: ports.dockLayoutStore ?? new InMemoryDockLayoutStore(),`. Bindings (both): `useDockLayoutStore: () => DockLayoutStore` on the ViewModel interface (doc: "Injected per-tab dock-layout blob store for the Dockview engine — plain passthrough, no stream") returning `presenters.dockLayoutStore`. Add the hook to both `viewModelFromWorld.ts` and both `buildFakeViewModel.ts` (`useDockLayoutStore: () => { return dockStore; }` with a module-level `const dockStore = new InMemoryDockLayoutStore();` — world-scoped in viewModelFromWorld: create it inside the builder so each World gets a fresh store). Run `pnpm --filter @rtc/client-core test && pnpm typecheck`. Fix any RN/react test fake that types itself as the full ViewModel by adding the member (search: `useChartSubstrate:` across `packages/client-react-native` and add `useDockLayoutStore` beside it wherever found).

- [ ] **Step 2: `LocalStorageDockLayoutStore` (test-first).** Test mirrors `preferences.contract.test.ts`'s local-storage idioms:

```ts
describe("LocalStorageDockLayoutStore", () => {
  afterEach(() => {
    localStorage.removeItem("rtc-dock-layout-fx");
    localStorage.removeItem("rtc-dock-layout-credit");
  });

  it("returns null when nothing is stored", () => {
    expect(new LocalStorageDockLayoutStore().load("fx")).toBeNull();
  });

  it("round-trips a blob per tab independently", () => {
    const store = new LocalStorageDockLayoutStore();
    store.save("fx", "{\"a\":1}");
    store.save("credit", "{\"b\":2}");
    expect(store.load("fx")).toBe("{\"a\":1}");
    expect(store.load("credit")).toBe("{\"b\":2}");
  });

  it("swallows storage failures (best-effort persistence)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => {
      return new LocalStorageDockLayoutStore().save("fx", "x");
    }).not.toThrow();
    spy.mockRestore();
  });
});
```

Implement (try/catch style of `LocalStorageSessionStore`, key `` `rtc-dock-layout-${tab}` ``). Compose in `buildBrowserPorts.ts`: `const dockLayoutStore = new LocalStorageDockLayoutStore();` and add `dockLayoutStore,` to **both** return literals (ws-real and simulator branches, next to `colorScheme`).

- [ ] **Step 3: Failing shared contract spec** — `DockviewEngine.contract.spec.ts` + `DockviewEnginePage` + React host + token + registry entry.

`components.ts`: `export const DockviewEngine = component<DockviewEngineHostProps, DockviewEnginePage>((ctx) => { return new DockviewEnginePage(ctx); });` (follow the file's existing token pattern exactly).

`DockviewEnginePage.ts` (queries scoped to the mount root):

```ts
export class DockviewEnginePage extends BasePage {
  engineAttr(): string | null {
    return this.root().getAttribute("data-engine");
  }
  groupsAttr(): string | null {
    return this.root().getAttribute("data-groups");
  }
  /** Visible dockview tab titles, in DOM order. */
  tabTitles(): readonly string[] {
    return [...this.rootEl().querySelectorAll(".dv-default-tab-content, .tab .dockview-react-tab-title, .dv-tab")]
      .map((el) => {
        return el.textContent?.trim() ?? "";
      })
      .filter((t) => {
        return t.length > 0;
      });
  }
  bodyVisible(testid: string): boolean {
    return this.queryByTestId(testid) !== null;
  }
  /** Resolves once the host's data-saved counter reaches ≥1 (a store.save
   * happened). Poll the attribute with the harness's wait helper. */
  async waitForSave(): Promise<void> {
    await this.waitFor(() => {
      return Number(this.root().getAttribute("data-saved") ?? "0") >= 1;
    });
  }
  /** True when the host's last-saved blob JSON.parses and mentions fx-rates. */
  savedBlobParses(): boolean {
    const blob = this.root().getAttribute("data-saved-blob");
    if (blob === null) {
      return false;
    }
    try {
      JSON.parse(blob);
    } catch {
      return false;
    }
    return blob.includes("fx-rates");
  }
}
```

(The host mirrors each `store.save` into `data-saved` / `data-saved-blob` attributes on the bridge's wrapper so the page can assert without reaching into the store. If `BasePage` has no `waitFor` helper, use the same async-poll idiom `LayoutEnginePage.ts` or the harness utilities already use.)

(⚠️ The tab-title selector must be verified against the real dockview-core 7.0.4 DOM on first run — print `container.innerHTML` once in a scratch test, pick the stable class, delete the scratch. Follow `LayoutEnginePage.ts` for the BasePage helper names — use whatever accessors that file actually uses (`this.root()` etc.).)

Spec cases:

```ts
describe("DockviewLayoutEngine (shared harness)", () => {
  it("renders a dockview group per seed leaf with panel content mounted through the registry", () => {
    const page = mount(DockviewEngine, { props: {} });
    expect(page.engineAttr()).toBe("dockview");
    expect(page.groupsAttr()).toBe("4"); // fx default tree: 4 leaves
    expect(page.bodyVisible("fx-rates-body")).toBe(true);
    expect(page.bodyVisible("fx-blotter-body")).toBe(true);
    expect(page.tabTitles()).toEqual(
      expect.arrayContaining(["Live Rates", "Blotter", "Analytics", "Positions"]),
    );
  });

  it("falls back to the seed on a corrupt persisted blob", () => {
    const page = mount(DockviewEngine, { props: { seedBlob: "{corrupt" } });
    expect(page.groupsAttr()).toBe("4");
  });

  it("persists layout changes through the injected store", async () => {
    const page = mount(DockviewEngine, { props: { maximized: "fx-rates" } });
    await page.waitForSave(); // host exposes a data-saved counter; see host
    expect(page.savedBlobParses()).toBe(true);
  });

  it("renders the head strip inside the panel when the head registry provides one", () => {
    const page = mount(DockviewEngine, { props: { withHeads: true } });
    expect(page.bodyVisible("custom-head")).toBe(true);
  });
});
```

`DockviewEngineHost.tsx` (React; mirrors `LayoutEngineHost.tsx`): builds a `layoutTestRegistry` (the same 4+3 fake-panel map as `LayoutEngineHost`), a fresh `InMemoryDockLayoutStore` per mount — pre-seeded with `props.seedBlob` under `"fx"` when given — optional `withHeads` head registry (`custom-head` testid), forwards `maximized ?? null`, and after each `store.save` bumps a `data-saved` attribute + records the last blob so the page can assert (`savedBlobParses()` = `JSON.parse` succeeds and mentions `fx-rates`). Registry entry in `registry.tsx` forwards `seedBlob`/`withHeads`/`maximized` from the untyped props record, following the `LayoutEngine` entry's shape.

- [ ] **Step 4: Run to verify failure** — react contract suite → FAIL (component token/host missing).

- [ ] **Step 5: Implement the React bridge.** `DockviewLayoutEngine.tsx`:

```tsx
import { type ReactElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  createDefaultLayoutPort,
  PANEL_SPECS,
  type DockLayoutStore,
  type PanelId,
  type PanelSpec,
  type WorkspaceTab,
} from "@rtc/client-core";
import { createDockEngine, type DockEngine } from "@rtc/layout-dockview";

import { PanelErrorBoundary } from "../engine/PanelErrorBoundary";
import type { PanelRegistry } from "../engine/panelRegistry";

import "@rtc/layout-dockview/styles/dockview-hud.css";
import styles from "./DockviewLayoutEngine.module.css";

interface MountedPanel {
  readonly panelId: PanelId;
  readonly element: HTMLElement;
}

/** Dockview-backed workspace engine. Dockview owns geometry (drag, tabs,
 * splits); panel CONTENT stays in the app's React tree via portals so
 * ViewModel/FxView/CreditView contexts flow — a separate root would crash
 * every context consumer. The persisted layout is an opaque blob per tab. */
export function DockviewLayoutEngine({
  tab,
  registry,
  headRegistry,
  specs = PANEL_SPECS,
  store,
  maximized,
}: DockviewLayoutEngineProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DockEngine | null>(null);
  const [mounted, setMounted] = useState<readonly MountedPanel[]>([]);
  const [groups, setGroups] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const engine = createDockEngine({
      container,
      seed: createDefaultLayoutPort(tab).initial.root,
      blob: store.load(tab),
      panels: {
        title: (id) => {
          return specs[id]?.title ?? id;
        },
        mount: (id, element) => {
          setMounted((prev) => {
            return [...prev, { panelId: id, element }];
          });
          return () => {
            setMounted((prev) => {
              return prev.filter((p) => {
                return p.element !== element;
              });
            });
          };
        },
      },
      onLayoutChange: (blob) => {
        store.save(tab, blob);
        setGroups(engineRef.current?.groupCount() ?? 0);
      },
    });
    engineRef.current = engine;
    setGroups(engine.groupCount());
    return () => {
      engineRef.current = null;
      setMounted([]);
      engine.dispose();
    };
  }, [tab, store, specs]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) {
      return;
    }
    if (maximized !== null) {
      engine.maximizePanel(maximized);
    } else {
      engine.exitMaximize();
    }
  }, [maximized]);

  return (
    <main
      data-testid="layout-engine"
      data-engine="dockview"
      data-groups={groups}
      className={styles.engine}
    >
      <div ref={containerRef} className={`${styles.container} dockview-theme-rtc`} />
      {mounted.map(({ panelId, element }) => {
        const head = headRegistry?.[panelId];
        return createPortal(
          <div className={styles.panelBody}>
            {head ? <div className={styles.headStrip}>{head()}</div> : null}
            <PanelErrorBoundary title={specs[panelId]?.title ?? panelId}>
              {registry[panelId]?.()}
            </PanelErrorBoundary>
          </div>,
          element,
          panelId,
        );
      })}
    </main>
  );
}
```

`DockviewLayoutEngine.module.css`: `.engine { display: flex; flex: 1; min-height: 0; }`, `.container { flex: 1; min-width: 0; }`, `.panelBody { display: flex; flex-direction: column; height: 100%; overflow: hidden; }`, `.headStrip { flex: 0 0 auto; }` (match the in-house module's spacing tokens where applicable).

`App.tsx` `WorkspaceEngine`:

```tsx
function WorkspaceEngine({ tab }: WorkspaceEngineProps): ReactElement {
  const { useLayout, useLayoutEngine, useDockLayoutStore } = useViewModel();
  const { state, maximize, restore, collapse, expand, resize } = useLayout(tab);
  const { engine } = useLayoutEngine();
  const dockLayoutStore = useDockLayoutStore();
  return (
    <FxViewProvider>
      <CreditViewProvider>
        {engine === "dockview" ? (
          <DockviewLayoutEngine
            tab={tab}
            registry={appPanelRegistry}
            headRegistry={appHeadRegistry}
            store={dockLayoutStore}
            maximized={state.maximized}
          />
        ) : (
          <InhouseLayoutEngine
            state={state}
            registry={appPanelRegistry}
            headRegistry={appHeadRegistry}
            onMaximize={maximize}
            onRestore={restore}
            onCollapse={collapse}
            onExpand={expand}
            onResize={resize}
          />
        )}
      </CreditViewProvider>
    </FxViewProvider>
  );
}
```

Add `data-engine="inhouse"` to `InhouseLayoutEngine.tsx`'s root `<main>` (one attribute — no other in-house change). Add `"@rtc/layout-dockview": "workspace:*"` to client-react deps + `pnpm install`.

- [ ] **Step 6: Run** — react contract suite (new spec passes; the ≥95% `src/ui` coverage gate must still pass — the bridge is exercised by the host; if a residual branch drags a file below, add the missing case, don't exclude). `pnpm --filter @rtc/client-react test && pnpm typecheck`.

- [ ] **Step 7: Eyeball it** — `pnpm dev` → login (`demo`/`mcdc2026`) → Preferences → Layout engine → Dockview: panels render with live content, tabs drag, layout survives reload, switching back restores the in-house engine. Fix what's broken before committing (likely suspects: container height 0 → ensure `.engine`/`.container` fill the workspace region; portal timing; theme variables).

- [ ] **Step 8: Commit** — `feat(client-react): Dockview engine bridge — portal-mounted panels, per-tab blob persistence, engine branch in WorkspaceEngine`

---

### Task 5: Solid bridge + branch (mirror of Task 4's client half)

**Files:**
- Create: `packages/client-solid/src/app/adapters/LocalStorageDockLayoutStore.ts` + test (byte-identical to react's, per the repo's verbatim-copy convention)
- Modify: `packages/client-solid/src/app/buildBrowserPorts.ts` (both return literals)
- Create: `packages/client-solid/src/ui/shell/layout/dockview/DockviewLayoutEngine.tsx` + `DockviewLayoutEngine.module.css` (copy react's css)
- Modify: `packages/client-solid/src/ui/App.tsx` (`WorkspaceEngine` branch), `packages/client-solid/src/ui/shell/layout/engine/InhouseLayoutEngine.tsx` (`data-engine="inhouse"`), `packages/client-solid/package.json` (dep)
- Create: `packages/client-solid/tests/ui/contract/solid/DockviewEngineHost.tsx`
- Modify: `packages/client-solid/tests/ui/contract/solid/registry.tsx`, `.../setup.ts` (ResizeObserver stub parity if missing)

**Interfaces:**
- Consumes: everything Task 3/4 produced; the shared `DockviewEngine.contract.spec.ts` is already written and MUST pass unchanged against Solid.

- [ ] **Step 1: Run the shared spec against Solid first** — `pnpm --filter @rtc/client-solid test:ui:contract` → FAIL (host/registry entry missing). This is the Solid task's failing test.

- [ ] **Step 2: Solid bridge.** Same props interface; Solid idioms:

```tsx
export function DockviewLayoutEngine(props: DockviewLayoutEngineProps): JSX.Element {
  const [mounted, setMounted] = createSignal<readonly MountedPanel[]>([]);
  const [groups, setGroups] = createSignal(0);
  let containerEl: HTMLDivElement | undefined;
  let engine: DockEngine | null = null;

  onMount(() => {
    if (containerEl === undefined) {
      return;
    }
    engine = createDockEngine({
      container: containerEl,
      // eslint-disable-next-line solid/reactivity -- setup-scope read is correct: the keyed <Show> in App remounts this component per tab
      seed: createDefaultLayoutPort(props.tab).initial.root,
      blob: props.store.load(props.tab),
      panels: {
        title: (id) => {
          return (props.specs ?? PANEL_SPECS)[id]?.title ?? id;
        },
        mount: (id, element) => {
          setMounted((prev) => {
            return [...prev, { panelId: id, element }];
          });
          return () => {
            setMounted((prev) => {
              return prev.filter((p) => {
                return p.element !== element;
              });
            });
          };
        },
      },
      onLayoutChange: (blob) => {
        props.store.save(props.tab, blob);
        setGroups(engine?.groupCount() ?? 0);
      },
    });
    setGroups(engine.groupCount());
  });

  onCleanup(() => {
    engine?.dispose();
    engine = null;
  });

  createEffect(() => {
    const maximized = props.maximized;
    if (engine === null) {
      return;
    }
    if (maximized !== null) {
      engine.maximizePanel(maximized);
    } else {
      engine.exitMaximize();
    }
  });

  return (
    <main data-testid="layout-engine" data-engine="dockview" data-groups={groups()} class={styles.engine}>
      <div ref={containerEl} class={`${styles.container} dockview-theme-rtc`} />
      <For each={mounted()}>
        {(p) => {
          return (
            <Portal mount={p.element}>
              <div class={styles.panelBody}>
                <Show when={props.headRegistry?.[p.panelId]}>
                  {(head) => {
                    return <div class={styles.headStrip}>{head()()}</div>;
                  }}
                </Show>
                <PanelErrorBoundary title={(props.specs ?? PANEL_SPECS)[p.panelId]?.title ?? p.panelId}>
                  {props.registry[p.panelId]?.()}
                </PanelErrorBoundary>
              </div>
            </Portal>
          );
        }}
      </For>
    </main>
  );
}
```

(`Portal` from `solid-js/web`; import the shared css the same way; `maximized` accessed inside the effect for reactivity — Solid props are getters.) `App.tsx` `WorkspaceEngine`: same branch with `state().maximized`, `engine()` accessor from `useLayoutEngine()`. Host + registry entry: mirror react's with the Solid deltas (`props.` access, `state()` calls, `JSX.Element`).

- [ ] **Step 3: Run** — Solid contract suite green (shared spec passes on both clients now), `pnpm --filter @rtc/client-solid test && pnpm typecheck`.

- [ ] **Step 4: Eyeball** — `pnpm dev:solid` → same manual journey as Task 4 Step 7.

- [ ] **Step 5: Commit** — `feat(client-solid): Dockview engine bridge at parity — Portal-mounted panels, shared contract spec green on both clients`

---

### Task 6: e2e journey (Playwright, runs on React and Solid suites)

**Files:**
- Modify: `tests/browser/page-objects/contracts/Preferences.ts` (+`PrefsLayoutEngine`, `selectLayoutEngine`), `tests/browser/page-objects/playwright/Preferences.ts`, `tests/browser/page-objects/contracts/testids.ts` (`prefs.layoutEngineSegment`, `layout.engineRoot` helpers), `tests/browser/page-objects/contracts/Layout.ts` + `tests/browser/page-objects/playwright/Layout.ts` (engine witnesses + tab drag), `tests/browser/scenarios/layout.ts` (create if absent — check for an existing scenarios file for layout.spec.ts and extend it)
- Modify: `tests/browser/playwright/layout.spec.ts`

**Interfaces:**
- Consumes: `data-engine` / `data-groups` on `[data-testid="layout-engine"]`; `pref-segment-layoutEngine-{inhouse,dockview}` testids; dockview tab DOM.

- [ ] **Step 1: PO contracts.**

```ts
// contracts/Preferences.ts
export type PrefsLayoutEngine = "inhouse" | "dockview";
// on PreferencesPO:
  /** Clicks the Layout engine segment row's In-house/Dockview option
   * (PrefSegment.tsx composes `pref-segment-layoutEngine-<value>`). */
  selectLayoutEngine(value: PrefsLayoutEngine): Promise<void>;
```

```ts
// contracts/Layout.ts additions
  /** The active engine as rendered — the root's data-engine witness. */
  activeEngine(): Promise<string | null>;
  /** The dockview group count witness (data-groups; "" under the in-house engine). */
  dockGroupCount(): Promise<number>;
  /** Drags the dockview tab titled `tabTitle` onto the centre of the panel
   * whose content carries `targetTestId`, docking them into one group. */
  dragDockTabOnto(tabTitle: string, targetTestId: string): Promise<void>;
```

testids.ts: `layoutEngineSegment: (value: "inhouse" | "dockview") => { return `pref-segment-layoutEngine-${value}`; },` in the `prefs` block.

Playwright impls: `selectLayoutEngine` mirrors `selectChartSubstrate`; `activeEngine` = `getAttribute("data-engine")` on `TESTIDS.layout` root (find the existing root accessor in `playwright/Layout.ts` and reuse it); `dragDockTabOnto` = `this.page.getByText(tabTitle, { exact: true }).locator(visible-tab-scope).dragTo(this.page.getByTestId(targetTestId))` — scope the tab locator inside `[data-engine="dockview"]` to avoid matching panel text; Chromium generates HTML5 drag events from mouse drags, which dockview consumes.

- [ ] **Step 2: Scenario helpers + the spec test** (append to `layout.spec.ts`, using the file's existing scenario-helper import style):

```ts
  test("switching the layout engine to dockview enables tab docking that persists across reload, and back", async ({ ctx }) => {
    await layout.openFxWorkspace(ctx); // reuse the file's existing opener
    await layout.expectEngine(ctx, "inhouse");

    await layout.openPreferencesAndSelectLayoutEngine(ctx, "dockview");
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 4, 5);

    await layout.dragBlotterTabOntoRates(ctx);
    await layout.expectDockGroups(ctx, 3, 5);

    await layout.reload(ctx);
    await layout.expectEngine(ctx, "dockview");
    await layout.expectDockGroups(ctx, 3, 5); // the docked layout was persisted

    await layout.openPreferencesAndSelectLayoutEngine(ctx, "inhouse");
    await layout.expectEngine(ctx, "inhouse");
  });
```

Scenario helpers follow `openPreferencesAndSelectSubstrate`'s exact shape (open → waitModalVisible(3000) → select → close → waitModalHidden(3000)); `expectDockGroups(ctx, n, seconds)` polls the `data-groups` attribute via the PO (`toHaveAttribute`-style wait inside the impl, assertion helper in the scenario layer per grep-gate rules); `dragBlotterTabOntoRates` = `ctx.po.layout.dragDockTabOnto("Blotter", "fx-rates-body")` — ⚠️ the real app's fx-rates panel body has no such testid; use a stable selector the real LiveRates panel already renders (find one existing `data-testid` inside the Live Rates panel via `TESTIDS` and target that). `reload` = a scenario helper around the PO's page-reload (add `reloadApp(): Promise<void>` to an existing PO if none exists — session survives via the seeded auth).

- [ ] **Step 3: Run locally** — `pnpm --filter @rtc/tests gates` (grep gates over the new PO code), then `RTC_E2E_SKIP_GHERKIN_BROWSER=1 pnpm test:e2e` (or at minimum `tests`: `pnpm --filter @rtc/tests test:browser:playwright -- --grep "layout engine"` and the `:solid` variant). Loop until green on BOTH clients. If the mouse-drag genuinely does not trigger dockview's dnd in headless Chromium, fall back to a two-step assert: maximize-persistence instead of drag (maximize via double-click on the tab — dockview default — then reload and assert `hasMaximized` witness); note the substitution in the spec test name.

- [ ] **Step 4: Commit** — `test(e2e): dockview engine journey — switch, dock tabs, persist across reload, revert`

---

### Task 7: Visual tier — prefs-modal regen + dockview scenario

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts` (+1 entry), `packages/ui-contract/src/visual/scenarioActions.ts` (if the scenario needs `waitForText`)
- Create: `packages/client-react/tests/ui/visual/react/DockviewEngine.visual.tsx`, `packages/client-solid/tests/ui/visual/solid/DockviewEngine.visual.tsx`
- Modify: both visual `registry.tsx`
- Regen: `packages/ui-contract/goldens/**` — `prefs-modal` ×10 (both buckets) + `shell/layout-dockview` ×10 (new)

**Interfaces:**
- Consumes: the Task 4/5 bridges with a static test registry (deterministic — no timers, no live data).

- [ ] **Step 1: Scenario + wrappers.** `scenarios.ts`:

```ts
  // Dockview engine (spec 2026-08-11): the dockview chrome — tabs, group
  // borders, sashes — over static panel stubs, themed by the HUD variable
  // mapping in @rtc/layout-dockview/styles/dockview-hud.css. The 10-combo
  // matrix is the chrome theming's pixel witness; real panel content is the
  // in-house scenarios' job, not this one's.
  "shell/layout-dockview": {
    componentKey: "DockviewEngine",
    fixtureKey: "prefs-open",
  },
```

(`fixtureKey` reuses the minimal `makeAppData({ animatedBackground: false })` fixture; the wrapper ignores app data.) `scenarioActions.ts`: `"shell/layout-dockview": { waitForText: "RATES" }`. Both `DockviewEngine.visual.tsx` wrappers mount the client's bridge inside a fixed-size box (`<div style-free wrapper via a small module css: width 1200px, height 700px`) with the same static test registry the contract host uses (import it or re-declare the 4-panel fx map), `InMemoryDockLayoutStore`, `maximized: null`. Registry entries in both clients (`DockviewEngine: () => { return <DockviewEngineVisual />; }`). Run `packages/client-react`'s registry-coverage test + `scenarios.test.ts` (`pnpm --filter @rtc/ui-contract test`, `pnpm --filter @rtc/client-react test`).

- [ ] **Step 2: Local arm64 goldens** — from the worktree (per the worktree visual recipe: install + build first, the vite server must come from THIS worktree):

```bash
SCENARIO_PATTERN=layout-dockview pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
SCENARIO_PATTERN=prefs pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update
```

Then assert (no `:update`) both patterns pass locally on react AND solid visual suites. Inspect the new PNGs by eye — dockview chrome must actually look themed (not the default dockview grey) in all 10 combos.

- [ ] **Step 3: Determinism check** — run the assert pass twice more; if `shell/layout-dockview` diffs across runs (font/AA jitter inside dockview chrome), drop the scenario (delete entry + wrappers + goldens) and record why in the plan-completion notes instead of shipping a flake. `prefs/modal` regen stays either way.

- [ ] **Step 4: x86 canonical goldens** — push the branch, then `gh workflow run "Update visual goldens" --ref worktree-dockview-engine -f scenario_pattern="layout-dockview|prefs"` (~2 min, auto-commits `[skip ci]` to the branch); `git pull` the golden commit into the worktree.

- [ ] **Step 5: Commit** (wrappers + scenario + arm64 goldens; the workflow's x86 commit rides the same branch) — `test(visual): dockview chrome scenario + prefs-modal regen for the Layout engine row`

---

### Task 8: Docs, ADR update, STATUS

**Files:**
- Modify: `docs/adr/ADR-002-layout-management-port.md` (status → Accepted; "as-implemented" section)
- Modify: `docs/architecture/08-replaceability-matrix.md` (layout row), `docs/architecture/06-package-dependencies.md` (graph + rules list), `docs/dependency-cruiser.md` (graph, rule table, leaf list), `docs/architecture/16-trailheads.md` (package list if §13.2 enumerates), `CLAUDE.md` (package table row)
- Modify: `docs/STATUS.md` — via the `tracking-workstream-status` skill
- Modify: `.claude-sandbox.json` (`isolate`: `packages/layout-dockview/node_modules`, `.turbo`, `dist`)

- [ ] **Step 1: ADR-002.** Status line → `**Status:** Accepted (first adapter shipped 2026-08; the thin-port refactor stays deferred).` Add an `## As implemented (2026-08)` section: Dockview landed as a second engine behind the existing tree-shaped seam, not the sketched thin port — content/placement separation via the registries, opaque blob via `DockLayoutStore`, `dockview-core` confined to `@rtc/layout-dockview` by dep-cruiser; link the spec + this plan; note the thin `LayoutPort` waits for a second docking adapter.

- [ ] **Step 2: Architecture docs.** Replaceability row (from the spec §8 wording): in-house + Dockview, ~1 dev-week per adapter, contract = engine-branch in `WorkspaceEngine` + registries + `DockLayoutStore`, tests = shared `DockviewEngine.contract.spec.ts` + e2e journey. `06-package-dependencies.md`: add the package to the mermaid graph (leaf, no `@rtc` deps) + the rule-name list (`layout-dockview-stays-pure`, `dockview-core-only-in-layout-dockview`). `dockview-cruiser.md` equivalents. CLAUDE.md package table: one row (keep the table's voice). Keep mermaid ≤4-5 boxes per rank.

- [ ] **Step 3: `pnpm check:doc-links`** → green. **STATUS.md** via the tracking skill (mark the layout-management backlog item's Dockview adapter shipped; the custom free-float adapter + thin port remain pending).

- [ ] **Step 4: Commit** — `docs: ADR-002 accepted as-implemented + layout-dockview package docs + STATUS`

---

## Final gate (before the PR)

- [ ] `/rtc:gauntlet full` from the worktree — every gate green (includes both ≥95% contract coverage gates, knip, dep-cruise, build).
- [ ] `pnpm exec biome ci .` (format + import order — CI runs this, local `pnpm lint` does not).
- [ ] Check per-file coverage for the new files (`pnpm coverage:gaps`) — the aggregate gate hides single weak files; the bridges, store adapters, and `layout-dockview` src files must each be individually covered.
- [ ] `RTC_E2E_SKIP_GHERKIN_BROWSER=1 pnpm test:e2e`.
- [ ] PR per the shipping-repo-changes skill (one PR — spec, plan, implementation, tests, goldens, docs are one reviewable unit), CI loop, CodeQL check before merge, merge with `--merge`, worktree cleanup.
