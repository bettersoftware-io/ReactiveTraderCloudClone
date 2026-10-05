import { state } from "@rx-state/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BehaviorSubject } from "rxjs";

import { rxjsCore } from "@rtc/client-core-rxjs";
import type { CoreSelection } from "@rtc/core-api";

import { AppRoot } from "#/AppRoot";

/** A no-op `CoreSelection`: this page always mounts the RxJS core directly,
 * so there is no runtime switch to exercise here. */
const coreSelection: CoreSelection = {
  current: "rxjs",
  options: [],
  select: (): void => {},
  failure$: state(new BehaviorSubject<string | null>(null), null),
};

export interface AppRootPage {
  /** Mounts the REAL composition root (`AppRoot` →
   * `createApp(buildBrowserPorts())`) around a marker child, so "the app
   * rendered" is one testid rather than the whole workspace. */
  mount(): void;
  unmountAll(): void;
  exists(testId: string): boolean;
  /** The demo-account rows' usernames, top to bottom; empty when the login
   * screen shows no hint. */
  demoAccountUsernames(): string[];
  /** Click the demo-account row for `username`. */
  pickDemoAccount(username: string): void;
  /** Click AUTHENTICATE. */
  submitLogin(): void;
  /** Runs `assertion` until it stops throwing — the spec supplies the
   * assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void): Promise<void>;
}

/** The framework surface for `AppRoot.test.tsx` — no fakes cross this seam. */
export function appRootPage(): AppRootPage {
  return {
    mount(): void {
      render(
        <AppRoot core={rxjsCore} coreSelection={coreSelection}>
          <div data-testid="app-children" />
        </AppRoot>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
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
    submitLogin(): void {
      fireEvent.click(screen.getByTestId("login-submit"));
    },
    waitFor(assertion: () => void): Promise<void> {
      return waitFor(assertion);
    },
  };
}

function findDemoAccountRows(): HTMLElement[] {
  return screen.queryAllByTestId("login-demo-account");
}
