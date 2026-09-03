import { cleanup, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { AmbientBackground } from "#/ui/shell/background/AmbientBackground";

interface AmbientBackgroundOptions {
  ambientStyle?: "aurora" | "rays";
  animatedBackground?: boolean;
  powerSaver?: boolean;
}

export interface AmbientBackgroundPage {
  mount(options?: AmbientBackgroundOptions): void;
  unmountAll(): void;
  ambientStyleAttr(): string | null;
  hasLayer(layer: string): boolean;
}

/** The framework surface for `AmbientBackground.test.tsx`. */
export function ambientBackgroundPage(): AmbientBackgroundPage {
  function root(): HTMLElement {
    return screen.getByTestId("ambient-background");
  }

  return {
    mount(options: AmbientBackgroundOptions = {}): void {
      const {
        ambientStyle = "aurora",
        animatedBackground = true,
        powerSaver = false,
      } = options;

      const hooks = {
        useAnimatedBackground: () => {
          return { enabled: animatedBackground };
        },
        usePowerSaver: () => {
          return { isCalm: powerSaver };
        },
        useAmbientStyle: () => {
          return { style: ambientStyle, setStyle: vi.fn() };
        },
      } as unknown as ViewModel;

      render(
        <ViewModelContext.Provider value={hooks}>
          <AmbientBackground />
        </ViewModelContext.Provider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    ambientStyleAttr(): string | null {
      return root().getAttribute("data-ambient-style");
    },
    hasLayer(layer: string): boolean {
      return root().querySelector(`[data-layer="${layer}"]`) != null;
    },
  };
}
