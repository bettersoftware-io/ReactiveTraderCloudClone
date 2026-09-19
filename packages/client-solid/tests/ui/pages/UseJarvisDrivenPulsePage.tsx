import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import { useJarvisDrivenPulse } from "#/ui/shell/jarvis/useJarvisDrivenPulse";

/** The one thing a case varies: the ViewModel double whose `useJarvisDriver`
 * batch the case drives through its own signal. */
interface UseJarvisDrivenPulseMountProps {
  viewModel: ViewModel;
}

export interface UseJarvisDrivenPulsePage {
  /** Mounts `useJarvisDrivenPulse()` in a wrapper element (testid `wrapper`)
   * holding one child (testid `descendant`), under the given ViewModel. */
  mount(props: UseJarvisDrivenPulseMountProps): void;
  unmountAll(): void;
  /** The wrapper's raw `data-jarvis-driven` attribute — kept as the exact
   * `"true" | "false" | null` fact (not collapsed to a boolean) so a missing
   * attribute stays distinguishable from an explicit `"false"`. */
  wrapperDrivenAttr(testId: string): string | null;
  /** Fires the WebKit-prefixed `animationend` name jsdom falls back to (no
   * `window.AnimationEvent` here) on the element at `testId`. */
  fireAnimationEnd(testId: string): void;
}

/** The framework surface for `useJarvisDrivenPulse.test.tsx`. Named without a
 * `use` prefix (unlike the hook it wraps) so calling it once at module scope
 * in the spec doesn't trip eslint-plugin-solid's reactivity/hook heuristics —
 * mirrors client-react's `jarvisDrivenPulsePage` precedent. */
export function jarvisDrivenPulsePage(): UseJarvisDrivenPulsePage {
  return {
    mount(props: UseJarvisDrivenPulseMountProps): void {
      // TWO named components, not one inlined into `render`'s callback:
      // eslint-plugin-solid's reactivity check mis-reads an anonymous
      // `render(() => (<Provider value={…}>…))` arrow as an untracked
      // "unnamed derived signal" once its JSX closes over a local component —
      // a second named (PascalCase) component gives the plugin a real
      // component boundary. Both used to be declared, identically, in each
      // of the spec's two cases.
      function Harness(): JSX.Element {
        const pulse = useJarvisDrivenPulse();

        return (
          <div
            data-testid="wrapper"
            ref={pulse.ref}
            data-jarvis-driven={pulse.pulsing() ? "true" : "false"}
          >
            <div data-testid="descendant" />
          </div>
        );
      }

      function TestApp(): JSX.Element {
        return (
          <ViewModelContext.Provider value={props.viewModel}>
            <Harness />
          </ViewModelContext.Provider>
        );
      }

      render(() => {
        return <TestApp />;
      });
    },
    unmountAll(): void {
      cleanup();
    },
    wrapperDrivenAttr(testId: string): string | null {
      return screen.getByTestId(testId).getAttribute("data-jarvis-driven");
    },
    fireAnimationEnd(testId: string): void {
      fireEvent(
        screen.getByTestId(testId),
        new Event("webkitAnimationEnd", { bubbles: true, cancelable: false }),
      );
    },
  };
}
