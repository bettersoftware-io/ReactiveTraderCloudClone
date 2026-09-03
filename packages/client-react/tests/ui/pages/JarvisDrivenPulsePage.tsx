import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { useJarvisDrivenPulse } from "#/ui/shell/jarvis/useJarvisDrivenPulse";

interface JarvisDrivenPulseHandle {
  rerenderWith(viewModel: ViewModel): void;
}

export interface JarvisDrivenPulsePage {
  mount(viewModel: ViewModel): JarvisDrivenPulseHandle;
  unmountAll(): void;
  wrapperIsDriven(): boolean;
  fireDescendantAnimationEnd(): void;
  fireWrapperAnimationEnd(): void;
}

/** The framework surface for `useJarvisDrivenPulse.test.tsx`. Both specs
 * mount the SAME harness component (a wrapper carrying `data-jarvis-driven`
 * plus a plain descendant), declared inside this factory rather than at
 * module top level — mirrors the original inline-`Harness` idiom used to
 * dodge biome's useComponentExportOnlyModules/noExportsInTest pair. Named
 * without a `use` prefix (unlike the hook it wraps) so calling it once at
 * module scope in the spec doesn't trip react-hooks/rules-of-hooks. */
export function jarvisDrivenPulsePage(): JarvisDrivenPulsePage {
  function Harness(): ReactElement {
    const { pulsing, clearPulse } = useJarvisDrivenPulse();

    return (
      <div
        data-testid="wrapper"
        data-jarvis-driven={pulsing ? "true" : "false"}
        onAnimationEnd={clearPulse}
      >
        <div data-testid="descendant" />
      </div>
    );
  }

  // jsdom feature-detects `window.AnimationEvent` (undefined here) and falls
  // back to the WebKit-prefixed event name, so the fixture fires
  // `webkitAnimationEnd`, not the unprefixed `fireEvent.animationEnd`.
  function webkitAnimationEnd(el: Element): void {
    fireEvent(
      el,
      new Event("webkitAnimationEnd", { bubbles: true, cancelable: false }),
    );
  }

  return {
    mount(viewModel: ViewModel): JarvisDrivenPulseHandle {
      const { rerender } = render(
        <ViewModelContext.Provider value={viewModel}>
          <Harness />
        </ViewModelContext.Provider>,
      );

      return {
        rerenderWith(nextViewModel: ViewModel): void {
          rerender(
            <ViewModelContext.Provider value={nextViewModel}>
              <Harness />
            </ViewModelContext.Provider>,
          );
        },
      };
    },
    unmountAll(): void {
      cleanup();
    },
    wrapperIsDriven(): boolean {
      return (
        screen.getByTestId("wrapper").getAttribute("data-jarvis-driven") ===
        "true"
      );
    },
    fireDescendantAnimationEnd(): void {
      webkitAnimationEnd(screen.getByTestId("descendant"));
    },
    fireWrapperAnimationEnd(): void {
      webkitAnimationEnd(screen.getByTestId("wrapper"));
    },
  };
}
