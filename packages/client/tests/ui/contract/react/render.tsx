import { render as rtlRender, act } from "@testing-library/react";
import { useSyncExternalStore, type ReactElement } from "react";
import type { BehaviorSubject } from "rxjs";
import { ThemeProvider } from "../../../../src/ui/shell/theme/ThemeProvider";
import { HooksProvider } from "../../../../src/ui/hooks/HooksProvider";
import type { UiContractDriver } from "../shared/harness/activeDriver";
import { reactHooks } from "./hooksFromWorld";
import { registry } from "./registry";

/** Renders the component from the latest props on the subject; re-renders on push. */
function PropsHost<P>({
  subject,
  build,
}: {
  subject: BehaviorSubject<Partial<P>>;
  build: (props: Partial<P>) => ReactElement;
}) {
  const props = useSyncExternalStore(
    (onChange) => {
      const sub = subject.subscribe(onChange);
      return () => sub.unsubscribe();
    },
    () => subject.getValue(),
  );
  return build(props);
}

export const reactDriver: UiContractDriver = {
  render(token, { propsSubject, world }) {
    const build = registry.get(token);
    if (!build) throw new Error("No React registry entry for the given token.");
    const hooks = reactHooks(world);
    const { container, unmount } = rtlRender(
      <ThemeProvider>
        <HooksProvider hooks={hooks}>
          <PropsHost subject={propsSubject} build={build} />
        </HooksProvider>
      </ThemeProvider>,
    );
    return {
      root: container,
      unmount,
      // Wrap mutations in `act` so React flushes re-renders synchronously
      // before the caller's next assertion.
      flushSync: (fn) => act(fn),
    };
  },
};
