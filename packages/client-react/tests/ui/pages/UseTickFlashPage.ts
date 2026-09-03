import { cleanup, renderHook } from "@testing-library/react";

import type { TickFlash } from "#/ui/equities/chart/useTickFlash";
import { useTickFlash } from "#/ui/equities/chart/useTickFlash";

interface HookProps {
  value: number | null;
}

interface TickFlashHandle {
  readonly state: TickFlash;
  rerender(value: number | null): void;
}

export interface UseTickFlashPage {
  mount(value: number | null): TickFlashHandle;
  unmountAll(): void;
}

/** The framework surface for `useTickFlash.test.ts`. */
export function tickFlashPage(): UseTickFlashPage {
  return {
    mount(value: number | null): TickFlashHandle {
      const { result, rerender } = renderHook(
        (props: HookProps) => {
          return useTickFlash(props.value);
        },
        { initialProps: { value } },
      );

      return {
        get state(): TickFlash {
          return result.current;
        },
        rerender(nextValue: number | null): void {
          rerender({ value: nextValue });
        },
      };
    },
    unmountAll(): void {
      cleanup();
    },
  };
}
