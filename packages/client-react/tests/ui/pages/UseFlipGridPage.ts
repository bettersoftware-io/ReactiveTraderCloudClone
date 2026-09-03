import { cleanup, renderHook } from "@testing-library/react";

import type {
  FlipGridApi,
  FlipGridOptions,
} from "#/ui/shell/motion/useFlipGrid";
import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

interface HookProps {
  dep: string;
}

interface FlipGridHandle {
  readonly state: FlipGridApi;
  rerender(dep: string): void;
}

export interface UseFlipGridPage {
  mount(dep: string, options?: FlipGridOptions): FlipGridHandle;
  unmountAll(): void;
  /** How many `[data-testid]` descendants `el` has — the ghost-tile teardown
   * test's proof that the fading clone is stripped of every test id so e2e
   * tile counts don't see it mid-fade. */
  testIdDescendantCount(el: Element): number;
}

/** The framework surface for `useFlipGrid.test.ts`. Every original call site
 * drives `result.current.register(...)` directly (never wrapped in `act`) —
 * `register` only populates a ref map, so no synchronous render observation
 * needs flushing — so this page exposes no `commit()` wrapper. */
export function flipGridPage(): UseFlipGridPage {
  return {
    mount(dep: string, options?: FlipGridOptions): FlipGridHandle {
      const { result, rerender } = renderHook(
        (props: HookProps) => {
          return useFlipGrid([props.dep], options);
        },
        { initialProps: { dep } },
      );

      return {
        get state(): FlipGridApi {
          return result.current;
        },
        rerender(nextDep: string): void {
          rerender({ dep: nextDep });
        },
      };
    },
    unmountAll(): void {
      cleanup();
    },
    testIdDescendantCount(el: Element): number {
      return el.querySelectorAll("[data-testid]").length;
    },
  };
}
