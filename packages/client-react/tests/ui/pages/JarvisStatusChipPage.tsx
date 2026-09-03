import { cleanup, render, screen } from "@testing-library/react";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { JarvisStatusChip } from "#/ui/shell/status/JarvisStatusChip";

interface JarvisStatusChipState {
  available: boolean;
  effectiveBrain:
    | "scripted"
    | "claude-haiku-4-5"
    | "claude-sonnet-5"
    | "claude-opus-5";
  gate: {
    level: "soft" | "hard";
    resetsAtMs: number;
    gated: readonly string[];
  } | null;
}

export interface JarvisStatusChipPage {
  mount(state: JarvisStatusChipState): void;
  unmountAll(): void;
  exists(): boolean;
  attribute(name: string): string | null;
  text(): string;
}

/** The framework surface for `JarvisStatusChip.test.tsx`. */
export function jarvisStatusChipPage(): JarvisStatusChipPage {
  function chip(): HTMLElement {
    return screen.getByTestId("jarvis-status-chip");
  }

  return {
    mount(state: JarvisStatusChipState): void {
      const hooks = {
        useJarvis: () => {
          return { state };
        },
      } as unknown as ViewModel;

      render(
        <ViewModelContext.Provider value={hooks}>
          <JarvisStatusChip />
        </ViewModelContext.Provider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(): boolean {
      return screen.queryByTestId("jarvis-status-chip") != null;
    },
    attribute(name: string): string | null {
      return chip().getAttribute(name);
    },
    text(): string {
      return chip().textContent ?? "";
    },
  };
}
