// packages/client-react-native/tests/pages/UseHoldToUnlockPage.tsx
import { renderHook } from "@testing-library/react-native";
import type { JSX, PropsWithChildren } from "react";
import type { SharedValue } from "react-native-reanimated";

import { LockHoldProgressContext } from "#/ui/shell/lock/LockHoldProgressContext";
import {
  type UseHoldToUnlockOptions,
  type UseHoldToUnlockResult,
  useHoldToUnlock,
} from "#/ui/shell/lock/useHoldToUnlock";

interface HookResultBox<T> {
  current: T;
}

export interface UseHoldToUnlockPage {
  /** Renders the hook once, optionally under a `LockHoldProgressContext` pin
   * (the one scenario that needs its own progress SharedValue reachable from
   * both the hook and the assertions). */
  mount(
    options: UseHoldToUnlockOptions,
    pinned?: SharedValue<number>,
  ): Promise<void>;
  rerender(options: UseHoldToUnlockOptions): Promise<void>;
  readonly state: UseHoldToUnlockResult;
}

/** The framework surface for `useHoldToUnlock.test.tsx`. */
export function useHoldToUnlockPage(): UseHoldToUnlockPage {
  let result: HookResultBox<UseHoldToUnlockResult> | null = null;
  let rerenderFn: ((props: UseHoldToUnlockOptions) => Promise<void>) | null =
    null;

  return {
    async mount(
      options: UseHoldToUnlockOptions,
      pinned?: SharedValue<number>,
    ): Promise<void> {
      // A locally-declared, `use`-prefixed function reference (not an
      // inline arrow) — Biome's `useHookAtTopLevel` recognizes the hook
      // call only when `renderHook` is handed a named hook-shaped function
      // by reference, matching the exact `renderHook(useProbe, options)`
      // shape.
      function useProbe(props: UseHoldToUnlockOptions): UseHoldToUnlockResult {
        return useHoldToUnlock(props);
      }

      const rendered = await renderHook(useProbe, {
        initialProps: options,
        wrapper: pinned
          ? ({ children }: PropsWithChildren): JSX.Element => {
              return (
                <LockHoldProgressContext.Provider value={pinned}>
                  {children}
                </LockHoldProgressContext.Provider>
              );
            }
          : undefined,
      });
      result = rendered.result;
      rerenderFn = rendered.rerender;
    },
    async rerender(options: UseHoldToUnlockOptions): Promise<void> {
      if (!rerenderFn) {
        throw new Error("mount() must be called before rerender()");
      }

      await rerenderFn(options);
    },
    get state(): UseHoldToUnlockResult {
      if (!result) {
        throw new Error("mount() must be called before reading state");
      }

      return result.current;
    },
  };
}
