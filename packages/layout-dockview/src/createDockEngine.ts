import {
  createDockview,
  type DockviewApi,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
} from "dockview-core";

import { type DockSeedNode, toSerializedDockview } from "#/dockSeed";

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
  const serialize = (): void => {
    opts.onLayoutChange(JSON.stringify(api.toJSON()));
  };
  const changeSub = api.onDidLayoutChange(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      serialize();
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
      serialize();
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
