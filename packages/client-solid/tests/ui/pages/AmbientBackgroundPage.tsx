import { cleanup, render, screen } from "@solidjs/testing-library";
import type { Accessor } from "solid-js";
import { vi } from "vitest";

import type { PowerSaverLevel } from "@rtc/domain";
import type { ViewModel } from "@rtc/solid-bindings";
import { ViewModelContext } from "@rtc/solid-bindings";

import { AmbientBackground } from "#/ui/shell/background/AmbientBackground";

type AmbientStyle = "aurora" | "rays";

interface AmbientBackgroundOptions {
  ambientStyle?: AmbientStyle;
  animatedBackground?: boolean;
  powerSaver?: boolean;
}

/** The live, per-signal shape of the animated-background preference the
 * reactive regression test drives after mount — a real Solid signal is
 * required (a plain-function double is invisible to Solid's tracking). */
interface AmbientBackgroundLiveOptions {
  enabled: Accessor<boolean>;
  level: Accessor<PowerSaverLevel>;
  ambientStyle: Accessor<AmbientStyle>;
}

export interface AmbientBackgroundPage {
  mount(options?: AmbientBackgroundOptions): void;
  mountLive(options: AmbientBackgroundLiveOptions): void;
  unmountAll(): void;
  /** Re-queries the root's `--amb-play` custom property at call time (never
   * a value captured at mount) — the reactive regression re-reads this after
   * each signal toggle. */
  ambPlay(): string;
  animatedAttr(): string | null;
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
          return {
            enabled: () => {
              return animatedBackground;
            },
          };
        },
        usePowerSaver: () => {
          return {
            isCalm: () => {
              return powerSaver;
            },
          };
        },
        useAmbientStyle: () => {
          return {
            style: () => {
              return ambientStyle;
            },
            setStyle: vi.fn(),
          };
        },
      } as unknown as ViewModel;

      render(() => {
        return (
          <ViewModelContext.Provider value={hooks}>
            <AmbientBackground />
          </ViewModelContext.Provider>
        );
      });
    },
    mountLive(options: AmbientBackgroundLiveOptions): void {
      const { enabled, level, ambientStyle } = options;
      const hooks = {
        useAnimatedBackground: () => {
          return { enabled, setEnabled: vi.fn(), toggle: vi.fn() };
        },
        usePowerSaver: () => {
          return {
            level,
            isCalm: () => {
              return level() !== "off";
            },
            isFreeze: () => {
              return level() === "freeze";
            },
            setLevel: vi.fn(),
            cycle: vi.fn(),
          };
        },
        useAmbientStyle: () => {
          return { style: ambientStyle, setStyle: vi.fn() };
        },
      } as unknown as ViewModel;

      render(() => {
        return (
          <ViewModelContext.Provider value={hooks}>
            <AmbientBackground />
          </ViewModelContext.Provider>
        );
      });
    },
    unmountAll(): void {
      cleanup();
    },
    ambPlay(): string {
      return root().style.getPropertyValue("--amb-play");
    },
    animatedAttr(): string | null {
      return root().getAttribute("data-animated");
    },
    ambientStyleAttr(): string | null {
      return root().getAttribute("data-ambient-style");
    },
    hasLayer(layer: string): boolean {
      return root().querySelector(`[data-layer="${layer}"]`) != null;
    },
  };
}
