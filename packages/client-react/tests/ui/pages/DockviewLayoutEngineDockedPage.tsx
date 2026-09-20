import { cleanup, render, screen, waitFor } from "@testing-library/react";

import type { DockLayoutStore, PanelId } from "@rtc/client-core";

import { DockviewLayoutEngine } from "#/ui/shell/layout/dockview/DockviewLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

interface WaitForOptions {
  timeout: number;
}

function noop(): void {}

/** What a case may vary. Everything optional carries the default a case that
 * does NOT name it wants, so a `mount` states only the arrangement under
 * test — `mount({ registry, store, docked: ["panel-dyn-1"] })` says "one
 * docked panel and nothing else unusual", and the next case's extra `closed`
 * is visible as one added line rather than buried in fifteen identical ones.
 *
 * `registry` stays REQUIRED: the panel bodies carry the testids the spec
 * asserts on, so the spec owns them (the solid twin requires it for the same
 * reason). The props this page does NOT expose at all — `instances` and the
 * five `on*` intents — never varied across any case; they are the page's
 * business, which is the point of a page object. */
interface DockviewLayoutEngineDockedPageProps {
  registry: PanelRegistry;
  /** Default: a fresh `InMemoryDockLayoutStore`. Pass one explicitly to share
   * it across a mount/rerender pair, or to read back what was saved. */
  store: DockLayoutStore;
  /** Default `null` — nothing maximized. */
  maximized?: PanelId | null;
  /** Default `[]` — no panel collapsed to a strip. */
  collapsed?: readonly PanelId[];
  /** Default `[]` — no panel closed from the View menu. */
  closed?: readonly PanelId[];
  /** Default `[]` — no Jarvis-docked dynamic panel. */
  docked?: readonly PanelId[];
  /** Default `0`. A bump rebuilds the engine in place — see the component's
   * REBUILD CONTRACT doc. */
  layoutResets?: number;
}

export interface DockviewLayoutEngineDockedPage {
  mount(props: DockviewLayoutEngineDockedPageProps): void;
  /** Re-renders the SAME React tree with new props — the mechanism a `docked`
   * prop change, or a `layoutResets` bump (a workspace-reset rebuild, in
   * place — no `key` change involved), goes through in the real app. */
  rerender(props: DockviewLayoutEngineDockedPageProps): void;
  unmountAll(): void;
  /** The engine's `data-groups` witness — how many dockview groups the
   * mounted engine currently reports, as a string (the attribute's raw
   * form). Only current as of the last debounced `onLayoutChange` — a group
   * ADDED OR REMOVED on an already-live engine (as opposed to one read at
   * construction) needs `waitFor` around this, same as the strictMode
   * page's saved-blob witness. */
  groupsAttr(): string | null;
  /** The engine's `data-maximized` witness — the maximized panel id, or ""
   * when none, the SAME render as InhouseLayoutEngine's own root attribute.
   * Current the instant the prop changes, so unlike `groupsAttr` it needs no
   * `waitFor`. Returns null only if the attribute is missing entirely, which
   * is the regression the two witness cases exist to catch. */
  maximizedAttr(): string | null;
  /** Whether a testid the registry/portal tree renders is present. */
  bodyVisible(testId: string): boolean;
  /** Whether `panelId`'s tab slot carries dockview-hud.css's strip marker
   * (`data-dock-strip`) — set the instant the live diff effect calls
   * `collapsePanel`, so unlike `groupsAttr` this needs no `waitFor`. */
  stripMarked(panelId: string): boolean;
  /** Whether both panels' tab slots sit inside the SAME dockview group
   * element — the LIVE-DOM stack witness. `groupsAttr` only COUNTS groups;
   * this says WHICH panels share one, so a blob whose distinguishing
   * structure is "these two are tabbed together" can be asserted positively
   * on the rendered tree rather than only in the persisted JSON.
   * `.dv-groupview` is the same dockview-internal class name the bridge's own
   * mount callback keys off. */
  sharesGroupInDom(panelIdA: string, panelIdB: string): boolean;
  /** Dispatches a bubbling `pointerdown` inside the engine's dockview
   * container, which arms `createDockEngine`'s `userArranged` origin flag —
   * the gate on whether its `dispose()` flushes one final serialize. jsdom
   * never produces a real pointer, so an untouched engine skips that flush
   * entirely: without this, a spec measuring what a REBUILD does with the
   * outgoing engine's last write would pass with the hazard simply absent. */
  pressDockContainer(): void;
  /** Runs `assertion` until it stops throwing (or `options.timeout` elapses)
   * — the spec supplies the assertion, this page owns the polling mechanic. */
  waitFor(assertion: () => void, options?: WaitForOptions): Promise<void>;
}

/** The framework surface for `DockviewLayoutEngine.docked.test.tsx` — the
 * `docked` prop's membership diff (add/remove a dynamic panel) and the
 * `layoutResets`-driven in-place rebuild.
 *
 * This page CONSTRUCTS the engine; it does not accept one. An earlier cut took
 * a `ReactElement`, which meant the spec still wrote all fifteen props at
 * every one of its sixteen render sites — nine of them byte-identical every
 * time — so the arrange half never actually moved behind the page object and
 * two cases differing in one prop could only be told apart by eye-diffing two
 * fifteen-line blocks. `rtc/page-objects-own-their-component` now forbids that
 * shape. The solid twin was always built this way; this is the react half
 * catching up, not a new idea. */
export function dockviewLayoutEngineDockedPage(): DockviewLayoutEngineDockedPage {
  let doRerender: ((element: React.ReactElement) => void) | null = null;

  function engineOf(
    props: DockviewLayoutEngineDockedPageProps,
  ): React.ReactElement {
    return (
      <DockviewLayoutEngine
        tab="fx"
        registry={props.registry}
        store={props.store}
        maximized={props.maximized ?? null}
        collapsed={props.collapsed ?? []}
        closed={props.closed ?? []}
        docked={props.docked ?? []}
        instances={[]}
        layoutResets={props.layoutResets ?? 0}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onCloseInstance={noop}
      />
    );
  }

  return {
    mount(props: DockviewLayoutEngineDockedPageProps): void {
      const view = render(engineOf(props));

      doRerender = view.rerender;
    },
    rerender(props: DockviewLayoutEngineDockedPageProps): void {
      if (doRerender === null) {
        throw new Error("rerender called before mount");
      }

      doRerender(engineOf(props));
    },
    unmountAll(): void {
      cleanup();
      doRerender = null;
    },
    groupsAttr(): string | null {
      return screen.getByTestId("layout-engine").getAttribute("data-groups");
    },
    maximizedAttr(): string | null {
      return screen.getByTestId("layout-engine").getAttribute("data-maximized");
    },
    bodyVisible(testId: string): boolean {
      return screen.queryByTestId(testId) !== null;
    },
    stripMarked(panelId: string): boolean {
      return (
        screen
          .getByTestId(`dock-tab-${panelId}`)
          .getAttribute("data-dock-strip") === "true"
      );
    },
    sharesGroupInDom(panelIdA: string, panelIdB: string): boolean {
      const groupA = dockGroupOf(panelIdA);

      return groupA !== null && groupA === dockGroupOf(panelIdB);
    },
    pressDockContainer(): void {
      dockContainer().dispatchEvent(
        new Event("pointerdown", { bubbles: true }),
      );
    },
    waitFor(assertion: () => void, options?: WaitForOptions): Promise<void> {
      return waitFor(assertion, options);
    },
  };
}

/** The dockview group element `panelId`'s tab slot lives in, or null when the
 * tab is not inside one — see `sharesGroupInDom`. */
function dockGroupOf(panelId: string): Element | null {
  return screen.getByTestId(`dock-tab-${panelId}`).closest(".dv-groupview");
}

/** The element the bridge hands `createDockEngine` as its `container` — the
 * engine root's only child (see the component's render). Throws rather than
 * returning null: a missing container means the bridge stopped rendering it,
 * which must fail loudly instead of making `pressDockContainer` a no-op. */
function dockContainer(): HTMLElement {
  const container = screen.getByTestId("layout-engine").firstElementChild;

  if (!(container instanceof HTMLElement)) {
    throw new Error("the engine root has no dockview container child");
  }

  return container;
}
