import { renderHook } from "@solidjs/testing-library";
import type { Accessor, JSX } from "solid-js";

import type { LiveMetrics } from "#/ui/shell/status/LiveMetricsContext";
import { useLiveMetrics } from "#/ui/shell/status/useLiveMetrics";

interface LiveMetricsWrapperProps {
  children: JSX.Element;
}

export interface UseLiveMetricsPage {
  /** Mounts `useLiveMetrics()` under the given ViewModel/LiveMetrics context
   * wrapper — the spec builds the wrapper (a plain Solid composition, not a
   * testing-library call), this page owns the render mechanic. */
  mount(
    wrapper: (props: LiveMetricsWrapperProps) => JSX.Element,
  ): Accessor<LiveMetrics>;
}

/** The framework surface for `useLiveMetrics.test.tsx`. */
export function liveMetricsPage(): UseLiveMetricsPage {
  return {
    mount(
      wrapper: (props: LiveMetricsWrapperProps) => JSX.Element,
    ): Accessor<LiveMetrics> {
      const { result } = renderHook(useLiveMetrics, { wrapper });

      return result;
    },
  };
}
