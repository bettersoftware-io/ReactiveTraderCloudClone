import {
  type CSSProperties,
  Fragment,
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

import { PanelErrorBoundary } from "./PanelErrorBoundary";
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
  headRegistry,
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
    headRegistry,
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
      {renderNode(state.root, [], sharedProps, null, null)}
    </main>
  );
}

export interface InhouseLayoutEngineProps {
  state: LayoutState;
  registry: PanelRegistry;
  specs?: Readonly<Record<PanelId, PanelSpec>>;
  /** Per-panel head-slot override: when set for a panel id, its element renders
   * in place of the default title span (the collapse/maximize controls stay).
   * Used for the FX Live Rates head tabs + CHARTS chip (Task 11). */
  headRegistry?: Partial<Record<PanelId, () => ReactElement>>;
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
  headRegistry?: Partial<Record<PanelId, () => ReactElement>>;
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
  readonly initialPx?: readonly (number | undefined)[];
};

interface SplitNodeProps extends SharedProps {
  node: SplitLayoutNode;
  path: readonly number[];
  /** Non-null when THIS split's entire subtree is stripped: the dir of the
   * nearest ancestor split that is not itself fully stripped — the split
   * along whose axis the collapsed space actually reclaims. Propagated to
   * every descendant so their strips orient against that axis rather than
   * their immediate parent's (see renderPanel). */
  stripDir: SplitDir | null;
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

/** Effective per-child fractions of a split, measured from its cells' current
 * css px along the split axis — the drag baseline for a split whose rendered
 * geometry is px-driven (initialPx) rather than sizes-driven. Returns null
 * when the measurement is unusable (zero total, e.g. jsdom, or a cell-count
 * mismatch with sizes). Handles are excluded: only `.cell` children count. */
function measuredFractions(
  container: HTMLDivElement,
  node: SplitLayoutNode,
): readonly number[] | null {
  const cellsPx = Array.from(container.children)
    .filter((el): el is HTMLElement => {
      return el instanceof HTMLElement && el.classList.contains(styles.cell);
    })
    .map((cell) => {
      const r = cell.getBoundingClientRect();
      return node.dir === "row" ? r.width : r.height;
    });
  const cellsTotal = cellsPx.reduce((s, v) => {
    return s + v;
  }, 0);
  if (cellsPx.length !== node.sizes.length || cellsTotal <= 0) return null;
  return cellsPx.map((px) => {
    return px / cellsTotal;
  });
}

/** True when every panel leaf in `node`'s subtree is currently a strip
 * (collapsed itself, or stripped as a sibling of the maximized panel further
 * up the tree) — a split node counts as an all-strip subtree only when every
 * one of its own children does too. Drives `.cell[data-strip-cell="true"]`,
 * which releases the CELL's ratio-derived flex-grow so growing siblings
 * reclaim the freed space. Without this, only the innermost
 * `.panel[data-strip="true"]` shrank to its 32px strip while the `.cell`
 * wrapping it kept its full ratio-derived size, leaving a dead background
 * gap and starving growing siblings of the space the strip gave up (the
 * maximize/collapse regression this function fixes). */
function isStripSubtree(node: LayoutNode, state: LayoutState): boolean {
  if (node.kind === "panel") {
    const maximizedHere = state.maximized === node.panelId;
    const isMaximized = state.maximized !== null;
    const collapsed = state.collapsed.includes(node.panelId);
    return (isMaximized && !maximizedHere) || collapsed;
  }

  return node.children.every((child) => {
    return isStripSubtree(child, state);
  });
}

/** A single split pane — owns the useRef for drag handles and recurses into
 * children. Extracted as a real named component so hooks live at component
 * top-level (rules-of-hooks). Panel leaves are rendered by renderPanel which
 * has no hooks. */
function SplitNode({
  node,
  path,
  stripDir,
  state,
  registry,
  specs,
  headRegistry,
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

    const containerOrNull = splitRef.current;

    if (!containerOrNull) return;

    // A stable non-null binding: `container` (unlike `containerOrNull`) keeps
    // its narrowed type inside the `up` closure below, which TS cannot verify
    // stays non-null through a nested function declaration.
    const container: HTMLDivElement = containerOrNull;

    // Suppresses the strip/maximize glide transition on this split's cells
    // for the drag's duration (see .split[data-dragging="true"] .cell in the
    // module CSS): flex-grow is the SAME property a strip toggle animates and
    // a resize drag continuously retargets via --split-size, so an
    // unconditional transition on .cell would make the split visibly lag
    // behind the pointer. Set imperatively (not via JSX/React state) so a
    // mid-drag re-render (onResize triggers one on every pointermove) can't
    // clobber it back to the non-dragging value.
    container.dataset.dragging = "true";

    const rect = container.getBoundingClientRect();
    const total = node.dir === "row" ? rect.width : rect.height;
    const origin = node.dir === "row" ? rect.left : rect.top;
    // Baseline fractions for the drag. A split with a design-value initialPx
    // child renders px-fixed geometry that no longer matches node.sizes, so
    // the first drag derives effective fractions from the cells' measured px
    // instead and dispatches those through the normal onResize — the machine
    // clears initialPx, and the split is a plain ratio split thereafter.
    // Falls back to node.sizes when there is nothing to measure (jsdom's
    // zero-size rects, or a cell-count mismatch).
    const baseSizes = node.initialPx?.some((px) => {
      return px !== undefined;
    })
      ? (measuredFractions(container, node) ?? node.sizes)
      : node.sizes;
    const a = baseSizes[index];
    const b = baseSizes[index + 1];
    const pair = a + b;

    function move(ev: PointerEvent): void {
      const pos = (node.dir === "row" ? ev.clientX : ev.clientY) - origin;
      const before = baseSizes.slice(0, index).reduce((s, v) => {
        return s + v;
      }, 0);
      let fracA = pos / total - before;
      fracA = Math.max(0.05, Math.min(pair - 0.05, fracA));
      const next = baseSizes.slice();
      next[index] = fracA;
      next[index + 1] = pair - fracA;
      onResize(path, next);
    }

    function up(ev: PointerEvent): void {
      if (typeof handle.releasePointerCapture === "function") {
        handle.releasePointerCapture(ev.pointerId);
      }

      container.dataset.dragging = "false";
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
    headRegistry,
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
        const childIsStripCell = isStripSubtree(child, state);
        // Design-value default width (initialPx): renders px-fixed like
        // fixedPx but KEEPS the resize handles — the first drag converts the
        // split to plain fractions. fixedPx wins when both are set. Dropped
        // whenever a panel is maximized (the freed geometry must flow to the
        // maximized panel's cell chain — ratio flex-grow beside hugging strip
        // cells — which a px-fixed rail would pin shut) and while the child's
        // own subtree is stripped (the strip hugs its 32/38px bar, restoring
        // the design width when it expands again).
        const childInitial =
          childFixed === undefined &&
          state.maximized === null &&
          !childIsStripCell
            ? node.initialPx?.[i]
            : undefined;
        const nextIsStripCell =
          nextChild !== undefined && isStripSubtree(nextChild, state);
        // The strip orientation a stripped child's subtree inherits: when
        // THIS split is already inside a fully-stripped subtree, keep
        // propagating the ancestor dir it received; otherwise this split is
        // where the collapsed space reclaims, so a fully-stripped child
        // orients against THIS split's dir. Null for children that render
        // normally.
        const childStripDir = stripDir ?? (childIsStripCell ? node.dir : null);
        // A strip cell whose strips run perpendicular to this split's own
        // axis (an inherited orientation — e.g. vertical strips stacked
        // inside a column split whose whole rail collapsed sideways) shares
        // the split's main-axis space instead of hugging, so the strips
        // stack down the full-height rail (`.cell[data-strip-fill]`).
        const stripFill = childStripDir !== null && childStripDir !== node.dir;
        const showHandle =
          !childPinned &&
          i < node.children.length - 1 &&
          !nextChildPinned &&
          childFixed === undefined &&
          nextFixed === undefined &&
          !childIsStripCell &&
          !nextIsStripCell;

        return (
          <Fragment key={childKey(child, path, i)}>
            <div
              className={styles.cell}
              data-testid={`cell-${pathKey}-${i}`}
              data-dir={node.dir}
              data-pinned-cell={childPinned ? "true" : "false"}
              data-fixed-cell={childFixed !== undefined ? "true" : "false"}
              data-initial-cell={childInitial !== undefined ? "true" : "false"}
              data-strip-cell={childIsStripCell ? "true" : "false"}
              data-strip-fill={stripFill ? "true" : "false"}
              style={
                childPinned
                  ? undefined
                  : childFixed !== undefined
                    ? ({ "--split-fixed": `${childFixed}px` } as CSSProperties)
                    : childInitial !== undefined
                      ? ({
                          "--split-fixed": `${childInitial}px`,
                        } as CSSProperties)
                      : ({
                          "--split-size": String(node.sizes[i]),
                        } as CSSProperties)
              }
            >
              {renderNode(
                child,
                [...path, i],
                sharedProps,
                node.dir,
                childStripDir,
              )}
            </div>
            {showHandle ? (
              // Sibling of the cell (not nested inside it): `.cell` is a flex
              // row, so a handle rendered inside it would always paint along
              // that row's cross axis regardless of the split's own
              // direction. As a sibling under `.split`, the handle inherits
              // the split's own flex-direction and paints along the correct
              // axis with the matching resize cursor.
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
          </Fragment>
        );
      })}
    </div>
  );
}

/** Renders a panel leaf — no hooks, plain function helper. `parentDir` is the
 * `dir` of the split whose cell holds this panel (null at the tree root, for
 * a single-panel tab like Admin); `stripDir`, when non-null, is the dir of
 * the nearest ancestor split that is NOT itself fully stripped — the axis
 * along which this panel's collapsed space actually reclaims. Together they
 * decide the strip's restore-bar orientation below. */
function renderPanel(
  panelId: PanelId,
  {
    state,
    registry,
    specs,
    headRegistry,
    onMaximize,
    onRestore,
    onCollapse,
    onExpand,
  }: SharedProps,
  parentDir: SplitDir | null,
  stripDir: SplitDir | null,
): ReactElement {
  const spec = specs[panelId];
  const title = spec?.title ?? panelId;
  const collapsed = state.collapsed.includes(panelId);
  const maximizedHere = state.maximized === panelId;
  const isMaximized = state.maximized !== null;
  const strip = (isMaximized && !maximizedHere) || collapsed;
  const headContent = headRegistry?.[panelId];
  // A strip whose space reclaims along a row axis shrinks to a narrow,
  // full-height column (PROTO stripBar/collapsedStrip) — restoring it reads
  // top-to-bottom. One reclaiming along a column axis shrinks to a short,
  // full-width bar, which reads left-to-right like the normal header. The
  // reclaim axis is the inherited stripDir when this panel sits inside a
  // fully-stripped subtree (its own parent split collapsed with it, so THAT
  // dir is irrelevant), else the immediate parent split's dir.
  const stripOrientation =
    (stripDir ?? parentDir) === "row" ? "vertical" : "horizontal";

  return (
    <section
      data-testid={`panel-${panelId}`}
      className={styles.panel}
      data-collapsed={collapsed ? "true" : "false"}
      data-pinned={spec?.pinned ? "true" : "false"}
      data-strip={strip ? "true" : "false"}
      data-strip-orientation={stripOrientation}
      data-maximized={maximizedHere ? "true" : "false"}
    >
      {strip ? (
        <button
          type="button"
          data-testid={`panel-${panelId}-collapse`}
          className={styles.stripBar}
          data-orientation={stripOrientation}
          aria-label={`Restore ${title}`}
          onClick={() => {
            collapsed ? onExpand(panelId) : onRestore();
          }}
        >
          <span aria-hidden="true" className={styles.stripGlyph}>
            ⛶
          </span>
          <span className={styles.stripLabel}>{title}</span>
        </button>
      ) : (
        <>
          <header
            data-testid={`panel-${panelId}-header`}
            className={styles.panelHeader}
          >
            {headContent ? (
              <div className={styles.panelHeadContent}>{headContent()}</div>
            ) : (
              <span
                data-testid={`panel-${panelId}-title`}
                className={styles.panelTitle}
              >
                {title}
              </span>
            )}
            <div className={styles.panelControls}>
              <button
                type="button"
                data-testid={`panel-${panelId}-collapse`}
                className={styles.panelControl}
                aria-label={`Collapse ${title}`}
                title={`Collapse ${title}`}
                onClick={() => {
                  onCollapse(panelId);
                }}
              >
                —
              </button>
              <button
                type="button"
                data-testid={`panel-${panelId}-maximize`}
                className={styles.panelControl}
                aria-label={
                  maximizedHere ? `Restore ${title}` : `Maximize ${title}`
                }
                title={maximizedHere ? `Restore ${title}` : `Maximize ${title}`}
                onClick={() => {
                  maximizedHere ? onRestore() : onMaximize(panelId);
                }}
              >
                {maximizedHere ? "⧉" : "⛶"}
              </button>
            </div>
          </header>
          <div className={styles.panelBody}>
            <PanelErrorBoundary title={title}>
              {registry[panelId]?.()}
            </PanelErrorBoundary>
          </div>
        </>
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
  parentDir: SplitDir | null,
  stripDir: SplitDir | null,
): ReactElement {
  if (node.kind === "panel") {
    return renderPanel(node.panelId, sharedProps, parentDir, stripDir);
  }

  return (
    <SplitNode
      key={path.join(".") || "root"}
      node={node}
      path={path}
      stripDir={stripDir}
      {...sharedProps}
    />
  );
}
