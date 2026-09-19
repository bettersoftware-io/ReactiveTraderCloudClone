import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import { BootSequence } from "#/ui/shell/boot/BootSequence";

/** Every case varies exactly these two: which ViewModel double the sequence
 * runs under, and what `onDone` records. `viewModel` is REQUIRED so the call
 * site still names the double — the reason the provider once stayed
 * spec-side, now met without handing the page a built element. */
interface BootSequenceMountProps {
  viewModel: ViewModel;
  onDone: () => void;
}

interface BootSequenceHandle {
  unmount(): void;
}

export interface BootSequencePage {
  /** Mounts `<BootSequence>` under the given ViewModel double. */
  mount(props: BootSequenceMountProps): BootSequenceHandle;
  hasText(pattern: RegExp): boolean;
  onlineAttrOfText(pattern: RegExp): string | null;
}

/** The framework surface for `BootSequence.test.tsx`. */
export function bootSequencePage(): BootSequencePage {
  return {
    mount(props: BootSequenceMountProps): BootSequenceHandle {
      // A NAMED component, not the tree inlined into `render`'s arrow: the
      // same eslint-plugin-solid reactivity false positive, and the same
      // named-boundary fix, as UseJarvisDrivenPulsePage.
      function BootSequenceUnderTest(): JSX.Element {
        return (
          <ViewModelContext.Provider value={props.viewModel}>
            <BootSequence onDone={props.onDone} />
          </ViewModelContext.Provider>
        );
      }

      const { unmount } = render(() => {
        return <BootSequenceUnderTest />;
      });

      return { unmount };
    },
    hasText(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    onlineAttrOfText(pattern: RegExp): string | null {
      return screen.getByText(pattern).getAttribute("data-online");
    },
  };
}
