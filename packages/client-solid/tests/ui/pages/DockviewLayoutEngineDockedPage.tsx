import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import type { Accessor } from "solid-js";

import type { DockLayoutStore, PanelId, WorkspaceTab } from "@rtc/client-core";

import { DockviewLayoutEngine } from "#/ui/shell/layout/dockview/DockviewLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

interface WaitForOptions {
  timeout: number;
}

function noop(): void {}

export interface DockviewLayoutEngineDockedPageProps {
  tab: WorkspaceTab;
  registry: PanelRegistry;
  store: DockLayoutStore;
  maximized: PanelId | null;
  /** Live: the `docked`-prop membership tests diff against a still-live
   * engine (an add/remove diff) rather than a rebuild. */
  collapsed: Accessor<readonly PanelId[]>;
  /** Live, same reason as `collapsed`. */
  docked: Accessor<readonly PanelId[]>;
  /** Live: a bump rebuilds the bridge's engine in place — see the
   * component's REBUILD CONTRACT doc. */
  layoutResets: Accessor<number>;
}

export interface DockviewLayoutEngineDockedPage {
  /** Mounts ONCE, dereferencing each live prop INSIDE the JSX this method
   * writes — Solid's compiler wraps a JSX prop in a reactive getter only
   * where the source literally contains the accessor call at that JSX site
   * (mirrors `InhouseLayoutEnginePage.mountLive`'s identical constraint), so
   * later prop changes are driven by the SPEC calling its own signal
   * setters, never by re-mounting or re-calling this method. */
  mount(props: DockviewLayoutEngineDockedPageProps): void;
  unmountAll(): void;
  /** The engine's `data-groups` witness — how many dockview groups the
   * mounted engine currently reports, as a string (the attribute's raw
   * form). Only current as of the last debounced `onLayoutChange` — a group
   * ADDED OR REMOVED on an already-live engine (as opposed to one read at
   * construction, or one read once a rebuild's own construction-time
   * reconciliation has landed) needs `waitFor` around this. */
  groupsAttr(): string | null;
  /** Whether a testid the registry/portal tree renders is present. */
  bodyVisible(testId: string): boolean;
  /** Whether `panelId`'s tab slot carries dockview-hud.css's strip marker
   * (`data-dock-strip`). */
  stripMarked(panelId: string): boolean;
  /** Runs `assertion` until it stops throwing (or `options.timeout` elapses)
   * — the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void, options?: WaitForOptions): Promise<void>;
}

/** The framework surface for `DockviewLayoutEngine.docked.test.tsx` — the
 * `docked` prop's membership diff (add/remove a dynamic panel) and the
 * `layoutResets`-driven in-place rebuild. Mirrors the react twin's
 * `DockviewLayoutEngineDockedPage`, adapted for Solid: a "rerender with new
 * props" has no direct analogue (Solid component bodies run once), so this
 * page's `mount` takes live accessors for every prop a case in the spec
 * varies, and the spec drives them via its own `createSignal` setters
 * instead of a `rerender` call. */
export function dockviewLayoutEngineDockedPage(): DockviewLayoutEngineDockedPage {
  return {
    mount(props: DockviewLayoutEngineDockedPageProps): void {
      render(() => {
        return (
          <DockviewLayoutEngine
            tab={props.tab}
            registry={props.registry}
            store={props.store}
            maximized={props.maximized}
            collapsed={props.collapsed()}
            docked={props.docked()}
            layoutResets={props.layoutResets()}
            onMaximize={noop}
            onRestore={noop}
            onCollapse={noop}
            onExpand={noop}
          />
        );
      });
    },
    unmountAll(): void {
      cleanup();
    },
    groupsAttr(): string | null {
      return screen.getByTestId("layout-engine").getAttribute("data-groups");
    },
    bodyVisible(testId: string): boolean {
      return screen.queryByTestId(testId) !== null;
    },
    stripMarked(panelId: string): boolean {
      return (
        screen
          .getByTestId(`dock-tab-${panelId}`)
          .getAttribute("data-dock-strip") === "true"
      );
    },
    waitFor(assertion: () => void, options?: WaitForOptions): Promise<void> {
      return waitFor(assertion, options);
    },
  };
}
