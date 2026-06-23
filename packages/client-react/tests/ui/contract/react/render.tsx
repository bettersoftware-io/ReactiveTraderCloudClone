import { act, render as rtlRender } from "@testing-library/react";
import type { BehaviorSubject } from "rxjs";

import { HooksProvider } from "#/ui/hooks/HooksProvider";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

import type {
  MountedRoot,
  UiContractDriver,
} from "../shared/harness/activeDriver";
import type {
  ComponentToken,
  MountedComponent,
} from "../shared/harness/component";
import type { World } from "../shared/harness/world";
import { reactHooks } from "./hooksFromWorld";
import { PropsHost } from "./PropsHost";
import { registry } from "./registry";

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
    const hooks = reactHooks(world);
    const { container, unmount } = rtlRender(
      <HooksProvider hooks={hooks}>
        <ThemeProvider>
          <PropsHost subject={propsSubject} build={build} />
        </ThemeProvider>
      </HooksProvider>,
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
