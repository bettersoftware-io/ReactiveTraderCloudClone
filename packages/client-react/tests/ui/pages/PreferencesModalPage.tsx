import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { AmbientStyle, JarvisBrain, JarvisEffort } from "@rtc/domain";
import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { PreferencesModal } from "#/ui/shell/prefs/PreferencesModal";

interface JarvisGate {
  level: "soft" | "hard";
  resetsAtMs: number;
  gated: readonly JarvisBrain[];
}

interface PreferencesModalOptions {
  ambientStyle?: AmbientStyle;
  setAmbientStyle?: (style: AmbientStyle) => void;
  jarvisBrains?: readonly JarvisBrain[];
  jarvisBrain?: JarvisBrain;
  setJarvisBrain?: (brain: JarvisBrain) => void;
  jarvisEffort?: JarvisEffort;
  setJarvisEffort?: (effort: JarvisEffort) => void;
  jarvisGate?: JarvisGate | null;
}

export interface PreferencesModalPage {
  mount(options?: PreferencesModalOptions): void;
  unmountAll(): void;
  roleButtonPressed(name: RegExp): string | null;
  clickRoleButton(name: RegExp): void;
  isDisabled(testId: string): boolean;
  click(testId: string): void;
  exists(testId: string): boolean;
  attribute(testId: string, name: string): string | null;
  text(testId: string): string;
}

/** The framework surface for `PreferencesModal.test.tsx`. */
export function preferencesModalPage(): PreferencesModalPage {
  return {
    mount(options: PreferencesModalOptions = {}): void {
      const {
        ambientStyle = "aurora",
        setAmbientStyle = vi.fn(),
        jarvisBrains = [],
        jarvisBrain = "scripted",
        setJarvisBrain = vi.fn(),
        jarvisEffort = "medium",
        setJarvisEffort = vi.fn(),
        jarvisGate = null,
      } = options;

      const hooks = {
        useAnimatedBackground: () => {
          return { enabled: true, toggle: vi.fn() };
        },
        usePowerSaver: () => {
          return { level: "off", setLevel: vi.fn() };
        },
        useAmbientStyle: () => {
          return { style: ambientStyle, setStyle: setAmbientStyle };
        },
        // Not exercised here (the shared ui-contract tier covers the Chart
        // renderer row) — but the modal destructures it, so a fake that
        // omits it fails to render at all.
        useChartSubstrate: () => {
          return { substrate: "dom", setSubstrate: vi.fn() };
        },
        // Not exercised here (the shared ui-contract tier covers the Layout
        // engine row) — but the modal destructures it, so a fake that omits
        // it fails to render at all.
        useLayoutEngine: () => {
          return { engine: "inhouse", setEngine: vi.fn() };
        },
        useForceBootAnimation: () => {
          return { enabled: false, toggle: vi.fn() };
        },
        // Not exercised here (the shared ui-contract tier covers the
        // login-wait rows for both frameworks) — but the modal destructures
        // it, so a fake that omits it fails to render at all.
        useLoginWaitPreferences: () => {
          return {
            style: "auto",
            setStyle: vi.fn(),
            delay: "off",
            setDelay: vi.fn(),
          };
        },
        useJarvis: () => {
          return {
            state: {
              available: true,
              brains: jarvisBrains,
              effectiveBrain: jarvisBrain,
              gate: jarvisGate,
            },
          };
        },
        useJarvisPreferences: () => {
          return {
            brain: jarvisBrain,
            setBrain: setJarvisBrain,
            effort: jarvisEffort,
            setEffort: setJarvisEffort,
          };
        },
        // Not exercised here (no test in this file clicks RESET) — but the
        // modal destructures it, so a fake that omits it fails to render at
        // all.
        useWorkspaceReset: () => {
          return vi.fn();
        },
      } as unknown as ViewModel;

      render(
        <ViewModelContext.Provider value={hooks}>
          <PreferencesModal open onClose={() => {}} />
        </ViewModelContext.Provider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    roleButtonPressed(name: RegExp): string | null {
      return screen.getByRole("button", { name }).getAttribute("aria-pressed");
    },
    clickRoleButton(name: RegExp): void {
      fireEvent.click(screen.getByRole("button", { name }));
    },
    isDisabled(testId: string): boolean {
      return (screen.getByTestId(testId) as HTMLButtonElement).disabled;
    },
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    attribute(testId: string, name: string): string | null {
      return screen.getByTestId(testId).getAttribute(name);
    },
    text(testId: string): string {
      return screen.getByTestId(testId).textContent ?? "";
    },
  };
}
