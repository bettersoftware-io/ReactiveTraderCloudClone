import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@solidjs/testing-library";

import { AppRoot } from "#/AppRoot";
import { App } from "#/ui/App";

interface WaitForOptions {
  timeout: number;
}

export interface AppPage {
  mount(): void;
  unmountAll(): void;
  /** Fills and submits the committed demo credentials on the login form. Does
   * NOT wait for the login screen to disappear — that is an assertion
   * (`page.exists("login-screen")`), so it stays spec-side via `waitFor`,
   * matching the `waitFor(assertion)` shape everywhere else in this page: a
   * page method never hand-throws a wait condition, it only ever performs
   * the mechanical action. */
  signIn(): void;
  exists(testId: string): boolean;
  text(testId: string): string;
  click(testId: string): void;
  isActiveTab(testId: string): boolean;
  pendingPanelCount(): number;
  /** The `connection-status` host's own label child's `data-status`
   * attribute (the host div itself carries no such attribute — only its
   * dot/label descendants do). */
  connectionStatusDataStatus(): string | null;
  /** Runs `assertion` until it stops throwing (or `options.timeout`
   * elapses) — the spec supplies the assertion, this page owns the polling
   * mechanic. */
  waitFor(assertion: () => void, options?: WaitForOptions): Promise<void>;
}

/** The framework surface for `App.test.tsx` — the real composition root
 * (`AppRoot` → `createApp(buildBrowserPorts())` → simulator ports), so this
 * page owns render/fireEvent/waitFor mechanics only; no fakes cross this
 * seam. */
export function appPage(): AppPage {
  return {
    mount(): void {
      render(() => {
        return (
          <AppRoot>
            <App />
          </AppRoot>
        );
      });
    },
    unmountAll(): void {
      cleanup();
    },
    signIn(): void {
      fireEvent.input(screen.getByTestId("login-username"), {
        target: { value: "demo" },
      });
      fireEvent.input(screen.getByTestId("login-password"), {
        target: { value: "mcdc2026" },
      });
      fireEvent.click(screen.getByTestId("login-submit"));
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    text(testId: string): string {
      return screen.getByTestId(testId).textContent ?? "";
    },
    click(testId: string): void {
      screen.getByTestId(testId).click();
    },
    isActiveTab(testId: string): boolean {
      return screen.getByTestId(testId).getAttribute("data-active") === "true";
    },
    pendingPanelCount(): number {
      return screen.queryAllByTestId("pending-panel").length;
    },
    connectionStatusDataStatus(): string | null {
      const label = screen
        .getByTestId("connection-status")
        .querySelector("span:last-child");

      return label?.getAttribute("data-status") ?? null;
    },
    waitFor(assertion: () => void, options?: WaitForOptions): Promise<void> {
      return waitFor(assertion, options);
    },
  };
}
