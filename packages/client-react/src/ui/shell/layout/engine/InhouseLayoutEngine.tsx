import {
  type CSSProperties,
  type ReactElement,
  type PointerEvent as ReactPointerEvent,
  useRef,
} from "react";

import {
  type LayoutIntents,
  type LayoutNode,
  type LayoutState,
  PANEL_SPECS,
  type PanelId,
  type PanelSpec,
  type SplitDir,
} from "@rtc/client-core";

import type { PanelRegistry } from "./panelRegistry";

import styles from "./InhouseLayoutEngine.module.css";

/** Dumb renderer of a LayoutState. The pointer-event resize drag and the
 * strip/maximize transitions are the ONE framework-coupled spot in the app
 * (interfaces doc §5) — confined to this component behind the LayoutPort, so a
 * SolidJS swap re-implements only this file. No rxjs, no persistence, no
 * transport here; geometry is a `--split-size` custom property, state is
 * semantic data-*. */
export function InhouseLayoutEngine({
  state,
  registry,
  specs = PANEL_SPECS,
  onMaximize,
  onRestore,
  onCollapse,
  onExpand,
  onResize,
}: InhouseLayoutEngineProps): ReactElement {
  const sharedProps: SharedProps = {
    state,
    registry,
    specs,
    onMaximize,
    onRestore,
    onCollapse,
    onExpand,
    onResize,
  };

  return (
    <main
      data-testid="layout-engine"
      className={styles.engine}
      data-maximized={state.maximized ?? ""}
    >
      {renderNode(state.root, [], sharedProps)}
    </main>
  );
}

export interface InhouseLayoutEngineProps {
  state: LayoutState;
  registry: PanelRegistry;
  specs?: Readonly<Record<PanelId, PanelSpec>>;
  onMaximize: LayoutIntents["maximize"];
  onRestore: LayoutIntents["restore"];
  onCollapse: LayoutIntents["collapse"];
  onExpand: LayoutIntents["expand"];
  onResize: LayoutIntents["resize"];
}

interface SharedProps {
  state: LayoutState;
  registry: PanelRegistry;
  specs: Readonly<Record<PanelId, PanelSpec>>;
  onMaximize: LayoutIntents["maximize"];
  onRestore: LayoutIntents["restore"];
  onCollapse: LayoutIntents["collapse"];
  onExpand: LayoutIntents["expand"];
  onResize: LayoutIntents["resize"];
}

/** Named type for the split branch of LayoutNode (avoids inline object in type
 * argument position, which the no-restricted-syntax rule forbids). */
type SplitLayoutNode = {
  readonly kind: "split";
  readonly dir: SplitDir;
  readonly children: readonly LayoutNode[];
  readonly sizes: readonly number[];
  readonly fixedPx?: readonly (number | undefined)[];
};

interface SplitNodeProps extends SharedProps {
  node: SplitLayoutNode;
  path: readonly number[];
}

/** Derive a stable key for a child node that does not use the array index.
 * Panel children are keyed by their panel id; nested split children are keyed
 * by their positional path — positions in a layout tree are semantically
 * stable (the tree does not reorder nodes at runtime). */
function childKey(
  child: LayoutNode,
  path: readonly number[],
  i: number,
): string {
  if (child.kind === "panel") return child.panelId;
  return [...path, i].join(".");
}

/** A single split pane — owns the useRef for drag handles and recurses into
 * children. Extracted as a real named component so hooks live at component
 * top-level (rules-of-hooks). Panel leaves are rendered by renderPanel which
 * has no hooks. */
function SplitNode({
  node,
  path,
  state,
  registry,
  specs,
  onMaximize,
  onRestore,
  onCollapse,
  onExpand,
  onResize,
}: SplitNodeProps): ReactElement {
  const splitRef = useRef<HTMLDivElement | null>(null);
  const pathKey = path.join(".");

  function onHandlePointerDown(
    index: number,
    e: ReactPointerEvent<HTMLHRElement>,
  ): void {
    e.preventDefault();
    const handle = e.currentTarget;

    // Pointer capture is a progressive enhancement (keeps pointermove flowing to
    // the handle if the cursor leaves it mid-drag); guard it so the drag still
    // works where the API is absent (older engines, jsdom).
    if (typeof handle.setPointerCapture === "function") {
      handle.setPointerCapture(e.pointerId);
    }

    const container = splitRef.current;

    if (!container) return;

    const rect = container.getBoundingClientRect();
    const total = node.dir === "row" ? rect.width : rect.height;
    const origin = node.dir === "row" ? rect.left : rect.top;
    const a = node.sizes[index];
    const b = node.sizes[index + 1];
    const pair = a + b;

    function move(ev: PointerEvent): void {
      const pos = (node.dir === "row" ? ev.clientX : ev.clientY) - origin;
      const before = node.sizes.slice(0, index).reduce((s, v) => {
        return s + v;
      }, 0);
      let fracA = pos / total - before;
      fracA = Math.max(0.05, Math.min(pair - 0.05, fracA));
      const next = node.sizes.slice();
      next[index] = fracA;
      next[index + 1] = pair - fracA;
      onResize(path, next);
    }

    function up(ev: PointerEvent): void {
      if (typeof handle.releasePointerCapture === "function") {
        handle.releasePointerCapture(ev.pointerId);
      }

      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    }

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  // A pinned last child of a column split renders in a fixed bottom slot.
  const lastIsPinned =
    node.dir === "column" &&
    (() => {
      const last = node.children[node.children.length - 1];
      return last.kind === "panel" && specs[last.panelId]?.pinned === true;
    })();

  const sharedProps: SharedProps = {
    state,
    registry,
    specs,
    onMaximize,
    onRestore,
    onCollapse,
    onExpand,
    onResize,
  };

  return (
    <div
      ref={splitRef}
      className={styles.split}
      data-dir={node.dir}
      data-pinned-tail={lastIsPinned ? "true" : "false"}
    >
      {node.children.map((child, i) => {
        const childPinned =
          child.kind === "panel" && specs[child.panelId]?.pinned === true;
        const nextChild = node.children[i + 1];
        const nextChildPinned =
          nextChild !== undefined &&
          nextChild.kind === "panel" &&
          specs[nextChild.panelId]?.pinned === true;
        const childFixed = node.fixedPx?.[i];
        const nextFixed = node.fixedPx?.[i + 1];
        const showHandle =
          !childPinned &&
          i < node.children.length - 1 &&
          !nextChildPinned &&
          childFixed === undefined &&
          nextFixed === undefined;

        return (
          <div
            key={childKey(child, path, i)}
            className={styles.cell}
            data-pinned-cell={childPinned ? "true" : "false"}
            data-fixed-cell={childFixed !== undefined ? "true" : "false"}
            style={
              childPinned
                ? undefined
                : childFixed !== undefined
                  ? ({ "--split-fixed": `${childFixed}px` } as CSSProperties)
                  : ({
                      "--split-size": String(node.sizes[i]),
                    } as CSSProperties)
            }
          >
            {renderNode(child, [...path, i], sharedProps)}
            {showHandle ? (
              <hr
                data-testid={`handle-${pathKey}-${i}`}
                aria-orientation={
                  node.dir === "row" ? "vertical" : "horizontal"
                }
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={node.sizes[i]}
                data-orientation={
                  node.dir === "row" ? "vertical" : "horizontal"
                }
                className={styles.handle}
                tabIndex={0}
                onPointerDown={(e: ReactPointerEvent<HTMLHRElement>) => {
                  onHandlePointerDown(i, e);
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Renders a panel leaf — no hooks, plain function helper. */
function renderPanel(
  panelId: PanelId,
  {
    state,
    registry,
    specs,
    onMaximize,
    onRestore,
    onCollapse,
    onExpand,
  }: SharedProps,
): ReactElement {
  const spec = specs[panelId];
  const collapsed = state.collapsed.includes(panelId);
  const maximizedHere = state.maximized === panelId;
  const isMaximized = state.maximized !== null;
  const strip = (isMaximized && !maximizedHere) || collapsed;

  return (
    <section
      data-testid={`panel-${panelId}`}
      className={styles.panel}
      data-collapsed={collapsed ? "true" : "false"}
      data-pinned={spec?.pinned ? "true" : "false"}
      data-strip={strip ? "true" : "false"}
      data-maximized={maximizedHere ? "true" : "false"}
    >
      <header
        data-testid={`panel-${panelId}-header`}
        className={styles.panelHeader}
      >
        <span className={styles.panelTitle}>{spec?.title ?? panelId}</span>
        <div className={styles.panelControls}>
          <button
            type="button"
            data-testid={`panel-${panelId}-collapse`}
            className={styles.panelControl}
            aria-label={
              collapsed
                ? `Expand ${spec?.title ?? panelId}`
                : `Collapse ${spec?.title ?? panelId}`
            }
            onClick={() => {
              collapsed ? onExpand(panelId) : onCollapse(panelId);
            }}
          >
            {collapsed ? "▢" : "—"}
          </button>
          <button
            type="button"
            data-testid={`panel-${panelId}-maximize`}
            className={styles.panelControl}
            aria-label={
              maximizedHere
                ? `Restore ${spec?.title ?? panelId}`
                : `Maximize ${spec?.title ?? panelId}`
            }
            onClick={() => {
              maximizedHere ? onRestore() : onMaximize(panelId);
            }}
          >
            {maximizedHere ? "▣" : "▢"}
          </button>
        </div>
      </header>
      {strip ? null : (
        <div className={styles.panelBody}>{registry[panelId]?.()}</div>
      )}
    </section>
  );
}

/** Recursively renders a LayoutNode tree. Panel leaves use renderPanel (no
 * hooks); split nodes delegate to SplitNode (a real component with useRef). */
function renderNode(
  node: LayoutNode,
  path: readonly number[],
  sharedProps: SharedProps,
): ReactElement {
  if (node.kind === "panel") {
    return renderPanel(node.panelId, sharedProps);
  }

  return (
    <SplitNode
      key={path.join(".") || "root"}
      node={node}
      path={path}
      {...sharedProps}
    />
  );
}
