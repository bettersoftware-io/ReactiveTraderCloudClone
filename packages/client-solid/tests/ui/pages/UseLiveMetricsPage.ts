import { renderHook } from "@solidjs/testing-library";
import type { Accessor, JSX } from "solid-js";
import { createComponent } from "solid-js";

import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import type { LiveMetrics } from "#/ui/shell/status/LiveMetricsContext";
import { LiveMetricsContext } from "#/ui/shell/status/LiveMetricsContext";
import { useLiveMetrics } from "#/ui/shell/status/useLiveMetrics";

interface ProvidersProps {
  children: JSX.Element;
}

/** What a case varies: the ViewModel double the hook runs under, and — when a
 * case wants the provided (non-sampling) path — the LiveMetrics value a
 * surrounding `LiveMetricsContext` supplies. */
interface UseLiveMetricsMountProps {
  viewModel: ViewModel;
  /** Omitted = no LiveMetrics provider, so the hook samples on its own. */
  liveMetrics?: LiveMetrics;
}

export interface UseLiveMetricsPage {
  /** Mounts `useLiveMetrics()` under the given contexts. The page builds the
   * providers itself: it used to take a caller-built wrapper component, so
   * each case composed the provider tree by hand — the arrange half the page
   * is meant to own. */
  mount(props: UseLiveMetricsMountProps): Accessor<LiveMetrics>;
}

/** The framework surface for `useLiveMetrics.test.tsx`. */
export function liveMetricsPage(): UseLiveMetricsPage {
  return {
    mount(props: UseLiveMetricsMountProps): Accessor<LiveMetrics> {
      function Providers(wrapped: ProvidersProps): JSX.Element {
        return createComponent(ViewModelContext.Provider, {
          value: props.viewModel,
          get children(): JSX.Element {
            // Read inside the tracked children getter, not destructured up
            // front — eslint-plugin-solid treats a `props`-named bag as
            // reactive and flags an early destructure.
            if (props.liveMetrics === undefined) {
              return wrapped.children;
            }

            return createComponent(LiveMetricsContext.Provider, {
              value: props.liveMetrics,
              get children(): JSX.Element {
                return wrapped.children;
              },
            });
          },
        });
      }

      const { result } = renderHook(useLiveMetrics, { wrapper: Providers });

      return result;
    },
  };
}
