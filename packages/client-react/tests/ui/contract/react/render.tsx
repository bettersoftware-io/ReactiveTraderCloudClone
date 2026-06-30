import { act, render as rtlRender } from "@testing-library/react";
import type { BehaviorSubject } from "rxjs";

import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";
import { ViewModelProvider } from "#/ui/viewModel/ViewModelProvider";

import type {
  MountedRoot,
  UiContractDriver,
} from "../shared/harness/activeDriver";
import type {
  ComponentToken,
  MountedComponent,
} from "../shared/harness/component";
import type { World } from "../shared/harness/world";
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
    if (!build) throw new Error("No React registry entry for the given token.");
    const hooks = reactViewModel(world);
    const { container, unmount } = rtlRender(
      <ViewModelProvider viewModel={hooks}>
        <ThemeProvider>
          <PropsHost subject={propsSubject} build={build} />
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
    };
  },
};
