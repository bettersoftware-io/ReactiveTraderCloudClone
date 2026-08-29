import type { KeyboardEvent, ReactElement } from "react";
import { useRef, useState } from "react";

import type { NavNode } from "#/nav/buildNavTree";
import styles from "#/nav/NavTree.module.css";
import type { Scope } from "#/nav/scope";
import { scopeKey } from "#/nav/scope";
import { useFlashOnSeq } from "#/panels/flash";

/** The rail navigator (spec §3.1): one tree, four roots, one selection.
 * Expansion is local view state keyed by node id and independent of
 * selection; the selection itself lives in `useNavigation` and arrives as
 * `scope`. Keyboard (when the tree is focused): ↑/↓ move a cursor over the
 * visible selectable nodes, Enter selects, ←/→ collapse/expand. */
export function NavTree({
  nodes,
  scope,
  onSelect,
}: NavTreeProps): ReactElement {
  const [expanded, setExpanded] =
    useState<ReadonlySet<string>>(DEFAULT_EXPANDED);
  const selectedId = scopeKey(scope);
  const [cursor, setCursor] = useState<TreeCursor>({
    id: selectedId,
    forSelection: selectedId,
  });
  // Derived at render time, never in an effect: a scope change made
  // OUTSIDE the tree (probe push/pop, Esc, "show in All", datasource
  // swap) leaves the cursor stamped with the selection it was placed
  // under, so it snaps to the new selection instead of going stale.
  const cursorId = cursor.forSelection === selectedId ? cursor.id : selectedId;
  const visible = flattenVisible(nodes, expanded);

  function moveCursorTo(id: string): void {
    setCursor({ id, forSelection: selectedId });
  }

  function toggleNodeExpansion(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function moveTreeCursor(e: KeyboardEvent<HTMLDivElement>): void {
    const selectable = visible.filter((entry) => {
      return entry.node.scope !== null;
    });

    const index = selectable.findIndex((entry) => {
      return entry.node.id === cursorId;
    });
    const current = selectable[index]?.node ?? null;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.max(
        0,
        Math.min(index + delta, selectable.length - 1),
      );
      const next = selectable[nextIndex];

      if (next !== undefined) {
        moveCursorTo(next.node.id);
      }
    } else if (
      e.key === "Enter" &&
      current !== null &&
      current.scope !== null
    ) {
      e.preventDefault();
      onSelect(current.scope);
    } else if (
      e.key === "ArrowRight" &&
      current !== null &&
      current.children.length > 0
    ) {
      e.preventDefault();
      setExpanded((prev) => {
        return prev.has(current.id) ? prev : new Set(prev).add(current.id);
      });
    } else if (e.key === "ArrowLeft" && current !== null) {
      e.preventDefault();
      setExpanded((prev) => {
        if (!prev.has(current.id)) {
          return prev;
        }

        const next = new Set(prev);

        next.delete(current.id);

        return next;
      });
    }
  }

  return (
    // No tabIndex here: the container itself is never focused. The
    // label/caret <button>s are natively focusable, and their keydown
    // events bubble up to this handler — "the tree has focus" means
    // focus-WITHIN, not a focused container div. role="application" stays
    // only to satisfy noStaticElementInteractions (a static div may not
    // carry onKeyDown); it is not asserting a fully-formed ARIA tree.
    <div
      data-nav-tree=""
      data-testid="nav-tree"
      role="application"
      aria-label="Navigation"
      className={styles.tree}
      onKeyDown={moveTreeCursor}
    >
      {visible.map((entry) => {
        return (
          <NavRow
            key={entry.node.id}
            node={entry.node}
            depth={entry.depth}
            expanded={expanded.has(entry.node.id)}
            selected={entry.node.id === selectedId}
            atCursor={entry.node.id === cursorId}
            onSelect={onSelect}
            onToggle={toggleNodeExpansion}
            onMoveCursorTo={moveCursorTo}
          />
        );
      })}
    </div>
  );
}

export interface NavTreeProps {
  nodes: readonly NavNode[];
  scope: Scope;
  onSelect: (scope: Scope) => void;
}

interface TreeCursor {
  id: string;
  /** The selection this cursor was placed under; a different selection
   * means the cursor is stale and the derived `cursorId` snaps to the
   * new selection instead. */
  forSelection: string;
}

const DEFAULT_EXPANDED: ReadonlySet<string> = new Set([
  "presenters",
  "machines",
  "wire",
]);

interface VisibleEntry {
  node: NavNode;
  depth: number;
}

interface NavRowProps {
  node: NavNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  atCursor: boolean;
  onSelect: (scope: Scope) => void;
  onToggle: (id: string) => void;
  onMoveCursorTo: (id: string) => void;
}

function NavRow({
  node,
  depth,
  expanded,
  selected,
  atCursor,
  onSelect,
  onToggle,
  onMoveCursorTo,
}: NavRowProps): ReactElement {
  const flashRef = useRef<HTMLSpanElement>(null);
  const hasChildren = node.children.length > 0;

  // opacity-only WAAPI flash, shared: panels/flash.ts
  useFlashOnSeq(flashRef, node.lastSeq);

  function toggleThisNode(): void {
    onToggle(node.id);
  }

  function selectThisNode(): void {
    if (node.scope === null) {
      onToggle(node.id);
    } else {
      onSelect(node.scope);
      onMoveCursorTo(node.id);
    }
  }

  const rowClassName = [
    styles.row,
    selected ? styles.rowSelected : "",
    atCursor ? styles.rowCursor : "",
    node.disposed ? styles.rowDisposed : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rowClassName}
      data-depth={depth}
      data-disposed={node.disposed ? "true" : "false"}
    >
      {hasChildren ? (
        <button
          type="button"
          className={styles.caret}
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={toggleThisNode}
        >
          {expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className={styles.caretSpacer} />
      )}
      <button
        type="button"
        className={node.scope === null ? styles.header : styles.label}
        data-testid={node.scope === null ? undefined : "nav-node"}
        data-scope-id={node.scope === null ? undefined : node.id}
        data-selected={node.scope === null ? undefined : String(selected)}
        title={node.scope === null ? undefined : node.id}
        onClick={selectThisNode}
      >
        <span ref={flashRef} className={styles.labelText}>
          {node.label}
        </span>
        {node.scope !== null ? (
          <span className={styles.count}>{node.count}</span>
        ) : null}
      </button>
      {node.detail !== null ? (
        <span className={styles.detail}>{node.detail}</span>
      ) : null}
    </div>
  );
}

function flattenVisible(
  nodes: readonly NavNode[],
  expanded: ReadonlySet<string>,
): VisibleEntry[] {
  const out: VisibleEntry[] = [];

  function walk(list: readonly NavNode[], depth: number): void {
    for (const node of list) {
      out.push({ node, depth });

      if (node.children.length > 0 && expanded.has(node.id)) {
        walk(node.children, depth + 1);
      }
    }
  }

  walk(nodes, 0);

  return out;
}
