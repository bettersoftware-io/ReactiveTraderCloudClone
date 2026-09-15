import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

interface WaitForOptions {
  timeout: number;
}

/** A jsdom stand-in for the OS window a pop-out opens into. dockview calls
 * the real `window.open`, so the URL it asks for is observable here, and the
 * child it receives is an iframe-backed window with a real document — enough
 * for dockview to run its actual popout transaction (append its container,
 * copy stylesheets, MOVE the panel's DOM across) rather than a simulation of
 * one. Nothing about the engine or the bridge is mocked. */
interface PopoutWindowHarness {
  /** Every URL `window.open` was asked for, in order. */
  requestedUrls(): readonly string[];
  /** Drives the child's load handshake — dockview defers the rest of the
   * transaction until the popout document reports itself loaded, which
   * jsdom never does on its own for a detached about:blank frame. */
  settleOpen(): Promise<void>;
  /** How much DOM dockview moved into the child — the witness that the
   * panel really crossed the document boundary. */
  childContentLength(): number;
  /** Restores the real `window.open` and drops the stand-in document. */
  restore(): void;
}

export interface DockviewLayoutEngineStrictModePage {
  mount(element: ReactElement): void;
  /** Re-renders the LAST mount with new props — the prop-flip half of a
   * replay spec (a fresh mount would rebuild the engine instead). */
  rerender(element: ReactElement): void;
  unmountAll(): void;
  /** Runs `assertion` until it stops throwing (or `options.timeout` elapses)
   * — the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void, options?: WaitForOptions): Promise<void>;
  /** Runs `work` inside React's `act` — for driving a captured engine
   * callback (a setState outside any React event) from a spec. */
  runInAct(work: () => void): void;
  /** The layout-engine root's `attribute` value, or null when absent. */
  engineAttribute(attribute: string): string | null;
  /** The control's `disabled` state, or null when no such testid exists. */
  controlDisabled(testId: string): boolean | null;
  clickControl(testId: string): void;
  /** The engine's `data-groups` witness — how many dockview groups the
   * mounted engine currently reports, as a string (the attribute's raw
   * form). */
  groupsAttr(): string | null;
  /** Whether a testid the registry/portal tree renders is present. */
  bodyVisible(testId: string): boolean;
  /** Stands in for a user having arranged the dock: #737 changed
   * `createDockEngine`'s `dispose()` to flush its final serialisation only
   * once a `pointerdown` has landed inside the container since
   * construction — an untouched engine's dispose writes nothing. Mirrors
   * `layout-dockview`'s own `touchContainer` test helper. */
  touchDock(): void;
  /** Installs the pop-out window stand-in for the duration of a spec. */
  stubPopoutWindow(): PopoutWindowHarness;
  /** Records every `console.error` for the duration of `work`, returning the
   * messages — React reports duplicate keys through exactly that channel. */
  captureConsoleErrors(work: () => Promise<void>): Promise<readonly string[]>;
}

/** The framework surface for `DockviewLayoutEngine.strictMode.test.tsx`. The
 * spec composes its own `<StrictMode>` wrapper around `DockviewLayoutEngine`
 * (kept spec-side — moving it page-side would obscure what the test actually
 * mounts), so this page owns only the render/waitFor mechanics. */
export function dockviewLayoutEngineStrictModePage(): DockviewLayoutEngineStrictModePage {
  let last: ReturnType<typeof render> | null = null;

  return {
    mount(element: ReactElement): void {
      last = render(element);
    },
    rerender(element: ReactElement): void {
      if (last === null) {
        throw new Error("rerender before mount");
      }

      last.rerender(element);
    },
    unmountAll(): void {
      cleanup();
    },
    waitFor(assertion: () => void, options?: WaitForOptions): Promise<void> {
      return waitFor(assertion, options);
    },
    runInAct(work: () => void): void {
      act(work);
    },
    engineAttribute(attribute: string): string | null {
      return (
        screen.queryByTestId("layout-engine")?.getAttribute(attribute) ?? null
      );
    },
    controlDisabled(testId: string): boolean | null {
      const control = screen.queryByTestId(testId);

      return control instanceof HTMLButtonElement ? control.disabled : null;
    },
    clickControl(testId: string): void {
      screen.getByTestId(testId).click();
    },
    groupsAttr(): string | null {
      return screen.getByTestId("layout-engine").getAttribute("data-groups");
    },
    bodyVisible(testId: string): boolean {
      return screen.queryByTestId(testId) !== null;
    },
    touchDock(): void {
      // `.dockview-theme-rtc` is the literal class the bridge puts on its
      // container div (not a CSS Modules token), so it's reachable
      // regardless of how modules resolve in this test run.
      const container = document.querySelector(".dockview-theme-rtc");

      if (container === null) {
        throw new Error("touchDock: no mounted dock container found");
      }

      container.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    },
    stubPopoutWindow(): PopoutWindowHarness {
      return stubPopoutWindow();
    },
    async captureConsoleErrors(
      work: () => Promise<void>,
    ): Promise<readonly string[]> {
      const messages: string[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
        messages.push(args.map(String).join(" "));
      });

      try {
        await work();
      } finally {
        spy.mockRestore();
      }

      return messages;
    },
  };
}

/** The load handshake dockview waits on before finishing a popout: jsdom
 * fires no `load` for a detached frame, so the spec drives it. Repeated
 * because the engine attaches its listener asynchronously — an already-fired
 * event would otherwise be missed. */
const LOAD_HANDSHAKE_TICKS = 6;
const LOAD_HANDSHAKE_TICK_MS = 60;

function stubPopoutWindow(): PopoutWindowHarness {
  const requested: string[] = [];
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const child = frame.contentWindow;

  if (child === null) {
    throw new Error("jsdom gave the stand-in frame no contentWindow");
  }

  const realOpen = window.open.bind(window);

  window.open = (url?: string | URL): Window | null => {
    requested.push(String(url ?? ""));

    return child;
  };

  return {
    requestedUrls(): readonly string[] {
      return requested;
    },
    async settleOpen(): Promise<void> {
      for (let tick = 0; tick < LOAD_HANDSHAKE_TICKS; tick += 1) {
        await act(async () => {
          await new Promise((resolve) => {
            return setTimeout(resolve, LOAD_HANDSHAKE_TICK_MS);
          });
          child.dispatchEvent(new Event("load"));
        });
      }
    },
    childContentLength(): number {
      return child.document.body.innerHTML.length;
    },
    restore(): void {
      window.open = realOpen;
      frame.remove();
    },
  };
}
