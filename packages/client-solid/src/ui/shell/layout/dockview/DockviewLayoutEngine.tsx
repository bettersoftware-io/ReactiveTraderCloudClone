import {
  type Accessor,
  createEffect,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

import {
  createDefaultLayoutPort,
  type DockLayoutStore,
  PANEL_SPECS,
  type PanelId,
  type PanelSpec,
  type WorkspaceTab,
} from "@rtc/client-core";
import { createDockEngine, type DockEngine } from "@rtc/layout-dockview";
import "@rtc/layout-dockview/styles/dockview-hud.css";

import { PanelErrorBoundary } from "../engine/PanelErrorBoundary";
import type { PanelRegistry } from "../engine/panelRegistry";

import styles from "./DockviewLayoutEngine.module.css";

/** Dockview-backed workspace engine (Solid twin of client-react's
 * DockviewLayoutEngine — Task 5). Dockview owns geometry (drag, tabs,
 * splits); panel CONTENT stays in the app's Solid tree via `Portal` so
 * ViewModel/FxView/CreditView contexts flow — a separate root would crash
 * every context consumer. The persisted layout is an opaque blob per tab. */
export function DockviewLayoutEngine(
  props: DockviewLayoutEngineProps,
): JSX.Element {
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
      // Setup-scope read is correct here: the keyed <Show> in App remounts
      // this component per tab, so `props.tab` never changes within one
      // instance's lifetime — mirrors LayoutEngineHost's identical read.
      seed: createDefaultLayoutPort(props.tab).initial.root,
      blob: props.store.load(props.tab),
      panels: {
        title: (id: string): string => {
          const specs = props.specs ?? PANEL_SPECS;
          return specs[id as PanelId]?.title ?? id;
        },
        mount: (id: string, element: HTMLElement): (() => void) => {
          const panelId = id as PanelId;
          setMounted((prev) => {
            return [...prev, { panelId, element }];
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
      onLayoutChange: (blob: string): void => {
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
    <main
      data-testid="layout-engine"
      data-engine="dockview"
      data-groups={groups()}
      class={styles.engine}
    >
      <div ref={containerEl} class={`${styles.container} dockview-theme-rtc`} />
      <For each={mounted()}>
        {(p: MountedPanel): JSX.Element => {
          return (
            <Portal mount={p.element}>
              <div class={styles.panelBody}>
                <Show when={props.headRegistry?.[p.panelId]}>
                  {(head: Accessor<() => JSX.Element>): JSX.Element => {
                    return <div class={styles.headStrip}>{head()()}</div>;
                  }}
                </Show>
                <PanelErrorBoundary
                  title={
                    (props.specs ?? PANEL_SPECS)[p.panelId]?.title ?? p.panelId
                  }
                >
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

export interface DockviewLayoutEngineProps {
  tab: WorkspaceTab;
  registry: PanelRegistry;
  headRegistry?: Partial<Record<PanelId, () => JSX.Element>>;
  specs?: Readonly<Record<PanelId, PanelSpec>>;
  store: DockLayoutStore;
  /** Mirrored from the LayoutMachine so Jarvis's layout DriveCommand still works. */
  maximized: PanelId | null;
}

interface MountedPanel {
  readonly panelId: PanelId;
  readonly element: HTMLElement;
}
