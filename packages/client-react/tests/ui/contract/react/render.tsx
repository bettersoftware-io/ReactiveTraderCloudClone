import { act, render as rtlRender } from "@testing-library/react";
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

import { ViewModelProvider } from "@rtc/react-bindings";

import { CreditViewProvider } from "#/ui/credit/CreditViewProvider";
import { FxViewProvider } from "#/ui/fx/FxViewProvider";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

import { PropsHost } from "./PropsHost";
import { registry } from "./registry";
import { reactViewModel } from "./viewModelFromWorld";

interface RenderArgs {
  propsSubject: BehaviorSubject<Partial<unknown>>;
  world: World;
}

export const reactDriver: UiContractDriver = {
  render(
    token: ComponentToken<unknown, MountedComponent<unknown>>,
    { propsSubject, world }: RenderArgs,
  ): MountedRoot {
    const build = registry.get(token);

    if (!build) {
      throw new Error("No React registry entry for the given token.");
    }

    const hooks = reactViewModel(world);
    const { container, unmount } = rtlRender(
      <ViewModelProvider viewModel={hooks}>
        <ThemeProvider>
          <FxViewProvider>
            <CreditViewProvider>
              <PropsHost subject={propsSubject} build={build} />
            </CreditViewProvider>
          </FxViewProvider>
        </ThemeProvider>
      </ViewModelProvider>,
    );
    return {
      root: container,
      unmount,
      // Wrap mutations in `act` so React flushes re-renders synchronously
      // before the caller's next assertion.
      flushSync: (fn: () => void) => {
        act(fn);
      },
      // Async counterpart: lets specs resolve promises whose .then() chains
      // apply buffered state (e.g. the watchlist glide settling) with React
      // still flushing every re-render before the awaiting caller resumes.
      flushAsync: async (fn: () => Promise<void>) => {
        await act(async () => {
          await fn();
        });
      },
    };
  },
};
