import { createDockview, type DockviewApi } from "dockview";

import { type DockSeedNode, toSerializedDockview } from "#/dockSeed";
import { HookContentRenderer } from "#/HookContentRenderer";
import { TitleOnlyTab } from "#/TitleOnlyTab";

const RTC_TAB_COMPONENT = "rtc-tab";

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
    // Panel close/reopen is out of v1 scope — see TitleOnlyTab's own doc
    // comment for why this replaces the default tab renderer entirely
    // instead of hiding the close button with CSS. `defaultTabComponent`
    // must ALSO be set: without a `tabComponent` id on the panel (which
    // `fromJSON`-restored panels never carry), dockview falls back to its
    // own built-in `DefaultTab` — WITH the close action — and never calls
    // `createTabComponent` at all.
    defaultTabComponent: RTC_TAB_COMPONENT,
    createTabComponent: () => {
      return new TitleOnlyTab();
    },
  });

  const width = opts.container.clientWidth || 1200;
  const height = opts.container.clientHeight || 800;

  // dockview-core needs an explicit, real-dimensioned layout() call before
  // fromJSON restores a tree: absent one, its internal grid is still at its
  // 0×0 construction size (a fresh container hasn't been measured yet — e.g.
  // a portal mount that hasn't painted, or jsdom, which never resizes at
  // all), and each SplitView falls back to distributing space EVENLY among
  // children instead of honouring the sizes embedded in the restored JSON —
  // seed/blob proportions silently collapse to ~50/50 (confirmed empirically:
  // without this call every leaf comes back sized 100/100 regardless of the
  // 0.75/0.25 input; with it, sizes land exactly on the requested ratio).
  // dockview's own ResizeObserver will proportionally rescale from here once
  // the container's real size is known, so a stale fallback self-corrects.
  api.layout(width, height);

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
