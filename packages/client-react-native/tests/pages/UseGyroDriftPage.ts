// packages/client-react-native/tests/pages/UseGyroDriftPage.ts
import { cleanup, renderHook, waitFor } from "@testing-library/react-native";
import type { SharedValue } from "react-native-reanimated";

import { useGyroDrift } from "#/ui/shell/boot/useGyroDrift";

interface GyroDrift {
  mx: number;
  my: number;
}

interface HookResultBox<T> {
  current: T;
}

export interface UseGyroDriftPage {
  mount(enabled: boolean): Promise<void>;
  /** Unmounts THIS hook instance — a real per-test assertion target (the
   * "removes the listener on unmount" spec drives this directly), distinct
   * from `unmountAll`'s cross-wave "tear the whole tree down" convention. */
  unmount(): Promise<void>;
  unmountAll(): Promise<void>;
  waitFor<T>(assertion: () => T): Promise<T>;
  readonly value: SharedValue<GyroDrift>;
}

/** The framework surface for `useGyroDrift.test.tsx`. */
export function gyroDriftPage(): UseGyroDriftPage {
  let result: HookResultBox<SharedValue<GyroDrift>> | null = null;
  let unmountFn: (() => Promise<void>) | null = null;

  return {
    async mount(enabled: boolean): Promise<void> {
      // A locally-declared, `use`-prefixed function reference (not an
      // inline arrow) — Biome's `useHookAtTopLevel` recognizes the hook
      // call only when `renderHook` is handed a named hook-shaped function
      // by reference, matching the exact `renderHook(useProbe)` shape.
      function useProbe(): ReturnType<typeof useGyroDrift> {
        return useGyroDrift(enabled);
      }

      const rendered = await renderHook(useProbe);
      result = rendered.result;
      unmountFn = rendered.unmount;
    },
    async unmount(): Promise<void> {
      if (!unmountFn) {
        throw new Error("mount() must be called before unmount()");
      }

      await unmountFn();
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    waitFor<T>(assertion: () => T): Promise<T> {
      return waitFor(assertion);
    },
    get value(): SharedValue<GyroDrift> {
      if (!result) {
        throw new Error("mount() must be called before reading value");
      }

      return result.current;
    },
  };
}
