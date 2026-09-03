import { act, renderHook } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";

import type { LiveMetrics } from "#/ui/shell/status/LiveMetricsContext";
import { useLiveMetrics } from "#/ui/shell/status/useLiveMetrics";

interface LiveMetricsHandle {
  readonly state: LiveMetrics;
}

interface WrapperProps {
  children: ReactNode;
}

export interface UseLiveMetricsPage {
  /** Mounts `useLiveMetrics()` under the given ViewModel/LiveMetrics context
   * wrapper — the spec builds the wrapper (a plain React composition, not a
   * testing-library call), this page owns the render mechanic. */
  mount(wrapper: ComponentType<WrapperProps>): LiveMetricsHandle;
  /** Flushes an rAF callback invocation so the following assertion sees the
   * resulting render synchronously. */
  commit(effects: () => void): void;
}

/** The framework surface for `useLiveMetrics.test.tsx`. */
export function liveMetricsPage(): UseLiveMetricsPage {
  return {
    mount(wrapper: ComponentType<WrapperProps>): LiveMetricsHandle {
      const { result } = renderHook(
        () => {
          return useLiveMetrics();
        },
        { wrapper },
      );

      return {
        get state(): LiveMetrics {
          return result.current;
        },
      };
    },
    commit(effects: () => void): void {
      act(effects);
    },
  };
}
