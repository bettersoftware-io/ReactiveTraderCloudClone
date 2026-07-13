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

import { ViewModelProvider } from "@rtc/solid-bindings";

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
 * mirrors the react driver's (`ViewModelProvider → ThemeProvider → …`) minus
 * the FX/Credit view providers: `FxViewProvider`/`CreditViewProvider` don't
 * exist in `@rtc/client-solid` yet (Task 13+ ports them alongside the FX/
 * Credit component trees) — this task lands the shell + layout subset, so
 * the stack stops at ThemeProvider. When those providers land, nest them
 * here the same way the react driver does (BootGate is NOT part of this
 * stack, mirroring the react driver — it is a registry entry like every
 * other mounted component, not a global wrapper, so the harness can mount it
 * standalone with the `boot-gate-child` test double).
 *
 * `flushSync`/`flushAsync` stay part of the returned `MountedRoot` purely to
 * honour the `UiContractDriver` contract (`mount.ts`'s `buildContext` calls
 * `rendered.flushSync?.(fn) ?? fn()` unconditionally) — Solid commits
 * synchronously (no batching boundary to flush across, unlike React's
 * `act()`), so both are plain passthroughs.
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
          <ThemeProvider>
            <PropsHost subject={propsSubject} build={build} />
          </ThemeProvider>
        </ViewModelProvider>
      );
    });

    return {
      root: container,
      unmount,
      // Solid commits synchronously — no React-style `act()` batching
      // boundary exists to flush across — so this is a plain passthrough
      // kept only so the driver satisfies the UiContractDriver contract.
      flushSync: (fn: () => void) => {
        fn();
      },
      flushAsync: async (fn: () => Promise<void>) => {
        await fn();
      },
    };
  },
};
