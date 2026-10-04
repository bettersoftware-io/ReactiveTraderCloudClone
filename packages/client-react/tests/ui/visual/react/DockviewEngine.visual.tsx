import { ATTACHED_FX_BLOB } from "@ui-visual-shared/attachedFxBlob";
import { type ReactElement, useRef } from "react";

import type { DockLayoutStore } from "@rtc/core-api";
import { InMemoryDockLayoutStore } from "@rtc/core-logic";

import { DockviewLayoutEngine } from "#/ui/shell/layout/dockview/DockviewLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

import { FLOATING_FX_BLOB } from "./floatingFxBlob";
import { STACKED_FX_BLOB } from "./stackedFxBlob";

import styles from "./DockviewEngine.visual.module.css";

/**
 * Golden-only wrapper for the Dockview engine bridge (Task 7, spec
 * 2026-08-11-dockview-layout-engine): the dockview chrome — tabs, group
 * borders, sashes — over static panel stubs, themed by the HUD variable
 * mapping in `@rtc/layout-dockview/styles/dockview-hud.css`. The 10-combo
 * theme matrix is the chrome theming's pixel witness; real panel content is
 * the in-house engine scenarios' job, not this one's (mirrors registry.tsx's
 * `staticEngine`/`visualPanelRegistry` precedent for `layout/fx-*`).
 *
 * Deterministic by construction: a fresh `InMemoryDockLayoutStore` per mount
 * (so `store.load("fx")` returns `null` — the seed-render path, never a
 * persisted blob), `maximized: null`, and a 4-panel `fx`-tab-only registry
 * duplicated (not imported) from the contract tier's `layoutTestRegistry`
 * (`tests/ui/contract/react/layoutTestRegistry.tsx`) — each visual wrapper
 * stays self-contained per client, same convention as the Equities chart
 * wrappers. No timers, no randomness: `createDockEngine` lays out synchronously
 * from `createDefaultLayoutPort("fx").initial.root` on mount.
 *
 * Body copy is deliberately `"FX-RATES-BODY"` etc — NOT the contract tier's
 * plain `"RATES"`/`"ANALYTICS"`/... — because `scenarioActionFor`'s
 * `waitForText` resolves through Playwright's `getByText`, a case-insensitive
 * SUBSTRING match with no `exact` option in `ScenarioAction`. Dockview's own
 * tab title for fx-rates is "Live Rates" (PANEL_SPECS), which contains
 * "Rates" — a plain "RATES" body would strict-mode-violate (2 matches: the
 * stub body AND the tab). The hyphenated all-caps form shares no substring
 * with any PANEL_SPECS title.
 */
const visualDockPanelRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="fx-rates-body">FX-RATES-BODY</div>;
  },
  "fx-analytics": () => {
    return <div data-testid="fx-analytics-body">FX-ANALYTICS-BODY</div>;
  },
  "fx-positions": () => {
    return <div data-testid="fx-positions-body">FX-POSITIONS-BODY</div>;
  },
  "fx-blotter": () => {
    return <div data-testid="fx-blotter-body">FX-BLOTTER-BODY</div>;
  },
};

/** The header controls need intent slots; a golden never clicks them. */
function noop(): void {}

export function DockviewEngineVisual(): ReactElement {
  // Build-once-ref (mirrors DockviewEngineHost.tsx's identical idiom): a
  // fresh, never-persisted-to store per mount, so `store.load("fx")` reads
  // `null` on every capture — the seed-render path — rather than churning a
  // new store (and therefore a dockview engine remount) on every re-render.
  const storeRef = useRef<DockLayoutStore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = new InMemoryDockLayoutStore();
  }

  return (
    <div className={styles.stage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={visualDockPanelRegistry}
        store={storeRef.current}
        maximized={null}
        collapsed={[]}
        closed={[]}
        docked={[]}
        instances={[]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onCloseInstance={noop}
      />
    </div>
  );
}

/** The stacked twin-less sibling (`shell/layout-dockview-stacked`): the same
 * chrome stage, but the store is pre-seeded with the committed stacked blob
 * — rates+analytics in ONE group (rates active), so the bar renders the
 * Phase 2 stacked-tab chrome: full head on the active tab, the muted
 * `data-panel-title` chip on the inactive one, 1px seam, 2px accent seat.
 * Deterministic the same way the base wrapper is: the blob is a committed
 * constant (shape-pinned by the engine test "loads the stacked visual
 * fixture blob"), and `loadBlobOrSeed` falls back to the seed on any
 * malformed blob — which would un-stack the bar and fail these goldens
 * loudly. */
export function DockviewEngineStackedVisual(): ReactElement {
  const storeRef = useRef<DockLayoutStore | null>(null);

  if (storeRef.current === null) {
    const store = new InMemoryDockLayoutStore();
    store.save("fx", STACKED_FX_BLOB);
    storeRef.current = store;
  }

  return (
    <div className={styles.stage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={visualDockPanelRegistry}
        store={storeRef.current}
        maximized={null}
        collapsed={[]}
        closed={[]}
        docked={[]}
        instances={[]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onCloseInstance={noop}
      />
    </div>
  );
}

/** The floating twin-less sibling (`shell/layout-dockview-floating`,
 * PR #763): the same chrome stage, but the store is pre-seeded with the
 * committed floating blob — fx-analytics floated over the reflowed
 * fx-positions — so the bar renders the float's head, card and opaque
 * base over the panel underneath. Deterministic the same way the stacked
 * wrapper is: the blob is a committed constant captured from a real engine
 * save (see floatingFxBlob.ts's own comment), and `loadBlobOrSeed` falls
 * back to the seed on any malformed blob — which would un-float the panel
 * and fail this golden loudly. */
export function DockviewEngineFloatingVisual(): ReactElement {
  const storeRef = useRef<DockLayoutStore | null>(null);

  if (storeRef.current === null) {
    const store = new InMemoryDockLayoutStore();
    store.save("fx", FLOATING_FX_BLOB);
    storeRef.current = store;
  }

  return (
    <div className={styles.stage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={visualDockPanelRegistry}
        store={storeRef.current}
        maximized={null}
        collapsed={[]}
        closed={[]}
        docked={[]}
        instances={[]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onCloseInstance={noop}
      />
    </div>
  );
}

/** The attached-cluster scenario (`shell/layout-dockview-attached`): the
 * same stage, the store pre-seeded with the committed attached blob —
 * fx-analytics and fx-positions side by side in ONE floating window. A
 * malformed blob falls back to the seed and un-floats both: this golden then
 * fails loudly. */
export function DockviewEngineAttachedVisual(): ReactElement {
  const storeRef = useRef<DockLayoutStore | null>(null);

  if (storeRef.current === null) {
    const store = new InMemoryDockLayoutStore();
    store.save("fx", ATTACHED_FX_BLOB);
    storeRef.current = store;
  }

  return (
    <div className={styles.stage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={visualDockPanelRegistry}
        store={storeRef.current}
        maximized={null}
        collapsed={[]}
        closed={[]}
        docked={[]}
        instances={[]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onCloseInstance={noop}
      />
    </div>
  );
}

/** Panel stubs with NO body copy, for the sash pin: the capture then holds
 * nothing but dock chrome, so a strict comparison is not hostage to a text
 * rasteriser. The test ids stay for parity with the lettered registry. */
const emptyDockPanelRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="fx-rates-body" />;
  },
  "fx-analytics": () => {
    return <div data-testid="fx-analytics-body" />;
  },
  "fx-positions": () => {
    return <div data-testid="fx-positions-body" />;
  },
  "fx-blotter": () => {
    return <div data-testid="fx-blotter-body" />;
  },
};

/** The sash pin (`shell/layout-dockview-sash`): the seed layout with empty
 * bodies on the small `sashStage`, asserted at ZERO tolerance
 * (`Scenario.strict`). It exists because the config budget cannot see a sash
 * grip — 60 px against a 100 px allowance — on any other dockview golden. */
export function DockviewEngineSashVisual(): ReactElement {
  const storeRef = useRef<DockLayoutStore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = new InMemoryDockLayoutStore();
  }

  return (
    <div className={styles.sashStage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={emptyDockPanelRegistry}
        store={storeRef.current}
        maximized={null}
        collapsed={[]}
        closed={[]}
        docked={[]}
        instances={[]}
        layoutResets={0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onCloseInstance={noop}
      />
    </div>
  );
}
