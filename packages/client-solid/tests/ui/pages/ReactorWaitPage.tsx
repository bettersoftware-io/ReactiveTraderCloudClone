import { cleanup, render, screen } from "@solidjs/testing-library";

import { ReactorWait } from "#/ui/shell/auth/wait/ReactorWait";

export interface ReactorWaitPage {
  mount(): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  text(testId: string): string;
  statusText(): string;
  hasIndeterminateBar(): boolean;
  indeterminateBarHasChild(): boolean;
  svgCount(testId: string): number;
}

/** The framework surface for `ReactorWait.test.tsx`. */
export function reactorWaitPage(): ReactorWaitPage {
  function root(testId: string): HTMLElement {
    return screen.getByTestId(testId);
  }

  return {
    mount(): void {
      render(() => {
        return <ReactorWait />;
      });
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    text(testId: string): string {
      return root(testId).textContent ?? "";
    },
    statusText(): string {
      return screen.getByRole("status").textContent ?? "";
    },
    hasIndeterminateBar(): boolean {
      return (
        root("auth-wait-reactor").querySelector('[aria-hidden="true"]') != null
      );
    },
    indeterminateBarHasChild(): boolean {
      const track = root("auth-wait-reactor").querySelector(
        '[aria-hidden="true"]',
      );

      return track?.querySelector("div") != null;
    },
    svgCount(testId: string): number {
      return root(testId).querySelectorAll("svg").length;
    },
  };
}
