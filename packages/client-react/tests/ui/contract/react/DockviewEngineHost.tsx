import { type ReactElement, useRef, useState } from "react";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
  PANEL_SPECS,
  type PanelId,
  type PanelSpec,
} from "@rtc/client-core";

import { DockviewLayoutEngine } from "#/ui/shell/layout/dockview/DockviewLayoutEngine";

import { layoutTestRegistry } from "./layoutTestRegistry";

/** Contract host for DockviewLayoutEngine (Task 4) — mirrors LayoutEngineHost:
 * mounts the SAME fake-panel registry against the "fx" tab's real default
 * seed tree (4 leaves), so DockviewEngine.contract.spec.ts's assertions line
 * up with LayoutEngine.contract.spec.ts's. The bridge owns its persistence
 * through an injected `DockLayoutStore`; this host builds a fresh
 * `InMemoryDockLayoutStore` per mount (optionally pre-seeded with
 * `seedBlob` under "fx") and wraps its `save` to mirror each call onto
 * `data-saved` (a counter) / `data-saved-blob` (the last blob) on its own
 * wrapper, so the page object can assert the round-trip without reaching
 * into the store directly. */
export function DockviewEngineHost({
  seedBlob,
  withHeads,
  maximized,
  collapsed,
  interactive,
  specsVariant,
}: DockviewEngineHostProps): ReactElement {
  const [saveCount, setSaveCount] = useState(0);
  // `interactive` hosts own the collapse set themselves (seeded from the
  // prop) and expose a toggle for fx-analytics, so a spec can drive a
  // collapse → expand round trip through a real prop change — the only way
  // to reach the bridge's expand path, which a fixed prop never exercises.
  const [liveCollapsed, setLiveCollapsed] = useState<readonly PanelId[]>(
    (collapsed as readonly PanelId[] | undefined) ?? [],
  );

  function toggleAnalyticsCollapsed(): void {
    setLiveCollapsed((prev) => {
      return prev.includes("fx-analytics")
        ? prev.filter((id) => {
            return id !== "fx-analytics";
          })
        : [...prev, "fx-analytics"];
    });
  }

  const [lastBlob, setLastBlob] = useState<string | null>(null);
  // Every LayoutMachine intent the bridge dispatches, in call order, as
  // `maximize:<id>` / `restore` / `collapse:<id>` / `expand:<id>` — mirrored
  // onto `data-intents` so the page object can assert the header controls
  // reach the machine without a real LayoutMachine in the loop.
  const [intents, setIntents] = useState<readonly string[]>([]);

  function recordIntent(intent: string): void {
    setIntents((prev) => {
      return [...prev, intent];
    });
  }

  // Lazy-init-via-ref: builds the wrapped store exactly once, on this
  // instance's first render, reading `seedBlob` at that point only — mirrors
  // the real Presenters.dockLayoutStore's per-app-instance construction (not
  // rebuilt every re-render).
  const storeRef = useRef<DockLayoutStore | null>(null);

  if (storeRef.current === null) {
    const inner = new InMemoryDockLayoutStore();

    if (seedBlob !== undefined) {
      inner.save("fx", seedBlob);
    }

    storeRef.current = {
      load: (tab: string): string | null => {
        return inner.load(tab);
      },
      save: (tab: string, blob: string): void => {
        inner.save(tab, blob);
        setSaveCount((n) => {
          return n + 1;
        });
        setLastBlob(blob);
      },
    };
  }

  const headRegistry: Partial<Record<PanelId, () => ReactElement>> = withHeads
    ? {
        "fx-rates": (): ReactElement => {
          return <span data-testid="custom-head">Custom head</span>;
        },
      }
    : {};

  return (
    <div
      data-testid="dockview-engine-host"
      data-saved={saveCount}
      data-saved-blob={lastBlob ?? ""}
      data-intents={intents.join(" ")}
    >
      {interactive ? (
        <button
          type="button"
          data-testid="host-toggle-analytics-collapsed"
          onClick={toggleAnalyticsCollapsed}
        >
          toggle
        </button>
      ) : null}
      <DockviewLayoutEngine
        tab="fx"
        registry={layoutTestRegistry}
        headRegistry={headRegistry}
        specs={specsFor(specsVariant)}
        store={storeRef.current}
        maximized={(maximized as PanelId | null | undefined) ?? null}
        collapsed={
          interactive
            ? liveCollapsed
            : ((collapsed as readonly PanelId[] | undefined) ?? [])
        }
        onMaximize={(id: PanelId) => {
          recordIntent(`maximize:${id}`);
        }}
        onRestore={() => {
          recordIntent("restore");
        }}
        onCollapse={(id: PanelId) => {
          recordIntent(`collapse:${id}`);
        }}
        onExpand={(id: PanelId) => {
          recordIntent(`expand:${id}`);
        }}
      />
    </div>
  );
}

/** The panel specs under test: the real PANEL_SPECS, or the
 * "no-maximize" variant — fx-blotter marked `maximizable: false` and
 * fx-positions dropped entirely, so a spec can see the maximize control
 * withheld and the title fall back to the bare panel id. */
function specsFor(
  variant: SpecsVariant | undefined,
): Readonly<Record<PanelId, PanelSpec>> {
  if (variant !== "no-maximize") {
    return PANEL_SPECS;
  }

  const { "fx-positions": _dropped, ...rest } = PANEL_SPECS;

  return {
    ...rest,
    "fx-blotter": { ...PANEL_SPECS["fx-blotter"], maximizable: false },
  } as Readonly<Record<PanelId, PanelSpec>>;
}

type SpecsVariant = "no-maximize";

interface DockviewEngineHostProps {
  seedBlob?: string;
  withHeads?: boolean;
  maximized?: string | null;
  collapsed?: readonly string[];
  interactive?: boolean;
  specsVariant?: SpecsVariant;
}
