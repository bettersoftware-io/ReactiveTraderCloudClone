// packages/client-react-native/tests/pages/BootGatePage.tsx
import { cleanup, screen, waitFor } from "@testing-library/react-native";
import { useEffect, useRef } from "react";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootGate } from "#/ui/shell/boot/BootGate";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const RUNNING = { variant: "core" as const, progress: 20, done: false };

function noop(): undefined {
  return undefined;
}

// Never-done fake: useBootSequence returns a running state and never invokes
// onDone — the splash stays up so a test can assert it rendered.
function fakeRunning(visible = true, dismiss: () => void = noop): ViewModel {
  return {
    useBootGate: () => {
      return { visible, dismiss, reboot: noop };
    },
    useBootSequence: (_onDone: () => void) => {
      return {
        state: RUNNING,
        skip: noop,
      };
    },
  } as unknown as ViewModel;
}

// Done-once fake: invokes onDone exactly once after mount, mirroring the
// machine firing its onDone when the ramp completes.
function fakeDoneOnce(dismiss: () => void): ViewModel {
  return {
    useBootGate: () => {
      return { visible: true, dismiss, reboot: noop };
    },
    useBootSequence: (onDone: () => void) => {
      const fired = useRef(false);
      useEffect(() => {
        if (!fired.current) {
          fired.current = true;
          onDone();
        }
      }, [onDone]);
      return {
        state: { variant: "core" as const, progress: 100, done: true },
        skip: noop,
      };
    },
  } as unknown as ViewModel;
}

export interface BootGatePage {
  mountRunning(visible?: boolean): Promise<void>;
  mountDoneOnce(dismiss: () => void): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
  waitFor<T>(assertion: () => T): Promise<T>;
}

/** The framework surface for `BootGate.test.tsx`. */
export function bootGatePage(): BootGatePage {
  return {
    async mountRunning(visible = true): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeRunning(visible)}>
          <BootGate />
        </ViewModelProvider>,
      );
    },
    async mountDoneOnce(dismiss: () => void): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeDoneOnce(dismiss)}>
          <BootGate />
        </ViewModelProvider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    waitFor<T>(assertion: () => T): Promise<T> {
      return waitFor(assertion);
    },
  };
}
