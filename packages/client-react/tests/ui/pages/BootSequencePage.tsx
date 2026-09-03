import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { BootSequence } from "#/ui/shell/boot/BootSequence";

function defaultHooks(partialHooks: Partial<ViewModel>): ViewModel {
  return {
    useBootSequence: (_onDone: () => void) => {
      return {
        state: { variant: "core" as const, progress: 0, done: false },
        skip: vi.fn(),
      };
    },
    useForceBootAnimation: () => {
      return { enabled: false, setEnabled: vi.fn(), toggle: vi.fn() };
    },
    usePowerSaver: () => {
      return {
        level: "off" as const,
        isCalm: false,
        isFreeze: false,
        setLevel: vi.fn(),
        cycle: vi.fn(),
      };
    },
    useThemePreference: () => {
      return {
        mode: "dark" as const,
        modePreference: "dark" as const,
        cycle: vi.fn(),
      };
    },
    useThemeSkinPreference: () => {
      return { skin: "holo" as const, setSkin: vi.fn() };
    },
    ...partialHooks,
  } as unknown as ViewModel;
}

function wrap(
  el: ReactElement,
  partialHooks: Partial<ViewModel>,
): ReactElement {
  return (
    <ViewModelContext.Provider value={defaultHooks(partialHooks)}>
      {el}
    </ViewModelContext.Provider>
  );
}

interface BootSequenceHandle {
  unmount(): void;
  rerenderWithHooks(partialHooks: Partial<ViewModel>): void;
}

export interface BootSequencePage {
  mount(
    onDone: () => void,
    partialHooks?: Partial<ViewModel>,
  ): BootSequenceHandle;
  mountWithForceBootAnimation(forceBootAnimation: boolean): void;
  hasText(pattern: RegExp): boolean;
  onlineAttrOfText(pattern: RegExp): string | null;
}

/** The framework surface for `BootSequence.test.tsx`. */
export function bootSequencePage(): BootSequencePage {
  return {
    mount(
      onDone: () => void,
      partialHooks: Partial<ViewModel> = {},
    ): BootSequenceHandle {
      const { rerender, unmount } = render(
        wrap(<BootSequence onDone={onDone} />, partialHooks),
      );

      return {
        unmount,
        rerenderWithHooks(nextPartialHooks: Partial<ViewModel>): void {
          rerender(wrap(<BootSequence onDone={onDone} />, nextPartialHooks));
        },
      };
    },
    mountWithForceBootAnimation(forceBootAnimation: boolean): void {
      render(
        wrap(<BootSequence onDone={vi.fn()} />, {
          useForceBootAnimation: () => {
            return {
              enabled: forceBootAnimation,
              setEnabled: vi.fn(),
              toggle: vi.fn(),
            };
          },
        }),
      );
    },
    hasText(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    onlineAttrOfText(pattern: RegExp): string | null {
      return screen.getByText(pattern).getAttribute("data-online");
    },
  };
}
