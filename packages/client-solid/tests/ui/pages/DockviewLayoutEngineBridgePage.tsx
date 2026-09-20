import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";

import type {
  DockLayoutStore,
  LayoutPanelInstance,
  PanelId,
  WorkspaceTab,
} from "@rtc/client-core";

import { DockviewLayoutEngine } from "#/ui/shell/layout/dockview/DockviewLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

/** A prop a case either fixes (`[AAPL]`) or drives live (`instances` from its
 * own `createSignal`). Solid component bodies run ONCE, so a prop that changes
 * after mount must arrive as an accessor; one that never changes reads better
 * as a plain value. The page accepts both, so each case writes whichever is
 * true of it. */
type Live<T> = T | (() => T);

/** What the three specs sharing this page vary. Everything optional carries
 * the default a case that does not name it wants. `registry` stays REQUIRED:
 * its panel bodies carry the testids each spec asserts on, so the spec owns
 * them. The four layout intents never varied in any case, so they stay the
 * page's business; `onCloseInstance` is exposed because the instances spec
 * asserts it fires. */
interface DockviewLayoutEngineBridgeMountProps {
  registry: Live<PanelRegistry>;
  store: DockLayoutStore;
  /** Default `null` — nothing maximized. */
  maximized?: Live<PanelId | null>;
  /** Default `[]` — no Jarvis-docked dynamic panel. */
  docked?: Live<readonly PanelId[]>;
  /** Default `[]` — no pinned chart instance. */
  instances?: Live<readonly LayoutPanelInstance[]>;
  /** Default `0`. A bump rebuilds the engine in place. */
  layoutResets?: Live<number>;
  /** Default a no-op. */
  onCloseInstance?: (id: PanelId) => void;
  /** Default absent — the bridge reports detached panels to nobody. The
   * floating spec passes a recorder to assert the whole-set reports. */
  onDetachedPanelsChange?: (
    tab: WorkspaceTab,
    panelIds: readonly PanelId[],
  ) => void;
  /** Default absent — the bridge registers its live snapshot source with
   * nobody. The snapshot spec passes a recorder to assert the source/null
   * sequence and what each registered source reads. */
  onSnapshotSourceChange?: (
    tab: WorkspaceTab,
    source: (() => string) | null,
  ) => void;
}

function noop(): void {}

/** Reads a `Live` prop. Called INSIDE the JSX below, so Solid's compiler wraps
 * each prop in a reactive getter — the constraint the docked page documents. */
function read<T>(value: Live<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

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
  /** Mounts the bridge ONCE; later prop changes are driven by the spec's own
   * signal setters through `Live` accessors, never by re-mounting. */
  mount(props: DockviewLayoutEngineBridgeMountProps): void;
  unmountAll(): void;
  /** Runs `assertion` until it stops throwing (or the timeout elapses) —
   * the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void): Promise<void>;
  /** The layout-engine root's `attribute` value, or null when absent. */
  engineAttribute(attribute: string): string | null;
  /** The engine's `data-groups` witness, as the attribute's raw string. */
  groupsAttr(): string | null;
  /** Whether a testid the registry/portal tree renders is present. */
  bodyVisible(testId: string): boolean;
  /** The element carrying `testId`, or null — for node-identity assertions
   * (a remount replaces the node even when its content is identical). */
  bodyElement(testId: string): HTMLElement | null;
  /** The control's `disabled` state, or null when no such testid exists. */
  controlDisabled(testId: string): boolean | null;
  clickControl(testId: string): void;
  /** Stands in for a user having arranged the dock: #737 changed
   * `createDockEngine`'s `dispose()` to flush its final serialisation only
   * once a `pointerdown` has landed inside the container since
   * construction — an untouched engine's dispose writes nothing. Mirrors
   * `layout-dockview`'s own `touchContainer` test helper. */
  touchDock(): void;
  /** Installs the pop-out window stand-in for the duration of a spec. */
  stubPopoutWindow(): PopoutWindowHarness;
}

/** The framework surface for the solid bridge's jsdom wiring tests —
 * `DockviewLayoutEngine.{popout,instances,floating}.test.tsx` (the react twin
 * reuses its StrictMode page; solid has no StrictMode).
 *
 * This page CONSTRUCTS the engine. It used to take `() => JSX.Element`, so all
 * three specs wrote the full fifteen-prop engine block themselves — the defect
 * rtc/page-objects-own-their-component exists for, in Solid's shape. The rule
 * missed that shape until it learned to climb through a parameter's own
 * function type. */
export function dockviewLayoutEngineBridgePage(): DockviewLayoutEngineBridgePage {
  return {
    mount(props: DockviewLayoutEngineBridgeMountProps): void {
      render(() => {
        return (
          <DockviewLayoutEngine
            tab="fx"
            registry={read(props.registry)}
            store={props.store}
            maximized={read(props.maximized ?? null)}
            collapsed={[]}
            closed={[]}
            docked={read(props.docked ?? [])}
            instances={read(props.instances ?? [])}
            layoutResets={read(props.layoutResets ?? 0)}
            onMaximize={noop}
            onRestore={noop}
            onCollapse={noop}
            onExpand={noop}
            onCloseInstance={props.onCloseInstance ?? noop}
            onDetachedPanelsChange={props.onDetachedPanelsChange}
            onSnapshotSourceChange={props.onSnapshotSourceChange}
          />
        );
      });
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
    groupsAttr(): string | null {
      return screen.getByTestId("layout-engine").getAttribute("data-groups");
    },
    bodyVisible(testId: string): boolean {
      return screen.queryByTestId(testId) !== null;
    },
    bodyElement(testId: string): HTMLElement | null {
      return screen.queryByTestId(testId);
    },
    controlDisabled(testId: string): boolean | null {
      const control = screen.queryByTestId(testId);

      return control instanceof HTMLButtonElement ? control.disabled : null;
    },
    clickControl(testId: string): void {
      screen.getByTestId(testId).click();
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
