import { state } from "@rx-state/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@solidjs/testing-library";
import { BehaviorSubject } from "rxjs";

import { rxjsCore } from "@rtc/client-core-rxjs";
import type { CoreSelection } from "@rtc/core-api";
import type { Composition } from "@rtc/web-boot";

import { AppRoot } from "#/AppRoot";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";
import { App } from "#/ui/App";

/** A no-op `CoreSelection`: this page always mounts the RxJS core directly,
 * so there is no runtime switch to exercise here — `Preferences.contract.spec.ts`
 * (via the shared ui-contract fixture) is what drives the real "Application
 * core" row. */
const coreSelection: CoreSelection = {
  current: "rxjs",
  options: [],
  select: (): void => {},
  failure$: state(new BehaviorSubject<string | null>(null), null),
};

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
  /** The demo-account rows' usernames, top to bottom; empty when the login
   * screen shows no hint. */
  demoAccountUsernames(): string[];
  /** Click the demo-account row for `username`. */
  pickDemoAccount(username: string): void;
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

/** The framework surface for `App.test.tsx` — the real UI root (`AppRoot`)
 * on a boot composition over `buildBrowserPorts()` (simulator ports), so this
 * page owns render/fireEvent/waitFor mechanics only; no fakes cross this
 * seam. */
export function appPage(): AppPage {
  return {
    mount(): void {
      render(() => {
        return (
          <AppRoot composition={createComposition()}>
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
    demoAccountUsernames(): string[] {
      return findDemoAccountRows().map((row) => {
        return row.getAttribute("data-username") ?? "";
      });
    },
    pickDemoAccount(username: string): void {
      const row = findDemoAccountRows().find((candidate) => {
        return candidate.getAttribute("data-username") === username;
      });

      if (row === undefined) {
        throw new Error(`no demo-account row for "${username}"`);
      }

      fireEvent.click(row);
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

function findDemoAccountRows(): HTMLElement[] {
  return screen.queryAllByTestId("login-demo-account");
}

/** The boot composition the core host would build for the RxJS core over
 * the page's real `buildBrowserPorts()` — built at mount time, after a spec
 * has stubbed the env the ports read. Uninstrumented: no devtools here. */
function createComposition(): Composition {
  const app = rxjsCore.createApp(buildBrowserPorts());

  return {
    impl: "rxjs",
    generation: 1,
    presenters: app.presenters,
    machineFactories: rxjsCore.createMachineFactories(app.presenters),
    commands: app.commands,
    coreSelection,
    takePreferencesReopen: () => {
      return false;
    },
    peekPreferencesReopen: () => {
      return false;
    },
  };
}
