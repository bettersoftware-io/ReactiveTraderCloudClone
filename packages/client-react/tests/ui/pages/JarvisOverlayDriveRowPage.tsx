import { cleanup, render, screen } from "@testing-library/react";

import type { JarvisEntry } from "@rtc/client-core";
import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelContext } from "@rtc/react-bindings";

import { JarvisOverlay } from "#/ui/shell/jarvis/JarvisOverlay";

export interface JarvisOverlayDriveRowPage {
  mount(entries: readonly JarvisEntry[]): void;
  unmountAll(): void;
  entryCount(): number;
  entryText(index: number): string;
  entryRole(index: number): string | null;
  entryDone(index: number): string | null;
  entryHasOrigin(index: number): boolean;
  entryTexts(): (string | null)[];
}

function entryAt(index: number): HTMLElement {
  const match = screen.getAllByTestId("jarvis-entry")[index];

  if (match === undefined) {
    throw new Error(`no jarvis-entry at index ${index}`);
  }

  return match;
}

/** The framework surface for `JarvisOverlay.driveRow.test.tsx`. */
export function jarvisOverlayDriveRowPage(): JarvisOverlayDriveRowPage {
  return {
    mount(entries: readonly JarvisEntry[]): void {
      const hooks = {
        useJarvis: () => {
          return {
            state: {
              open: true,
              skin: "singularity",
              unread: 0,
              unreadNarration: false,
              phase: "idle",
              entries,
              pendingConfirmation: null,
              available: true,
              openCount: 0,
            },
            close: () => {},
            toggle: () => {},
            send: () => {},
            approveConfirmation: () => {},
            declineConfirmation: () => {},
            setSkin: () => {},
          };
        },
        useJarvisDemo: () => {
          return {
            state: { running: false, stepIndex: 0, stepCount: 7, label: null },
            startDemo: () => {},
            stopDemo: () => {},
          };
        },
      } as unknown as ViewModel;

      render(
        <ViewModelContext.Provider value={hooks}>
          <JarvisOverlay />
        </ViewModelContext.Provider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    entryCount(): number {
      return screen.getAllByTestId("jarvis-entry").length;
    },
    entryText(index: number): string {
      return entryAt(index).textContent ?? "";
    },
    entryRole(index: number): string | null {
      return entryAt(index).getAttribute("data-role");
    },
    entryDone(index: number): string | null {
      return entryAt(index).getAttribute("data-done");
    },
    entryHasOrigin(index: number): boolean {
      return entryAt(index).hasAttribute("data-origin");
    },
    entryTexts(): (string | null)[] {
      return screen.getAllByTestId("jarvis-entry").map((entry) => {
        return entry.textContent;
      });
    },
  };
}
