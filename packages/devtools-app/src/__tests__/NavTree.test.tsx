import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { NavNode } from "#/nav/buildNavTree";
import { NavTree } from "#/nav/NavTree";
import type { Scope } from "#/nav/scope";
import { ALL_SCOPE, scopeKey } from "#/nav/scope";
import { navTreePage } from "#tests/pages/NavTreePage";

const tree = navTreePage();

afterEach(() => {
  tree.unmountAll();
});

let animateSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  animateSpy = vi.fn(() => {
    return { cancel: () => {} };
  });
  Element.prototype.animate =
    animateSpy as unknown as typeof Element.prototype.animate;
});

test("renders roots expanded, groups collapsed; clicking a label selects; caret toggles", () => {
  const selected = mount();

  // Group headers expanded by default → presenter nodes visible; presenter
  // collapsed by default → its streams hidden.
  expect(tree.node("presenter:blotter")).toBeTruthy();
  expect(tree.hasLabel("trades$")).toBe(false);

  tree.click("presenter:blotter");
  expect(selected.at(-1)).toEqual({ kind: "presenter", presenter: "blotter" });
  expect(tree.node("presenter:blotter").dataset.selected).toBe("true");
  expect(tree.node("all").dataset.selected).toBe("false");

  tree.clickExpandAt(0);
  expect(tree.node("stream:blotter.trades$")).toBeTruthy();

  tree.click("stream:blotter.trades$");
  expect(selected.at(-1)).toEqual({
    kind: "stream",
    streamId: "blotter.trades$",
  });
});

test("shows counts, the wire health detail, and dims disposed machines", () => {
  mount();

  expect(tree.node("all").textContent).toContain("7");
  expect(tree.hasLabel("▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 0")).toBe(true);

  tree.clickExpandAt(1); // tileExecution
  expect(tree.isDisposed("machine:m2")).toBe(true);
});

test("keyboard: ArrowDown/Up move the cursor, Enter selects, ArrowRight expands", () => {
  const selected = mount();

  // No container tabIndex to focus (focus-WITHIN, not a focused div): focus
  // the first row's label button, same as a real keyboard user tabbing in,
  // then dispatch every keydown on the FOCUSED element (never the
  // container) so the test proves the events actually bubble to
  // NavTree's onKeyDown rather than assuming it.
  tree.focus("all");

  // First ArrowDown also proves the bubbled event reaches the handler's
  // e.preventDefault() call, not just its side effect.
  expect(tree.pressKeyOnFocusedIsPrevented("ArrowDown")).toBe(true); // all → presenter:blotter

  tree.pressKeyOnFocused("ArrowRight"); // expand blotter
  expect(tree.node("stream:blotter.trades$")).toBeTruthy();

  tree.pressKeyOnFocused("ArrowDown"); // → stream:blotter.activity$
  tree.pressKeyOnFocused("ArrowDown"); // → stream:blotter.trades$
  tree.pressKeyOnFocused("Enter");
  expect(selected.at(-1)).toEqual({
    kind: "stream",
    streamId: "blotter.trades$",
  });

  tree.pressKeyOnFocused("ArrowUp"); // → stream:blotter.activity$
  tree.pressKeyOnFocused("Enter");
  expect(selected.at(-1)).toEqual({
    kind: "stream",
    streamId: "blotter.activity$",
  });
});

test("a node flashes when its lastSeq advances, not on unrelated re-renders", () => {
  const handle = mount();
  const before = animateSpy.mock.calls.length;

  handle.bump("presenter:blotter", 9);
  expect(animateSpy.mock.calls.length).toBeGreaterThan(before);

  const after = animateSpy.mock.calls.length;

  handle.bump("presenter:blotter", 9);
  expect(animateSpy.mock.calls.length).toBe(after);
});

test("collapsing: a header label closes its own group, a caret closes an open node, and ArrowLeft does it from the keyboard", () => {
  const selected = mount();

  // A header row carries no scope, so clicking its LABEL toggles the group
  // instead of selecting anything.
  tree.clickLabel("Presenters");
  expect(tree.scopeIds()).not.toContain("presenter:blotter");
  expect(selected.length).toBe(0);

  tree.clickLabel("Presenters");
  expect(tree.scopeIds()).toContain("presenter:blotter");

  // Caret open, caret closed — the delete half of the expansion toggle.
  tree.clickCaretOf("presenter:blotter");
  expect(tree.scopeIds()).toContain("stream:blotter.trades$");
  tree.clickCaretOf("presenter:blotter");
  expect(tree.scopeIds()).not.toContain("stream:blotter.trades$");

  tree.focus("all");
  tree.pressKeyOnFocused("ArrowDown"); // cursor → presenter:blotter
  tree.pressKeyOnFocused("ArrowRight");
  expect(tree.scopeIds()).toContain("stream:blotter.trades$");
  tree.pressKeyOnFocused("ArrowLeft");
  expect(tree.scopeIds()).not.toContain("stream:blotter.trades$");
  // Already collapsed: a second ArrowLeft leaves the expansion set alone.
  tree.pressKeyOnFocused("ArrowLeft");
  expect(tree.scopeIds()).not.toContain("stream:blotter.trades$");
});

test("a scope-null disposed leaf (evicted machines) renders no caret and is not selectable", () => {
  const selected = mount();

  expect(tree.scopeIds()).not.toContain("machines:evicted");
  expect(tree.labelIsExpandable("Evicted (2)")).toBe(false);

  tree.clickLabel("Evicted (2)");
  expect(selected.length).toBe(0);
});

test("clicking a node label re-syncs the keyboard cursor, not just the selection", () => {
  const selected = mount();

  // Mouse-selecting blotter must move the keyboard cursor onto it too —
  // otherwise it stays seeded on the initial scope ("all") and the next
  // ArrowDown starts from the wrong place. NOTE: this particular case is
  // satisfied by NavTree's render-time cursor derivation alone (`cursorId`
  // snaps to `selectedId` whenever `cursor.forSelection` is stale) — it
  // passes even without `selectThisNode`'s explicit `onMoveCursorTo` call,
  // because a click that CHANGES the selection always changes `selectedId`
  // too. It stays here as basic coverage of the derivation; the next test
  // covers the one case that actually depends on `onMoveCursorTo`.
  tree.click("presenter:blotter");
  tree.focus("presenter:blotter");

  // blotter is collapsed by default, so the next selectable node after it
  // is machineKind:tileExecution, not one of its own (hidden) streams.
  tree.pressKeyOnFocused("ArrowDown");
  tree.pressKeyOnFocused("Enter");

  expect(selected.at(-1)).toEqual({
    kind: "machineKind",
    machineKind: "tileExecution",
  });
});

test("clicking the already-selected node re-syncs a cursor the arrow keys had parked elsewhere", () => {
  const selected = mount();

  // Select blotter (X) — selectedId changes, so the render-time derivation
  // alone already snaps the cursor onto it (see the previous test).
  tree.click("presenter:blotter");
  tree.focus("presenter:blotter");

  // Arrow the cursor away to Y (machineKind:tileExecution) WITHOUT
  // changing the selection — blotter stays selected.
  tree.pressKeyOnFocused("ArrowDown");

  // Re-click the already-selected node X. selectedId does NOT change this
  // time, so the render-time derivation (`cursor.forSelection ===
  // selectedId`) is already satisfied and cannot re-sync anything by
  // itself — only the explicit `onMoveCursorTo(node.id)` call inside
  // `selectThisNode` (NavTree.tsx) parks the cursor back on X.
  tree.click("presenter:blotter");
  tree.focus("presenter:blotter");

  // With the cursor back on X, the next ArrowDown steps to X's own next
  // sibling in the selectable list — machineKind:tileExecution. Without
  // `onMoveCursorTo`, the cursor would still be parked on Y
  // (machineKind:tileExecution) and ArrowDown would instead step PAST it,
  // landing on wire — proving the click did nothing.
  tree.pressKeyOnFocused("ArrowDown");
  tree.pressKeyOnFocused("Enter");

  expect(selected.at(-1)).toEqual({
    kind: "machineKind",
    machineKind: "tileExecution",
  });
});

test("a scope change from outside the tree moves the keyboard cursor to the new selection", () => {
  const selected = mountWithExternalScope();

  // A button OUTSIDE the tree drives the scope change — the way a probe
  // push/pop, Esc, or "show in All" does — never through a click inside
  // NavTree itself.
  tree.clickExternalSelectBlotter();
  tree.focus("presenter:blotter");

  // blotter is collapsed by default, so the next selectable node after it
  // is machineKind:tileExecution. A stale cursor (still seeded on "all")
  // would instead land back on blotter itself — "all"'s own next
  // selectable sibling — silently re-selecting it. Enter proves which
  // node ArrowDown actually moved the cursor FROM.
  tree.pressKeyOnFocused("ArrowDown");
  tree.pressKeyOnFocused("Enter");

  expect(selected.at(-1)).toEqual({
    kind: "machineKind",
    machineKind: "tileExecution",
  });
});

interface MountHandle extends Array<Scope> {
  bump: (id: string, lastSeq: number) => void;
}

function mount(): MountHandle {
  const selected = [] as unknown as MountHandle;

  selected.bump = (): void => {};

  function Harness(): ReactElement {
    const [nodes, setNodes] = useState(sampleTree);
    const [scope, setScope] = useState<Scope>(ALL_SCOPE);

    selected.bump = (id: string, lastSeq: number): void => {
      // The caller invokes this from outside React's render cycle (a test
      // harness, not an event handler), so the update needs an explicit
      // flush via the page's `commit` to happen synchronously —
      // react-dom's createRoot otherwise defers both the re-render and the
      // flash `useEffect` past the assertion that immediately follows.
      tree.commit(() => {
        setNodes((prev) => {
          return prev.map((root) => {
            return withLastSeq(root, id, lastSeq);
          });
        });
      });
    };

    function selectScope(next: Scope): void {
      selected.push(next);
      setScope(next);
    }

    return <NavTree nodes={nodes} scope={scope} onSelect={selectScope} />;
  }

  tree.mount(<Harness />);

  return selected;
}

/** A harness whose `scope` is driven by its own `useState` and changed via
 * a button rendered OUTSIDE the tree — a stand-in for a programmatic scope
 * change (probe push/pop, Esc, "show in All", datasource swap) rather than
 * a click inside NavTree itself. Returns every scope NavTree's `onSelect`
 * was called with, in order. */
function mountWithExternalScope(): Scope[] {
  const selected: Scope[] = [];

  function Harness(): ReactElement {
    const [scope, setScope] = useState<Scope>(ALL_SCOPE);

    function selectScope(next: Scope): void {
      selected.push(next);
      setScope(next);
    }

    function selectBlotterExternally(): void {
      selectScope({ kind: "presenter", presenter: "blotter" });
    }

    return (
      <>
        <NavTree nodes={sampleTree()} scope={scope} onSelect={selectScope} />
        <button
          type="button"
          data-testid="external-select-blotter"
          onClick={selectBlotterExternally}
        />
      </>
    );
  }

  tree.mount(<Harness />);

  return selected;
}

function withLastSeq(node: NavNode, id: string, lastSeq: number): NavNode {
  return {
    ...node,
    lastSeq: node.id === id ? lastSeq : node.lastSeq,
    children: node.children.map((child) => {
      return withLastSeq(child, id, lastSeq);
    }),
  };
}

function sampleTree(): NavNode[] {
  return [
    leaf(ALL_SCOPE, "All", 7, 7),
    {
      ...leaf(null, "Presenters", 0, 0, "presenters"),
      children: [
        {
          ...leaf({ kind: "presenter", presenter: "blotter" }, "blotter", 2, 3),
          children: [
            leaf(
              { kind: "stream", streamId: "blotter.activity$" },
              "activity$",
              0,
              0,
            ),
            leaf(
              { kind: "stream", streamId: "blotter.trades$" },
              "trades$",
              2,
              3,
            ),
          ],
        },
      ],
    },
    {
      ...leaf(null, "Machines", 0, 0, "machines"),
      children: [
        {
          ...leaf(
            { kind: "machineKind", machineKind: "tileExecution" },
            "tileExecution",
            1,
            4,
          ),
          children: [
            leaf({ kind: "machine", machineId: "m1" }, 'm1 ["EURUSD"]', 1, 4),
            {
              ...leaf(
                { kind: "machine", machineId: "m2" },
                'm2 ["USDJPY"]',
                0,
                0,
              ),
              disposed: true,
            },
          ],
        },
        {
          ...leaf(null, "Evicted (2)", 2, 0, "machines:evicted"),
          disposed: true,
        },
      ],
    },
    {
      ...leaf({ kind: "wire" }, "Wire", 1, 5),
      detail: "▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 0",
      children: [leaf({ kind: "msgType", msgType: "PRICE" }, "PRICE", 1, 5)],
    },
  ];
}

function leaf(
  scope: Scope | null,
  label: string,
  count: number,
  lastSeq: number,
  headerId?: string,
): NavNode {
  return {
    id: scope === null ? (headerId ?? label) : scopeKey(scope),
    label,
    scope,
    count,
    lastSeq,
    disposed: false,
    detail: null,
    children: [],
  };
}
