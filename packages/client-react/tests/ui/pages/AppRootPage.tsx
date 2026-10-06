import { state } from "@rx-state/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode, Suspense } from "react";
import { BehaviorSubject } from "rxjs";

import { rxjsCore } from "@rtc/client-core-rxjs";
import type { CoreSelection } from "@rtc/core-api";
import type { Composition } from "@rtc/web-boot";

import { AppRoot } from "#/AppRoot";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";
import { HeaderChrome } from "#/ui/shell/chrome/HeaderChrome";

import { Suspender } from "./Suspender";

/** A no-op `CoreSelection`: this page always mounts the RxJS core directly,
 * so there is no runtime switch to exercise here. */
const coreSelection: CoreSelection = {
  current: "rxjs",
  options: [],
  select: (): void => {},
  failure$: state(new BehaviorSubject<string | null>(null), null),
};

export interface AppRootPage {
  /** Mounts the REAL UI root (`AppRoot`) on a boot composition over
   * `buildBrowserPorts()`, around a marker child, so "the app rendered" is
   * one testid rather than the whole workspace. */
  mount(): void;
  /** Mounts the header (not the whole App) under `AppRoot` inside
   * `StrictMode`, as `main.tsx` does, on the composition a core swap
   * produced: its shell's one-shot "reopen Preferences" is armed, and the
   * boot splash does not play (the core host plays it once per page). */
  mountHeaderAfterCoreSwap(): void;
  /** As `mountHeaderAfterCoreSwap`, with a Suspense boundary above the
   * header and a sibling that suspends on its first render, so React throws
   * the header's first render away and renders it again once the sibling's
   * data arrives. Returns the function that delivers that data and resolves
   * once React has committed the retry: it runs inside an awaited `act`,
   * where React reveals a Suspense boundary at once instead of holding the
   * commit back on its 300 ms fallback throttle — so the caller asserts
   * straight after it, with no wait on real time. */
  mountHeaderAfterCoreSwapBesideSuspender(): () => Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
  /** The demo-account rows' usernames, top to bottom; empty when the login
   * screen shows no hint. */
  demoAccountUsernames(): string[];
  /** Click the demo-account row for `username`. */
  pickDemoAccount(username: string): void;
  /** Click AUTHENTICATE. */
  submitLogin(): void;
  /** Click AUTHENTICATE inside an awaited `act`, for a tree that suspends
   * once signed in (a synchronous `act` cannot wait out a suspension). */
  submitLoginAwaitingSuspense(): Promise<void>;
  /** Runs `assertion` until it stops throwing — the spec supplies the
   * assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void): Promise<void>;
}

/** The framework surface for `AppRoot.test.tsx` — no fakes cross this seam. */
export function appRootPage(): AppRootPage {
  return {
    mount(): void {
      render(
        <AppRoot composition={createComposition(false)}>
          <div data-testid="app-children" />
        </AppRoot>,
      );
    },
    mountHeaderAfterCoreSwapBesideSuspender(): () => Promise<void> {
      let resolve: (value: string) => void = noValue;
      const promise = new Promise<string>((settle) => {
        resolve = settle;
      });

      render(
        <StrictMode>
          <AppRoot composition={createComposition(true)}>
            <Suspense fallback={<div data-testid="suspense-fallback" />}>
              <HeaderChrome activeTab="fx" onTabChange={selectNoTab} />
              <Suspender data={promise} />
            </Suspense>
          </AppRoot>
        </StrictMode>,
      );

      return async (): Promise<void> => {
        await act(async () => {
          resolve("ready");
          await promise;
        });
      };
    },
    mountHeaderAfterCoreSwap(): void {
      render(
        <StrictMode>
          <AppRoot composition={createComposition(true)}>
            <HeaderChrome activeTab="fx" onTabChange={selectNoTab} />
          </AppRoot>
        </StrictMode>,
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
    async submitLoginAwaitingSuspense(): Promise<void> {
      await act(async () => {
        fireEvent.click(screen.getByTestId("login-submit"));
        await Promise.resolve();
      });
    },
    waitFor(assertion: () => void): Promise<void> {
      return waitFor(assertion);
    },
  };
}

function selectNoTab(): void {}

/** The boot-splash port as the core host hands it to every composition after
 * the page's first. */
const SPLASH_ALREADY_PLAYED = {
  shouldPlay: (): boolean => {
    return false;
  },
};

function noValue(_value: string): void {}

/** A composition the core host would build for the RxJS core over the
 * page's real `buildBrowserPorts()` — built at mount time, after a spec has
 * stubbed the env the ports read. Uninstrumented: no devtools here.
 *
 * `afterSwap` makes it the composition a swap produced, with both things the
 * host does for one: the shell's one-shot "reopen Preferences" is armed, and
 * the boot-splash port answers "do not play" (`coreHost.ts`'s
 * `playOncePerPage`). The second matters to a test beyond fidelity: a
 * playing splash re-renders on every progress tick, and those updates
 * pre-empt React's low-priority Suspense retry — on a slow runner the retry
 * is starved until the splash ends, seconds later. */
function createComposition(afterSwap: boolean): Composition {
  const pagePorts = buildBrowserPorts();
  const app = rxjsCore.createApp(
    afterSwap ? { ...pagePorts, bootSplash: SPLASH_ALREADY_PLAYED } : pagePorts,
  );
  let reopenPending = afterSwap;

  return {
    impl: "rxjs",
    generation: 1,
    presenters: app.presenters,
    machineFactories: rxjsCore.createMachineFactories(app.presenters),
    commands: app.commands,
    coreSelection,
    takePreferencesReopen: () => {
      const reopen = reopenPending;
      reopenPending = false;
      return reopen;
    },
    peekPreferencesReopen: () => {
      return reopenPending;
    },
  };
}

function findDemoAccountRows(): HTMLElement[] {
  return screen.queryAllByTestId("login-demo-account");
}
