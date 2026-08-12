import { createSignal, type JSX } from "solid-js";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
  type PanelId,
} from "@rtc/client-core";

import { DockviewLayoutEngine } from "#/ui/shell/layout/dockview/DockviewLayoutEngine";

import { layoutTestRegistry } from "./layoutTestRegistry";

/** Contract host for DockviewLayoutEngine (Task 5) — mirrors LayoutEngineHost:
 * mounts the SAME fake-panel registry against the "fx" tab's real default
 * seed tree (4 leaves), so DockviewEngine.contract.spec.ts's assertions line
 * up with LayoutEngine.contract.spec.ts's. The bridge owns its persistence
 * through an injected `DockLayoutStore`; this host builds a fresh
 * `InMemoryDockLayoutStore` once per mount (optionally pre-seeded with
 * `props.seedBlob` under "fx") and wraps its `save` to mirror each call onto
 * `data-saved` (a counter) / `data-saved-blob` (the last blob) on its own
 * wrapper, so the page object can assert the round-trip without reaching
 * into the store directly. */
export function DockviewEngineHost(
  props: DockviewEngineHostProps,
): JSX.Element {
  const [saveCount, setSaveCount] = createSignal(0);
  const [lastBlob, setLastBlob] = createSignal<string | null>(null);

  // Lazy-init-once: builds the wrapped store exactly once, on this
  // instance's first render, reading `props.seedBlob` at that point only —
  // mirrors the real Presenters.dockLayoutStore's per-app-instance
  // construction (not rebuilt every re-render). Solid component bodies run
  // once, so a plain top-level const is already "once" here — no ref needed.
  const inner = new InMemoryDockLayoutStore();

  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this host is remounted (not re-rendered) whenever seedBlob changes
  const seedBlob = props.seedBlob;

  if (seedBlob !== undefined) {
    inner.save("fx", seedBlob);
  }

  const store: DockLayoutStore = {
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

  function headRegistry(): Partial<Record<PanelId, () => JSX.Element>> {
    return props.withHeads
      ? {
          "fx-rates": (): JSX.Element => {
            return <span data-testid="custom-head">Custom head</span>;
          },
        }
      : {};
  }

  return (
    <div
      data-testid="dockview-engine-host"
      data-saved={saveCount()}
      data-saved-blob={lastBlob() ?? ""}
    >
      <DockviewLayoutEngine
        tab="fx"
        registry={layoutTestRegistry}
        headRegistry={headRegistry()}
        store={store}
        maximized={(props.maximized as PanelId | null | undefined) ?? null}
      />
    </div>
  );
}

interface DockviewEngineHostProps {
  seedBlob?: string;
  withHeads?: boolean;
  maximized?: string | null;
}
