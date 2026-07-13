import { type Accessor, Index, type JSX, Show } from "solid-js";

import {
  type LayoutIntents,
  type LayoutNode,
  type LayoutState,
  maximizeBoundaryPath,
  nodeAtPath,
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
 * (interfaces doc §5) — confined to this component behind the LayoutPort.
 * No rxjs, no persistence, no transport here; geometry is a `--split-size`
 * custom property, state is semantic data-*.
 *
 * SOLID PORT NOTE (read before touching this file): `state` is a fresh
 * `LayoutState` object every tick (maximize/collapse/expand/resize all go
 * through the machine's immutable reducer — see LayoutMachine.ts), but that
 * reducer STRUCTURALLY SHARES subtrees it doesn't touch (a resize at path
 * `[1,0]` rebuilds only the objects from the root down to that node; sibling
 * subtrees keep their exact object reference; maximize/collapse/expand never
 * touch `root` at all). That's the reason every derived value here is a
 * FUNCTION CALLED at its JSX use site (`boundaryPath()`, `childPinned()`, …)
 * rather than a top-level `const` computed once: Solid component bodies run
 * ONCE (unlike React, which re-runs the whole function every render), so a
 * value read into a plain `const` freezes at mount and never updates when a
 * later tick changes `props.state` — exactly the trap the recipe amendment
 * warns about, generalized from ViewModel reads to every reactive prop read
 * in this file. Every JSX attribute/child expression that CALLS one of these
 * functions is compiled into its own small reactive binding by Solid, so it
 * re-evaluates independently whenever the state it transitively reads
 * changes — cheap here (a handful of panels), so no memoization is needed
 * for correctness OR performance.
 *
 * Children of a split are rendered with `<Index>`, not the recipe's default
 * `<For>`: `<For>` keys by ITEM REFERENCE, which would tear down and rebuild
 * an untouched child's whole subtree (losing `splitRef`, the drag's DOM
 * listeners, and any in-flight CSS transition) the instant an ANCESTOR
 * resize rebuilds the children array wrapper (`node.children.map(...)`
 * always returns a new array, even when only one element inside actually
 * changed). `<Index>` keys by POSITION instead — the exact match for React's
 * own `key={childKey(...)}`, which keys a split child by its path and a
 * panel child by its stable panelId, i.e. by POSITION, never by object
 * identity. Panel/split shape at a given position never changes at runtime
 * (docks don't add/remove/reorder panels), so position-keying is safe and
 * is what makes the drag's own DOM node (and the `splitRef` it lives on)
 * survive every tick, including every `pointermove` of the very drag that's
 * retargeting it.
 */
export function InhouseLayoutEngine(
  props: InhouseLayoutEngineProps,
): JSX.Element {
  function specs(): Readonly<Record<PanelId, PanelSpec>> {
    return props.specs ?? PANEL_SPECS;
  }

  // Render-time maximize policy: the boundary is the split the maximize
  // reaches (the whole dock for the default "root" scope; the nearest
  // ancestor column split for a "nearest-column" panel — the standalone's
  // rail semantics), and strippedByMaximize is the set of panels it forces to
  // strip bars: every leaf under the boundary except the maximized panel
  // itself. Panels OUTSIDE the boundary render normally. Null/empty when
  // nothing is maximized.
  function boundaryPath(): readonly number[] | null {
    const state = props.state;
    return state.maximized === null
      ? null
      : maximizeBoundaryPath(state.root, state.maximized, specs());
  }

  function strippedByMaximize(): ReadonlySet<PanelId> {
    return strippedPanelIds(props.state, boundaryPath());
  }

  return (
    <main
      data-testid="layout-engine"
      class={styles.engine}
      data-maximized={props.state.maximized ?? ""}
    >
      <Show
        when={props.state.root.kind === "panel"}
        fallback={
          <SplitNode
            node={props.state.root as SplitLayoutNode}
            path={[]}
            stripDir={null}
            state={props.state}
            registry={props.registry}
            specs={specs()}
            headRegistry={props.headRegistry}
            boundaryPath={boundaryPath()}
            strippedByMaximize={strippedByMaximize()}
            onMaximize={props.onMaximize}
            onRestore={props.onRestore}
            onCollapse={props.onCollapse}
            onExpand={props.onExpand}
            onResize={props.onResize}
          />
        }
      >
        <PanelLeaf
          panelId={(props.state.root as PanelLayoutNode).panelId}
          parentDir={null}
          stripDir={null}
          state={props.state}
          registry={props.registry}
          specs={specs()}
          headRegistry={props.headRegistry}
          strippedByMaximize={strippedByMaximize()}
          onMaximize={props.onMaximize}
          onRestore={props.onRestore}
          onCollapse={props.onCollapse}
          onExpand={props.onExpand}
        />
      </Show>
    </main>
  );
}

export interface InhouseLayoutEngineProps {
  state: LayoutState;
  registry: PanelRegistry;
  specs?: Readonly<Record<PanelId, PanelSpec>>;
  /** Per-panel head-slot override: when set for a panel id, its element renders
   * in place of the default title span (the collapse/maximize controls stay).
   * Used for the FX Live Rates head tabs + CHARTS chip (Task 13). */
  headRegistry?: Partial<Record<PanelId, () => JSX.Element>>;
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
  headRegistry?: Partial<Record<PanelId, () => JSX.Element>>;
  /** Path of the split the current maximize is bounded by (see
   * maximizeBoundaryPath in @rtc/client-core), or null when nothing is
   * maximized. Cells outside the boundary subtree keep their geometry —
   * including a scoped rail's initialPx design width. */
  boundaryPath: readonly number[] | null;
  /** Leaves under the boundary minus the maximized panel: exactly the panels
   * the current maximize forces to strips. Empty when nothing is maximized. */
  strippedByMaximize: ReadonlySet<PanelId>;
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

/** Named type for the panel branch of LayoutNode. */
type PanelLayoutNode = {
  readonly kind: "panel";
  readonly panelId: PanelId;
};

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

  if (cellsPx.length !== node.sizes.length || cellsTotal <= 0) {
    return null;
  }

  return cellsPx.map((px) => {
    return px / cellsTotal;
  });
}

/** True when every panel leaf in `node`'s subtree is currently a strip
 * (collapsed itself, or forced to a strip by the current maximize — a member
 * of strippedByMaximize) — a split node counts as an all-strip subtree only
 * when every one of its own children does too. Drives
 * `.cell[data-strip-cell="true"]`, which releases the CELL's ratio-derived
 * flex-grow so growing siblings reclaim the freed space. */
function isStripSubtree(
  node: LayoutNode,
  state: LayoutState,
  strippedByMaximize: ReadonlySet<PanelId>,
): boolean {
  if (node.kind === "panel") {
    return (
      strippedByMaximize.has(node.panelId) ||
      state.collapsed.includes(node.panelId)
    );
  }

  return node.children.every((child) => {
    return isStripSubtree(child, state, strippedByMaximize);
  });
}

/** The panels the current maximize forces to strips: every leaf under the
 * maximize boundary except the maximized panel itself. Empty when nothing is
 * maximized. */
function strippedPanelIds(
  state: LayoutState,
  boundaryPath: readonly number[] | null,
): ReadonlySet<PanelId> {
  if (state.maximized === null || boundaryPath === null) {
    return new Set();
  }

  const boundary = nodeAtPath(state.root, boundaryPath) ?? state.root;
  const ids = new Set(collectPanelIds(boundary));
  ids.delete(state.maximized);
  return ids;
}

/** Every panel id in `node`'s subtree, in tree order. */
function collectPanelIds(node: LayoutNode): PanelId[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectPanelIds);
}

/** True when `prefix` is a STRICT prefix of `path` — the node at `path` sits
 * strictly inside the subtree rooted at `prefix` (equal paths do not count:
 * the boundary cell itself is not inside its own subtree). */
function isStrictPathPrefix(
  prefix: readonly number[],
  path: readonly number[],
): boolean {
  return (
    prefix.length < path.length &&
    prefix.every((index, i) => {
      return path[i] === index;
    })
  );
}

interface SplitNodeProps extends SharedProps {
  node: SplitLayoutNode;
  path: readonly number[];
  /** Non-null when THIS split's entire subtree is stripped: the dir of the
   * nearest ancestor split that is not itself fully stripped — the split
   * along whose axis the collapsed space actually reclaims. Propagated to
   * every descendant so their strips orient against that axis rather than
   * their immediate parent's (see PanelLeaf). */
  stripDir: SplitDir | null;
}

/** A single split pane — owns the drag-handle ref and recurses into children
 * (nested splits render a nested SplitNode; panel leaves render a PanelLeaf).
 * This component's own body runs exactly ONCE for a given position in the
 * tree (see the file-level SOLID PORT NOTE) — `splitRef` and the pointer
 * handlers below are set up once and persist across every resize/collapse/
 * maximize tick. */
function SplitNode(props: SplitNodeProps): JSX.Element {
  let splitRef!: HTMLDivElement;

  // `props.path` never changes across this SplitNode's lifetime (a split's
  // position in the tree is fixed at creation — see the file-level SOLID
  // PORT NOTE on `<Index>` position-keying), but this stays a function for
  // the same reactivity-check consistency reason as `lastIsPinned` below.
  function pathKey(): string {
    return props.path.join(".");
  }

  function onHandlePointerDown(index: number, e: PointerEvent): void {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;

    // Pointer capture is a progressive enhancement (keeps pointermove flowing
    // to the handle if the cursor leaves it mid-drag); guard it so the drag
    // still works where the API is absent (older engines, jsdom).
    if (typeof handle.setPointerCapture === "function") {
      handle.setPointerCapture(e.pointerId);
    }

    const node = props.node;

    // Suppresses the strip/maximize glide transition on this split's cells
    // for the drag's duration (see .split[data-dragging="true"] .cell in the
    // module CSS): flex-grow is the SAME property a strip toggle animates and
    // a resize drag continuously retargets via --split-size, so an
    // unconditional transition on .cell would make the split visibly lag
    // behind the pointer. Set imperatively (not via reactive state) so a
    // mid-drag state emission (onResize triggers one on every pointermove)
    // can't clobber it back to the non-dragging value.
    splitRef.dataset.dragging = "true";

    const rect = splitRef.getBoundingClientRect();
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
      ? (measuredFractions(splitRef, node) ?? node.sizes)
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
      props.onResize(props.path, next);
    }

    function up(ev: PointerEvent): void {
      if (typeof handle.releasePointerCapture === "function") {
        handle.releasePointerCapture(ev.pointerId);
      }

      splitRef.dataset.dragging = "false";
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    }

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  // A pinned last child of a column split renders in a fixed bottom slot.
  // A function (not a top-level const) purely for consistency with every
  // other derived value in this file, even though its inputs — a split's
  // `dir` and its children's kind/pinned-ness — never change post-mount
  // (only sizes, collapsed, and maximized do; see the file-level SOLID PORT
  // NOTE) — this keeps `eslint-plugin-solid`'s reactivity check honest
  // without a special-cased exception.
  function lastIsPinned(): boolean {
    return (
      props.node.dir === "column" &&
      (() => {
        const last = props.node.children[props.node.children.length - 1];
        return (
          last.kind === "panel" && props.specs[last.panelId]?.pinned === true
        );
      })()
    );
  }

  return (
    <div
      ref={splitRef}
      class={styles.split}
      data-dir={props.node.dir}
      data-pinned-tail={lastIsPinned() ? "true" : "false"}
    >
      <Index each={props.node.children}>
        {(child: Accessor<LayoutNode>, i: number) => {
          function childPinned(): boolean {
            const c = child();
            return (
              c.kind === "panel" && props.specs[c.panelId]?.pinned === true
            );
          }

          function nextChild(): LayoutNode | undefined {
            return props.node.children[i + 1];
          }

          function nextChildPinned(): boolean {
            const n = nextChild();
            return (
              n !== undefined &&
              n.kind === "panel" &&
              props.specs[n.panelId]?.pinned === true
            );
          }

          function childFixed(): number | undefined {
            return props.node.fixedPx?.[i];
          }

          function nextFixed(): number | undefined {
            return props.node.fixedPx?.[i + 1];
          }

          function childIsStripCell(): boolean {
            return isStripSubtree(
              child(),
              props.state,
              props.strippedByMaximize,
            );
          }

          // Design-value default width (initialPx): renders px-fixed like
          // fixedPx but KEEPS the resize handles — the first drag converts
          // the split to plain fractions. fixedPx wins when both are set.
          // Dropped while this cell sits INSIDE the maximize boundary
          // subtree (the freed geometry must flow to the maximized panel's
          // cell chain) and while the child's own subtree is stripped (the
          // strip hugs its bar, restoring the design width when it
          // expands again). A cell AT or ABOVE the boundary keeps its
          // design width.
          function insideBoundary(): boolean {
            return (
              props.boundaryPath !== null &&
              isStrictPathPrefix(props.boundaryPath, [...props.path, i])
            );
          }

          function childInitial(): number | undefined {
            return childFixed() === undefined &&
              !insideBoundary() &&
              !childIsStripCell()
              ? props.node.initialPx?.[i]
              : undefined;
          }

          function nextIsStripCell(): boolean {
            const n = nextChild();
            return (
              n !== undefined &&
              isStripSubtree(n, props.state, props.strippedByMaximize)
            );
          }

          // The strip orientation a stripped child's subtree inherits: when
          // THIS split is already inside a fully-stripped subtree, keep
          // propagating the ancestor dir it received; otherwise this split
          // is where the collapsed space reclaims, so a fully-stripped
          // child orients against THIS split's dir. Null for children that
          // render normally.
          function childStripDir(): SplitDir | null {
            return (
              props.stripDir ?? (childIsStripCell() ? props.node.dir : null)
            );
          }

          // A strip cell whose strips run perpendicular to this split's own
          // axis (an inherited orientation) shares the split's main-axis
          // space instead of hugging, so the strips stack down the
          // full-height rail (`.cell[data-strip-fill]`).
          function stripFill(): boolean {
            const dir = childStripDir();
            return dir !== null && dir !== props.node.dir;
          }

          function showHandle(): boolean {
            return (
              !childPinned() &&
              i < props.node.children.length - 1 &&
              !nextChildPinned() &&
              childFixed() === undefined &&
              nextFixed() === undefined &&
              !childIsStripCell() &&
              !nextIsStripCell()
            );
          }

          // A plain function (not an inline object literal) so the JSX
          // `style` attribute reads `style={cellStyle()}` — a call
          // expression, not an ObjectExpression directly inside the
          // attribute — which is outside the inline-style ESLint rule's
          // reach by construction (see AmbientBackground.tsx's `style={vars}`
          // precedent), with no eslint-disable comment needed.
          function cellStyle(): JSX.CSSProperties | undefined {
            if (childPinned()) {
              return undefined;
            }

            const fixed = childFixed();

            if (fixed !== undefined) {
              return { "--split-fixed": `${fixed}px` };
            }

            const initial = childInitial();

            if (initial !== undefined) {
              return { "--split-fixed": `${initial}px` };
            }

            return { "--split-size": String(props.node.sizes[i]) };
          }

          return (
            <>
              <div
                class={styles.cell}
                data-testid={`cell-${pathKey()}-${i}`}
                data-dir={props.node.dir}
                data-pinned-cell={childPinned() ? "true" : "false"}
                data-fixed-cell={childFixed() !== undefined ? "true" : "false"}
                data-initial-cell={
                  childInitial() !== undefined ? "true" : "false"
                }
                data-strip-cell={childIsStripCell() ? "true" : "false"}
                data-strip-fill={stripFill() ? "true" : "false"}
                style={cellStyle()}
              >
                <Show
                  when={child().kind === "panel"}
                  fallback={
                    <SplitNode
                      node={child() as SplitLayoutNode}
                      path={[...props.path, i]}
                      stripDir={childStripDir()}
                      state={props.state}
                      registry={props.registry}
                      specs={props.specs}
                      headRegistry={props.headRegistry}
                      boundaryPath={props.boundaryPath}
                      strippedByMaximize={props.strippedByMaximize}
                      onMaximize={props.onMaximize}
                      onRestore={props.onRestore}
                      onCollapse={props.onCollapse}
                      onExpand={props.onExpand}
                      onResize={props.onResize}
                    />
                  }
                >
                  <PanelLeaf
                    panelId={(child() as PanelLayoutNode).panelId}
                    parentDir={props.node.dir}
                    stripDir={childStripDir()}
                    state={props.state}
                    registry={props.registry}
                    specs={props.specs}
                    headRegistry={props.headRegistry}
                    strippedByMaximize={props.strippedByMaximize}
                    onMaximize={props.onMaximize}
                    onRestore={props.onRestore}
                    onCollapse={props.onCollapse}
                    onExpand={props.onExpand}
                  />
                </Show>
              </div>
              {/* Sibling of the cell (not nested inside it): `.cell` is a flex
                  row, so a handle rendered inside it would always paint along
                  that row's cross axis regardless of the split's own
                  direction. As a sibling under `.split`, the handle inherits
                  the split's own flex-direction and paints along the correct
                  axis with the matching resize cursor. */}
              <Show when={showHandle()}>
                <hr
                  data-testid={`handle-${pathKey()}-${i}`}
                  aria-orientation={
                    props.node.dir === "row" ? "vertical" : "horizontal"
                  }
                  aria-valuemin={0}
                  aria-valuemax={1}
                  aria-valuenow={props.node.sizes[i]}
                  data-orientation={
                    props.node.dir === "row" ? "vertical" : "horizontal"
                  }
                  class={styles.handle}
                  tabIndex={0}
                  onPointerDown={(e: PointerEvent) => {
                    onHandlePointerDown(i, e);
                  }}
                />
              </Show>
            </>
          );
        }}
      </Index>
    </div>
  );
}

/** PanelLeaf's own prop shape — deliberately NOT `extends SharedProps`
 * (unlike the React original, which spreads the full `sharedProps` object
 * including fields PanelLeaf never reads): the Solid port passes every prop
 * explicitly at each call site (no object-spread — see the file-level SOLID
 * PORT NOTE), so PanelLeaf only declares the fields it actually receives.
 * `boundaryPath`/`onResize` are split-only concerns and stay out. */
interface PanelLeafProps {
  panelId: PanelId;
  parentDir: SplitDir | null;
  stripDir: SplitDir | null;
  state: LayoutState;
  registry: PanelRegistry;
  specs: Readonly<Record<PanelId, PanelSpec>>;
  headRegistry?: Partial<Record<PanelId, () => JSX.Element>>;
  strippedByMaximize: ReadonlySet<PanelId>;
  onMaximize: LayoutIntents["maximize"];
  onRestore: LayoutIntents["restore"];
  onCollapse: LayoutIntents["collapse"];
  onExpand: LayoutIntents["expand"];
}

/** A panel leaf — no ref, no imperative event wiring. `parentDir` is the
 * `dir` of the split whose cell holds this panel (null at the tree root, for
 * a single-panel tab like Admin); `stripDir`, when non-null, is the dir of
 * the nearest ancestor split that is NOT itself fully stripped — the axis
 * along which this panel's collapsed space actually reclaims. Together they
 * decide the strip's restore-bar orientation below. Panel leaf objects in
 * LayoutState NEVER change reference at runtime (resize only rebuilds split
 * nodes; maximize/collapse/expand never touch `root` at all — see
 * LayoutMachine.ts's reducer), so this component's own body runs exactly
 * once for the whole app lifetime: every value below that depends on
 * `props.state`/`props.strippedByMaximize`/`props.stripDir` MUST be a
 * function called at its JSX use site, never a top-level const, or collapse/
 * maximize/restore would render correctly once and then freeze forever. */
function PanelLeaf(props: PanelLeafProps): JSX.Element {
  function spec(): PanelSpec | undefined {
    return props.specs[props.panelId];
  }

  function title(): string {
    return spec()?.title ?? props.panelId;
  }

  function collapsed(): boolean {
    return props.state.collapsed.includes(props.panelId);
  }

  function maximizedHere(): boolean {
    return props.state.maximized === props.panelId;
  }

  // Strips are membership-gated, not "everything but the maximized panel": a
  // scoped maximize only strips the leaves inside its boundary (the
  // maximized panel's column siblings); panels outside render normally.
  function strip(): boolean {
    return props.strippedByMaximize.has(props.panelId) || collapsed();
  }

  // A strip whose space reclaims along a row axis shrinks to a narrow,
  // full-height column (PROTO stripBar/collapsedStrip) — restoring it reads
  // top-to-bottom. One reclaiming along a column axis shrinks to a short,
  // full-width bar, which reads left-to-right like the normal header. The
  // reclaim axis is the inherited stripDir when this panel sits inside a
  // fully-stripped subtree (its own parent split collapsed with it, so THAT
  // dir is irrelevant), else the immediate parent split's dir.
  function stripOrientation(): "vertical" | "horizontal" {
    return (props.stripDir ?? props.parentDir) === "row"
      ? "vertical"
      : "horizontal";
  }

  return (
    <section
      data-testid={`panel-${props.panelId}`}
      class={styles.panel}
      data-collapsed={collapsed() ? "true" : "false"}
      data-pinned={spec()?.pinned ? "true" : "false"}
      data-strip={strip() ? "true" : "false"}
      data-strip-orientation={stripOrientation()}
      data-maximized={maximizedHere() ? "true" : "false"}
    >
      <Show
        when={strip()}
        fallback={
          <>
            <header
              data-testid={`panel-${props.panelId}-header`}
              class={styles.panelHeader}
            >
              <Show
                when={props.headRegistry?.[props.panelId] !== undefined}
                fallback={
                  <span
                    data-testid={`panel-${props.panelId}-title`}
                    class={styles.panelTitle}
                  >
                    {title()}
                  </span>
                }
              >
                <div class={styles.panelHeadContent}>
                  {props.headRegistry?.[props.panelId]?.()}
                </div>
              </Show>
              <div class={styles.panelControls}>
                <button
                  type="button"
                  data-testid={`panel-${props.panelId}-collapse`}
                  class={styles.panelControl}
                  aria-label={`Collapse ${title()}`}
                  title={`Collapse ${title()}`}
                  onClick={() => {
                    props.onCollapse(props.panelId);
                  }}
                >
                  —
                </button>
                {/* maximizable: false hides only this control — the panel
                    still strips when a sibling maximizes (spec'd on
                    PanelSpec). */}
                <Show when={spec()?.maximizable !== false}>
                  <button
                    type="button"
                    data-testid={`panel-${props.panelId}-maximize`}
                    class={styles.panelControl}
                    aria-label={
                      maximizedHere()
                        ? `Restore ${title()}`
                        : `Maximize ${title()}`
                    }
                    title={
                      maximizedHere()
                        ? `Restore ${title()}`
                        : `Maximize ${title()}`
                    }
                    onClick={() => {
                      maximizedHere()
                        ? props.onRestore()
                        : props.onMaximize(props.panelId);
                    }}
                  >
                    {maximizedHere() ? "⧉" : "⛶"}
                  </button>
                </Show>
              </div>
            </header>
            {/* data-flip-stage: the scroll container owning the panel's
                visible height — a future FLIP grid's enter sweep anchors to
                its corner (shell/motion, deferred — see Task 10 report). */}
            <div class={styles.panelBody} data-flip-stage>
              <PanelErrorBoundary title={title()}>
                {props.registry[props.panelId]?.()}
              </PanelErrorBoundary>
            </div>
          </>
        }
      >
        <button
          type="button"
          data-testid={`panel-${props.panelId}-collapse`}
          class={styles.stripBar}
          data-orientation={stripOrientation()}
          aria-label={`Restore ${title()}`}
          onClick={() => {
            collapsed() ? props.onExpand(props.panelId) : props.onRestore();
          }}
        >
          <span aria-hidden="true" class={styles.stripGlyph}>
            ⛶
          </span>
          <span class={styles.stripLabel}>{title()}</span>
        </button>
      </Show>
    </section>
  );
}
