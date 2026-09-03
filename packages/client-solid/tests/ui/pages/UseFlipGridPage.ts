import { renderHook } from "@solidjs/testing-library";

import type {
  FlipGridApi,
  FlipGridOptions,
} from "#/ui/shell/motion/useFlipGrid";
import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

export interface UseFlipGridPage {
  mount(deps: () => unknown[], options?: FlipGridOptions): FlipGridApi;
  /** How many `[data-testid]` descendants `el` has — the ghost-tile teardown
   * test's proof that the fading clone is stripped of every test id so e2e
   * tile counts don't see it mid-fade. */
  testIdDescendantCount(el: Element): number;
}

/** The framework surface for `useFlipGrid.test.ts`. */
export function flipGridPage(): UseFlipGridPage {
  return {
    mount(deps: () => unknown[], options?: FlipGridOptions): FlipGridApi {
      const { result } = renderHook(() => {
        return useFlipGrid(deps, options);
      });

      return result;
    },
    testIdDescendantCount(el: Element): number {
      return el.querySelectorAll("[data-testid]").length;
    },
  };
}
