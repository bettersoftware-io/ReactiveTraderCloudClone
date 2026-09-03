// packages/client-react-native/tests/pages/BottomSheetModalProviderRequirementPage.tsx
import { render } from "@testing-library/react-native";
import { Component, type ReactNode } from "react";

export interface BottomSheetModalProviderRequirementPage {
  /** Renders `children` under a real React error boundary and invokes
   * `onError` if a descendant throws during render — a real boundary, not a
   * try/catch around `render()`.
   *
   * `render()` here resolves to `@testing-library/react-native`'s async
   * `render`, which flushes React's commit inside `act()` — a render-phase
   * throw from a descendant surfaces there, not as a synchronous exception
   * `render()` itself throws or a rejection its returned promise carries
   * (confirmed while building this: both `expect(() => render(...))
   * .toThrow()` and `expect(async () => { await render(...) })
   * .rejects.toThrow()` report "did not throw" even though the error is
   * real — React reports it to the nearest boundary, or the root's own
   * fatal-error handler, well outside either code path). An error boundary
   * is the mechanism React actually offers for this and works
   * synchronously with `componentDidCatch`. */
  renderAndCaptureThrow(
    children: ReactNode,
    onError: (error: unknown) => void,
  ): Promise<void>;
}

interface ThrowCaptureProps {
  children: ReactNode;
}

interface ThrowCaptureState {
  failed: boolean;
}

/** The framework surface for
 * `AppearanceOverlay.bottomSheetModalProviderRequirement.test.tsx`. */
export function bottomSheetModalProviderRequirementPage(): BottomSheetModalProviderRequirementPage {
  return {
    async renderAndCaptureThrow(
      children: ReactNode,
      onError: (error: unknown) => void,
    ): Promise<void> {
      // The boundary class is declared INSIDE this function, not at module
      // scope — mirrors the nested-Probe idiom other specs in this package
      // use for the same reason: a top-level, unexported, component-shaped
      // class trips Biome's `useComponentExportOnlyModules`.
      class ThrowCapture extends Component<
        ThrowCaptureProps,
        ThrowCaptureState
      > {
        state: ThrowCaptureState = { failed: false };

        static getDerivedStateFromError(): ThrowCaptureState {
          return { failed: true };
        }

        componentDidCatch(error: unknown): void {
          onError(error);
        }

        render(): ReactNode {
          return this.state.failed ? null : this.props.children;
        }
      }

      await render(<ThrowCapture>{children}</ThrowCapture>);
    },
  };
}
