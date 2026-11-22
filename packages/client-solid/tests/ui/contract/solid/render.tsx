import { render as solidRender } from "@solidjs/testing-library";
import type {
  MountedRoot,
  UiContractDriver,
} from "@ui-contract/harness/activeDriver";
import type {
  ComponentToken,
  MountedComponent,
} from "@ui-contract/harness/component";
import type { World } from "@ui-contract/harness/world";
import type { BehaviorSubject } from "rxjs";
import { flush } from "solid-js";

import { ViewModelProvider } from "@rtc/solid-bindings";

import { CreditViewProvider } from "#/ui/credit/CreditViewProvider";
import { FxViewProvider } from "#/ui/fx/FxViewProvider";
import {
  FROZEN_LIVE_METRICS,
  LiveMetricsContext,
} from "#/ui/shell/status/LiveMetricsContext";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

import { PropsHost } from "./PropsHost";
import { registry } from "./registry";
import { solidViewModel } from "./viewModelFromWorld";

interface RenderArgs {
  propsSubject: BehaviorSubject<Partial<unknown>>;
  world: World;
}

/**
 * The Solid counterpart of the react driver's `reactDriver`. Provider stack
 * mirrors the react driver's exactly (`ViewModelProvider → ThemeProvider →
 * FxViewProvider → CreditViewProvider → …`). BootGate is NOT part of this
 * stack, mirroring the react driver — it is a registry entry like every
 * other mounted component, not a global wrapper, so the harness can mount it
 * standalone with the `boot-gate-child` test double).
 *
 * `flushSync`/`flushAsync` run the harness's mutation, then Solid's
 * `flush()`: Solid 2 applies writes at the next microtask, so a World push
 * (a BehaviorSubject emission the bindings forward as a signal write) would
 * otherwise not reach the DOM before the spec's next synchronous assertion —
 * the same job React's `act()` does in the react driver. Fired DOM events
 * get the same treatment from the `eventWrapper` that
 * tests/setup/flush-after-each-event.ts installs.
 */
export const solidDriver: UiContractDriver = {
  render(
    token: ComponentToken<unknown, MountedComponent<unknown>>,
    { propsSubject, world }: RenderArgs,
  ): MountedRoot {
    const build = registry.get(token);

    if (!build) {
      throw new Error(
        "No Solid registry entry for the given token — this component " +
          "isn't ported to @rtc/client-solid yet (see registry.tsx).",
      );
    }

    const viewModel = solidViewModel(world);
    const { container, unmount } = solidRender(() => {
      return (
        <ViewModelProvider viewModel={viewModel}>
          <LiveMetricsContext value={FROZEN_LIVE_METRICS}>
            <ThemeProvider>
              <FxViewProvider>
                <CreditViewProvider>
                  <PropsHost subject={propsSubject} build={build} />
                </CreditViewProvider>
              </FxViewProvider>
            </ThemeProvider>
          </LiveMetricsContext>
        </ViewModelProvider>
      );
    });

    return {
      root: container,
      unmount,
      flushSync: (fn: () => void) => {
        fn();
        flush();
      },
      flushAsync: async (fn: () => Promise<void>) => {
        await fn();
        flush();
      },
    };
  },
};
