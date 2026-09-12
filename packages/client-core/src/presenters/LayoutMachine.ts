import { type DefaultedStateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map, scan } from "rxjs/operators";

import type { LayoutIntents, LayoutMachineOptions } from "@rtc/core-api";

import {
  dockedLeafIds,
  insertDockedLeaf,
  removeDockedLeaf,
} from "#/layout/dockColumn";
import type {
  LayoutNode,
  LayoutPort,
  LayoutState,
  PanelId,
} from "#/layout/layoutPort";

import type { Machine } from "./machine";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { LayoutIntents, LayoutMachineOptions };

type LayoutEvent =
  | { type: "maximize"; id: PanelId }
  | { type: "restore" }
  | { type: "collapse"; id: PanelId }
  | { type: "expand"; id: PanelId }
  | { type: "resize"; path: readonly number[]; sizes: readonly number[] }
  | { type: "insertPanel"; id: PanelId }
  | { type: "removePanel"; id: PanelId }
  | { type: "reset" };

type ResizePayload = { path: readonly number[]; sizes: readonly number[] };

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

/** Builds this machine's reducer, closed over `port` (for `reset`) and
 * `staticIds` — the tab's static-tree leaf-id set, derived once from
 * `port.initial.root` and threaded into every `insertDockedLeaf` call so it
 * can tell a genuine dock column apart from a real rail (see
 * `dockColumn.ts`). `removeDockedLeaf` needs no such context. */
function makeReduce(
  port: LayoutPort,
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
        };
      case "reset":
        return port.initial;
    }
  };
}

/** Neutral layout view-model. Holds the tree, applies the five intents over an
 * immutable reducer, and emits LayoutState. No DOM. Mirrors the NotionalMachine
 * intent-driven precedent: Subjects → merged events → scan → state() + a warm
 * subscription released in dispose(). */
export function createLayoutMachine(
  port: LayoutPort,
  options?: LayoutMachineOptions,
): Machine<LayoutState, LayoutIntents> {
  const staticIds = dockedLeafIds(port.initial.root, []);
  const startState = options?.seedState ?? port.initial;

  const maximize$ = new Subject<PanelId>();
  const restore$ = new Subject<void>();
  const collapse$ = new Subject<PanelId>();
  const expand$ = new Subject<PanelId>();
  const resize$ = new Subject<ResizePayload>();
  const insertPanel$ = new Subject<PanelId>();
  const removePanel$ = new Subject<PanelId>();
  const reset$ = new Subject<void>();

  const events$ = merge(
    maximize$.pipe(
      map((id): LayoutEvent => {
        return { type: "maximize", id };
      }),
    ),
    restore$.pipe(
      map((): LayoutEvent => {
        return { type: "restore" };
      }),
    ),
    collapse$.pipe(
      map((id): LayoutEvent => {
        return { type: "collapse", id };
      }),
    ),
    expand$.pipe(
      map((id): LayoutEvent => {
        return { type: "expand", id };
      }),
    ),
    resize$.pipe(
      map(({ path, sizes }): LayoutEvent => {
        return { type: "resize", path, sizes };
      }),
    ),
    insertPanel$.pipe(
      map((id): LayoutEvent => {
        return { type: "insertPanel", id };
      }),
    ),
    removePanel$.pipe(
      map((id): LayoutEvent => {
        return { type: "removePanel", id };
      }),
    ),
    reset$.pipe(
      map((): LayoutEvent => {
        return { type: "reset" };
      }),
    ),
  );

  const stream$ = events$.pipe(scan(makeReduce(port, staticIds), startState));

  const state$: DefaultedStateObservable<LayoutState> = state(
    stream$,
    startState,
  );

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      maximize: (id: PanelId) => {
        maximize$.next(id);
      },
      restore: () => {
        restore$.next();
      },
      collapse: (id: PanelId) => {
        collapse$.next(id);
      },
      expand: (id: PanelId) => {
        expand$.next(id);
      },
      resize: (path: readonly number[], sizes: readonly number[]) => {
        resize$.next({ path, sizes });
      },
      insertPanel: (panelId: PanelId) => {
        insertPanel$.next(panelId);
      },
      removePanel: (panelId: PanelId) => {
        removePanel$.next(panelId);
      },
      reset: () => {
        reset$.next();
      },
    },
    dispose: () => {
      maximize$.complete();
      restore$.complete();
      collapse$.complete();
      expand$.complete();
      resize$.complete();
      insertPanel$.complete();
      removePanel$.complete();
      reset$.complete();
      warm.unsubscribe();
    },
  };
}
