import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";

interface WaitForOptions {
  timeout: number;
}

export interface DockviewLayoutEngineDockedPage {
  mount(element: ReactElement): void;
  /** Re-renders the SAME React tree with a new element — the mechanism a
   * `docked` prop change (or a `key` change, for a workspace-reset remount)
   * goes through in the real app. */
  rerender(element: ReactElement): void;
  unmountAll(): void;
  /** The engine's `data-groups` witness — how many dockview groups the
   * mounted engine currently reports, as a string (the attribute's raw
   * form). Only current as of the last debounced `onLayoutChange` — a group
   * ADDED OR REMOVED on an already-live engine (as opposed to one read at
   * construction) needs `waitFor` around this, same as the strictMode
   * page's saved-blob witness. */
  groupsAttr(): string | null;
  /** Whether a testid the registry/portal tree renders is present. */
  bodyVisible(testId: string): boolean;
  /** Whether `panelId`'s tab slot carries dockview-hud.css's strip marker
   * (`data-dock-strip`) — set the instant the live diff effect calls
   * `collapsePanel`, so unlike `groupsAttr` this needs no `waitFor`. */
  stripMarked(panelId: string): boolean;
  /** Runs `assertion` until it stops throwing (or `options.timeout` elapses)
   * — the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void, options?: WaitForOptions): Promise<void>;
}

/** The framework surface for `DockviewLayoutEngine.docked.test.tsx` — the
 * `docked` prop's membership diff (add/remove a dynamic panel) and the
 * key-driven workspace-reset remount. Mirrors
 * `DockviewLayoutEngineStrictModePage`'s render/query split; this page also
 * exposes `rerender` since these cases drive the bridge through a prop or
 * key change rather than a fresh mount. */
export function dockviewLayoutEngineDockedPage(): DockviewLayoutEngineDockedPage {
  let doRerender: ((element: ReactElement) => void) | null = null;

  return {
    mount(element: ReactElement): void {
      const view = render(element);
      doRerender = view.rerender;
    },
    rerender(element: ReactElement): void {
      if (doRerender === null) {
        throw new Error("rerender called before mount");
      }

      doRerender(element);
    },
    unmountAll(): void {
      cleanup();
      doRerender = null;
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
