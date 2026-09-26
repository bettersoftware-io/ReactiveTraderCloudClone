import {
  dockedLeafIds,
  insertDockedLeaf,
  removeDockedLeaf,
} from "#/layout/dockColumn";
import type {
  LayoutNode,
  LayoutPanelInstance,
  LayoutState,
  PanelId,
} from "#/layout/layoutPort";
import { instanceIdFor, MAX_PANEL_INSTANCES } from "#/layout/panelInstances";

/** The layout machine's pure half (pluggable-core slice 7): its event
 * vocabulary and reducer, shared by every application core — the RxJS
 * `createLayoutMachine` and the two sibling cores' native machines fold the
 * very same function. rxjs-free by rule: the siblings import it. */
export type LayoutEvent =
  | { type: "maximize"; id: PanelId }
  | { type: "restore" }
  | { type: "collapse"; id: PanelId }
  | { type: "expand"; id: PanelId }
  | { type: "resize"; path: readonly number[]; sizes: readonly number[] }
  | { type: "insertPanel"; id: PanelId }
  | { type: "removePanel"; id: PanelId }
  | { type: "close"; id: PanelId }
  | { type: "reopen"; id: PanelId }
  | { type: "openInstance"; kind: "eq-chart"; symbol: string }
  | { type: "closeInstance"; id: PanelId }
  | { type: "reset" }
  | { type: "replaceLayout"; state: LayoutState };

/** The ids of every STATIC leaf in `initial`'s tree — what the reducer's
 * `close` guard and docked-leaf insertion treat as the workspace's own
 * panels (anything else in the tree is a docked Jarvis leaf). */
export function layoutStaticIds(initial: LayoutState): readonly PanelId[] {
  return dockedLeafIds(initial.root, []);
}

/** Replace the `sizes` of the split node reached by walking `path` from `node`.
 * Each path index selects a split child; a non-split target or an out-of-range
 * index returns the node unchanged (defensive no-op). Pure + immutable. A
 * resize also clears the target's `initialPx` (the design-value default rail
 * width): the engine dispatches effective fractions computed from the current
 * px on the first drag, and the split is a plain ratio split forever after. */
function resizeAt(
  node: LayoutNode,
  path: readonly number[],
  sizes: readonly number[],
): LayoutNode {
  if (node.kind !== "split") {
    return node;
  }

  if (path.length === 0) {
    return { ...node, sizes, initialPx: undefined };
  }

  const [head, ...rest] = path;

  if (head < 0 || head >= node.children.length) {
    return node;
  }

  const child = node.children[head];
  const nextChild = resizeAt(child, rest, sizes);

  if (nextChild === child) {
    return node;
  }

  const children = node.children.map((c, i) => {
    return i === head ? nextChild : c;
  });
  return { ...node, children };
}

/** Builds the layout reducer, closed over `initial` (for `reset`) and
 * `staticIds` — the tab's static-tree leaf-id set, derived once from
 * `initial.root` and threaded into every `insertDockedLeaf` call so it
 * can tell a genuine dock column apart from a real rail (see
 * `dockColumn.ts`). `removeDockedLeaf` needs no such context. */
export function createLayoutReducer(
  initial: LayoutState,
  staticIds: readonly PanelId[],
): (layoutState: LayoutState, event: LayoutEvent) => LayoutState {
  return (layoutState: LayoutState, event: LayoutEvent): LayoutState => {
    switch (event.type) {
      case "maximize":
        return { ...layoutState, maximized: event.id };
      case "restore":
        return { ...layoutState, maximized: null };
      case "collapse":
        return layoutState.collapsed.includes(event.id)
          ? layoutState
          : { ...layoutState, collapsed: [...layoutState.collapsed, event.id] };
      case "expand":
        return {
          ...layoutState,
          collapsed: layoutState.collapsed.filter((id) => {
            return id !== event.id;
          }),
        };
      case "resize":
        return {
          ...layoutState,
          root: resizeAt(layoutState.root, event.path, event.sizes),
        };
      case "insertPanel":
        return {
          ...layoutState,
          root: insertDockedLeaf(layoutState.root, event.id, staticIds),
        };
      case "removePanel":
        return {
          ...layoutState,
          root: removeDockedLeaf(layoutState.root, event.id),
          maximized:
            layoutState.maximized === event.id ? null : layoutState.maximized,
          collapsed: layoutState.collapsed.filter((id) => {
            return id !== event.id;
          }),
          // An undocked Jarvis id must never linger in `closed` either.
          closed: layoutState.closed.filter((id) => {
            return id !== event.id;
          }),
        };

      case "close": {
        if (
          !staticIds.includes(event.id) ||
          layoutState.closed.includes(event.id)
        ) {
          return layoutState;
        }

        // The visibility floor: never hide the tab's last visible static
        // leaf — a workspace with zero panels has no affordance to recover.
        const visibleAfter = staticIds.filter((id) => {
          return id !== event.id && !layoutState.closed.includes(id);
        });

        if (visibleAfter.length === 0) {
          return layoutState;
        }

        return {
          ...layoutState,
          closed: [...layoutState.closed, event.id],
          collapsed: layoutState.collapsed.filter((id) => {
            return id !== event.id;
          }),
          maximized:
            layoutState.maximized === event.id ? null : layoutState.maximized,
        };
      }

      case "reopen":
        return {
          ...layoutState,
          closed: layoutState.closed.filter((id) => {
            return id !== event.id;
          }),
        };

      case "openInstance": {
        const id = instanceIdFor(event.kind, event.symbol);

        if (
          layoutState.instances.some((instance) => {
            return instance.id === id;
          }) ||
          layoutState.instances.length >= MAX_PANEL_INSTANCES
        ) {
          return layoutState;
        }

        const instance: LayoutPanelInstance = {
          id,
          kind: event.kind,
          symbol: event.symbol,
        };
        return {
          ...layoutState,
          instances: [...layoutState.instances, instance],
        };
      }

      case "closeInstance":
        if (
          !layoutState.instances.some((instance) => {
            return instance.id === event.id;
          })
        ) {
          return layoutState;
        }

        return {
          ...layoutState,
          instances: layoutState.instances.filter((instance) => {
            return instance.id !== event.id;
          }),
          collapsed: layoutState.collapsed.filter((id) => {
            return id !== event.id;
          }),
          maximized:
            layoutState.maximized === event.id ? null : layoutState.maximized,
        };

      case "reset":
        return initial;
      case "replaceLayout":
        return event.state;
    }
  };
}
