import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import type { JSX } from "solid-js";

/** A jsdom stand-in for the OS window a pop-out opens into. dockview calls
 * the real `window.open`, so the URL it asks for is observable here, and the
 * child it receives is an iframe-backed window with a real document — enough
 * for dockview to run its actual popout transaction (append its container,
 * copy stylesheets, MOVE the panel's DOM across) rather than a simulation of
 * one. Nothing about the engine or the bridge is mocked. Ported verbatim in
 * shape from the react twin's page. */
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

export interface DockviewLayoutEngineBridgePage {
  mount(element: () => JSX.Element): void;
  unmountAll(): void;
  /** Runs `assertion` until it stops throwing (or the timeout elapses) —
   * the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void): Promise<void>;
  /** The layout-engine root's `attribute` value, or null when absent. */
  engineAttribute(attribute: string): string | null;
  /** The control's `disabled` state, or null when no such testid exists. */
  controlDisabled(testId: string): boolean | null;
  clickControl(testId: string): void;
  /** Installs the pop-out window stand-in for the duration of a spec. */
  stubPopoutWindow(): PopoutWindowHarness;
}

/** The framework surface for `DockviewLayoutEngine.popout.test.tsx` — the
 * solid bridge's jsdom wiring tests (the react twin reuses its StrictMode
 * page; solid has no StrictMode, so this page carries only render/waitFor). */
export function dockviewLayoutEngineBridgePage(): DockviewLayoutEngineBridgePage {
  return {
    mount(element: () => JSX.Element): void {
      render(element);
    },
    unmountAll(): void {
      cleanup();
    },
    waitFor(assertion: () => void): Promise<void> {
      return waitFor(assertion);
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
    stubPopoutWindow(): PopoutWindowHarness {
      return stubPopoutWindow();
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
        await new Promise((resolve) => {
          return setTimeout(resolve, LOAD_HANDSHAKE_TICK_MS);
        });
        child.dispatchEvent(new Event("load"));
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
