import { createDockview, type DockviewApi } from "dockview-core";

import { type DockSeedNode, toSerializedDockview } from "#/dockSeed";
import { HookContentRenderer } from "#/HookContentRenderer";

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
  // Property (slot) syntax, not a method: the declarer never knows what gets
  // attached, so rtc/name-functions-by-effect exempts it — see
  // docs/handler-naming.md's slot-vs-handler doctrine.
  onLayoutChange: (blob: string) => void;
  /** Debounce for onLayoutChange serialisation; default 250. Tests pass 0. */
  debounceMs?: number;
}

export interface DockEngine {
  maximizePanel(panelId: string): void;
  exitMaximize(): void;
  groupCount(): number;
  dispose(): void;
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

  function serializeLayout(): void {
    opts.onLayoutChange(JSON.stringify(api.toJSON()));
  }

  const changeSub = api.onDidLayoutChange(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      serializeLayout();
    }, debounceMs);
  });

  return {
    maximizePanel: (panelId: string) => {
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

      // The last layout mutation must survive dispose. Dockview's model
      // updates synchronously (only its onDidLayoutChange notification is
      // microtask-deferred, via AsapEvent), so a mutation right before
      // dispose — e.g. maximize just ahead of navigating away — would
      // otherwise be lost: cancel any pending debounce and flush one final
      // serialisation unconditionally rather than only when a timer happens
      // to already be pending.
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      serializeLayout();
      api.dispose();
    },
  };
}

/** Restores the persisted blob, falling back to the seed tree on ANY failure —
 * a stale or corrupt blob must never brick the workspace. */
function loadBlobOrSeed(
  api: DockviewApi,
  opts: DockEngineOptions,
  width: number,
  height: number,
): void {
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
