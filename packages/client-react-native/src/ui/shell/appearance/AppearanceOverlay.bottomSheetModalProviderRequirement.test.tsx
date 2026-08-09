// packages/client-react-native/src/ui/shell/appearance/AppearanceOverlay.bottomSheetModalProviderRequirement.test.tsx
//
// AppearanceOverlay.test.tsx (and every other jest-tier test that mounts a
// BottomSheetModal) runs against the package-wide test double at
// `__mocks__/@gorhom/bottom-sheet.tsx` — a context-free `View` stand-in. That
// double is exactly why the Critical bug this file proves went unnoticed:
// jest's own suite was green while `tests/visual/scenarios.tsx`'s
// `shell/appearance` scenario would redbox on the real component, because it
// mounts `AppearanceOverlay` (a `BottomSheetModal`) with no
// `BottomSheetModalProvider` ancestor anywhere above it.
//
// This file exercises the REAL `BottomSheetModal` / `BottomSheetModalProvider`
// (via `jest.requireActual`), proving the mechanism the fix in
// `tests/visual/scenarios.tsx` relies on: absent a provider, the real
// component throws; wrapped in one, it does not. A full end-to-end render of
// the actual `shell/appearance` scenario against the real module was also
// tried while building this fix and rejected — see the second test below.
import { expect, jest, test } from "@jest/globals";
import { render } from "@testing-library/react-native";
import { Component, type ReactNode } from "react";
import { Text } from "react-native";

// `jest.requireActual` bypasses the package-wide `__mocks__/@gorhom/
// bottom-sheet.tsx` double directly — no `jest.unmock` call needed, unlike a
// plain `import`/`require` of the same module, which the double would still
// intercept.
const real = jest.requireActual(
  "@gorhom/bottom-sheet",
) as typeof import("@gorhom/bottom-sheet");

test("the REAL BottomSheetModal throws 'BottomSheetModalInternalContext cannot be null' with no provider ancestor — the exact crash AppearanceOverlay hit on the shell/appearance route", async () => {
  const onError = jest.fn();
  // React's default (uncaught-by-an-app-boundary) error reporter logs the
  // thrown value via console.error even though the boundary below does
  // catch it — expected noise for a deliberately-thrown error, muted so it
  // doesn't read as a real test failure in CI output.
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {
    return undefined;
  });

  await renderAndCaptureThrow(
    <real.BottomSheetModal>
      <Text>content</Text>
    </real.BottomSheetModal>,
    onError,
  );

  consoleError.mockRestore();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]?.[0]).toEqual(
    expect.stringContaining("BottomSheetModalInternalContext"),
  );
});

test("the REAL BottomSheetModal does NOT throw once wrapped in a BottomSheetModalProvider — the fix `tests/visual/scenarios.tsx` applies", async () => {
  const onError = jest.fn();

  await renderAndCaptureThrow(
    <real.BottomSheetModalProvider>
      <real.BottomSheetModal>
        <Text>content</Text>
      </real.BottomSheetModal>
    </real.BottomSheetModalProvider>,
    onError,
  );

  expect(onError).not.toHaveBeenCalled();
});

/** Renders `children` under a real React error boundary and invokes `onError`
 * if a descendant throws during render — a real boundary, not a try/catch
 * around `render()`.
 *
 * `render()` here resolves to `@testing-library/react-native`'s async
 * `render`, which flushes React's commit inside `act()` — a render-phase
 * throw from a descendant surfaces there, not as a synchronous exception
 * `render()` itself throws or a rejection its returned promise carries
 * (confirmed while building this test: both `expect(() => render(...))
 * .toThrow()` and `expect(async () => { await render(...) })
 * .rejects.toThrow()` report "did not throw" even though the error is real —
 * React reports it to the nearest boundary, or the root's own fatal-error
 * handler, well outside either code path). An error boundary is the
 * mechanism React actually offers for this and works synchronously with
 * `componentDidCatch`.
 *
 * The boundary class is declared INSIDE this function, not at module scope —
 * mirrors the nested-Probe idiom `useTickFlash.test.tsx` and
 * `useJarvisDrivenPulse.test.tsx` already use for the same reason: a
 * top-level, unexported, component-shaped class trips Biome's
 * `useComponentExportOnlyModules`. */
async function renderAndCaptureThrow(
  children: ReactNode,
  onError: (error: unknown) => void,
): Promise<void> {
  class ThrowCapture extends Component<ThrowCaptureProps, ThrowCaptureState> {
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
}

interface ThrowCaptureProps {
  children: ReactNode;
}

interface ThrowCaptureState {
  failed: boolean;
}
