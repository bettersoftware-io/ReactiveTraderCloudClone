import { type DefaultedStateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map, scan } from "rxjs/operators";

import type {
  LayoutNode,
  LayoutPort,
  LayoutState,
  PanelId,
} from "#/layout/layoutPort";

import type { Machine } from "./machine";

export interface LayoutIntents {
  maximize(id: PanelId): void;
  restore(): void;
  collapse(id: PanelId): void;
  expand(id: PanelId): void;
  resize(path: readonly number[], sizes: readonly number[]): void;
}

type LayoutEvent =
  | { type: "maximize"; id: PanelId }
  | { type: "restore" }
  | { type: "collapse"; id: PanelId }
  | { type: "expand"; id: PanelId }
  | { type: "resize"; path: readonly number[]; sizes: readonly number[] };

type ResizePayload = { path: readonly number[]; sizes: readonly number[] };

/** Replace the `sizes` of the split node reached by walking `path` from `node`.
 * Each path index selects a split child; a non-split target or an out-of-range
 * index returns the node unchanged (defensive no-op). Pure + immutable. */
function resizeAt(
  node: LayoutNode,
  path: readonly number[],
  sizes: readonly number[],
): LayoutNode {
  if (node.kind !== "split") return node;
  if (path.length === 0) return { ...node, sizes };
  const [head, ...rest] = path;
  if (head < 0 || head >= node.children.length) return node;
  const child = node.children[head];
  const nextChild = resizeAt(child, rest, sizes);
  if (nextChild === child) return node;
  const children = node.children.map((c, i) => {
    return i === head ? nextChild : c;
  });
  return { ...node, children };
}

function reduce(layoutState: LayoutState, event: LayoutEvent): LayoutState {
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
  }
}

/** Neutral layout view-model. Holds the tree, applies the five intents over an
 * immutable reducer, and emits LayoutState. No DOM. Mirrors the NotionalMachine
 * intent-driven precedent: Subjects → merged events → scan → state() + a warm
 * subscription released in dispose(). */
export function createLayoutMachine(
  port: LayoutPort,
): Machine<LayoutState, LayoutIntents> {
  const maximize$ = new Subject<PanelId>();
  const restore$ = new Subject<void>();
  const collapse$ = new Subject<PanelId>();
  const expand$ = new Subject<PanelId>();
  const resize$ = new Subject<ResizePayload>();

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
  );

  const stream$ = events$.pipe(scan(reduce, port.initial));

  const state$: DefaultedStateObservable<LayoutState> = state(
    stream$,
    port.initial,
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
    },
    dispose: () => {
      maximize$.complete();
      restore$.complete();
      collapse$.complete();
      expand$.complete();
      resize$.complete();
      warm.unsubscribe();
    },
  };
}
