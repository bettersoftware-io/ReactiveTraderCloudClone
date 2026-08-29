import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { NavNode } from "#/nav/buildNavTree";
import { NavTree } from "#/nav/NavTree";
import type { Scope } from "#/nav/scope";
import { ALL_SCOPE, scopeKey } from "#/nav/scope";

afterEach(cleanup);

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
  expect(node("presenter:blotter")).toBeTruthy();
  expect(screen.queryByText("trades$")).toBeNull();

  fireEvent.click(node("presenter:blotter"));
  expect(selected.at(-1)).toEqual({ kind: "presenter", presenter: "blotter" });
  expect(node("presenter:blotter").dataset.selected).toBe("true");
  expect(node("all").dataset.selected).toBe("false");

  fireEvent.click(screen.getAllByLabelText("Expand")[0] as HTMLElement);
  expect(node("stream:blotter.trades$")).toBeTruthy();

  fireEvent.click(node("stream:blotter.trades$"));
  expect(selected.at(-1)).toEqual({
    kind: "stream",
    streamId: "blotter.trades$",
  });
});

test("shows counts, the wire health detail, and dims disposed machines", () => {
  mount();

  expect(node("all").textContent).toContain("7");
  expect(
    screen.getByText("▼ 0.1 in/s · ▲ 0.0 out/s · reconnects: 0"),
  ).toBeTruthy();

  fireEvent.click(screen.getAllByLabelText("Expand")[1] as HTMLElement); // tileExecution
  expect(
    node("machine:m2")
      .closest("[data-disposed]")
      ?.getAttribute("data-disposed"),
  ).toBe("true");
});

test("keyboard: ArrowDown/Up move the cursor, Enter selects, ArrowRight expands", () => {
  const selected = mount();

  // No container tabIndex to focus (focus-WITHIN, not a focused div): focus
  // the first row's label button, same as a real keyboard user tabbing in,
  // then dispatch every keydown on the FOCUSED element (never the
  // container) so the test proves the events actually bubble to
  // NavTree's onKeyDown rather than assuming it.
  node("all").focus();

  // First ArrowDown also proves the bubbled event reaches the handler's
  // e.preventDefault() call, not just its side effect.
  const arrowDown = createEvent.keyDown(document.activeElement as HTMLElement, {
    key: "ArrowDown",
  });

  fireEvent(document.activeElement as HTMLElement, arrowDown); // all → presenter:blotter
  expect(arrowDown.defaultPrevented).toBe(true);

  pressKey("ArrowRight"); // expand blotter
  expect(node("stream:blotter.trades$")).toBeTruthy();

  pressKey("ArrowDown"); // → stream:blotter.activity$
  pressKey("ArrowDown"); // → stream:blotter.trades$
  pressKey("Enter");
  expect(selected.at(-1)).toEqual({
    kind: "stream",
    streamId: "blotter.trades$",
  });

  pressKey("ArrowUp"); // → stream:blotter.activity$
  pressKey("Enter");
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
  fireEvent.click(screen.getByText("Presenters"));
  expect(scopeIds()).not.toContain("presenter:blotter");
  expect(selected.length).toBe(0);

  fireEvent.click(screen.getByText("Presenters"));
  expect(scopeIds()).toContain("presenter:blotter");

  // Caret open, caret closed — the delete half of the expansion toggle.
  fireEvent.click(caretOf("presenter:blotter"));
  expect(scopeIds()).toContain("stream:blotter.trades$");
  fireEvent.click(caretOf("presenter:blotter"));
  expect(scopeIds()).not.toContain("stream:blotter.trades$");

  node("all").focus();
  pressKey("ArrowDown"); // cursor → presenter:blotter
  pressKey("ArrowRight");
  expect(scopeIds()).toContain("stream:blotter.trades$");
  pressKey("ArrowLeft");
  expect(scopeIds()).not.toContain("stream:blotter.trades$");
  // Already collapsed: a second ArrowLeft leaves the expansion set alone.
  pressKey("ArrowLeft");
  expect(scopeIds()).not.toContain("stream:blotter.trades$");
});

test("a scope-null disposed leaf (evicted machines) renders no caret and is not selectable", () => {
  const selected = mount();

  expect(scopeIds()).not.toContain("machines:evicted");

  const evictedLabel = screen.getByText("Evicted (2)");

  expect(
    evictedLabel
      .closest("[data-depth]")
      ?.querySelector("[aria-label='Expand'], [aria-label='Collapse']"),
  ).toBeNull();

  fireEvent.click(evictedLabel);
  expect(selected.length).toBe(0);
});

test("clicking a node label re-syncs the keyboard cursor, not just the selection", () => {
  const selected = mount();

  // Mouse-selecting blotter must move the keyboard cursor onto it too —
  // otherwise it stays seeded on the initial scope ("all") and the next
  // ArrowDown starts from the wrong place.
  fireEvent.click(node("presenter:blotter"));
  node("presenter:blotter").focus();

  // blotter is collapsed by default, so the next selectable node after it
  // is machineKind:tileExecution, not one of its own (hidden) streams.
  pressKey("ArrowDown");
  pressKey("Enter");

  expect(selected.at(-1)).toEqual({
    kind: "machineKind",
    machineKind: "tileExecution",
  });
});

function scopeIds(): string[] {
  return screen.getAllByTestId("nav-node").map((el) => {
    return el.dataset.scopeId ?? "";
  });
}

function caretOf(id: string): HTMLElement {
  return node(id).parentElement?.querySelector(
    "[aria-label='Expand'], [aria-label='Collapse']",
  ) as HTMLElement;
}

function node(id: string): HTMLElement {
  const match = screen.getAllByTestId("nav-node").find((el) => {
    return el.dataset.scopeId === id;
  });

  if (match === undefined) {
    throw new Error(`no nav-node ${id}`);
  }

  return match;
}

/** Dispatches a keydown on whatever currently has focus — the focused row
 * button in these tests — so it must BUBBLE to NavTree's onKeyDown to have
 * any effect. Dispatching on the container directly (as an earlier version
 * of this test did) would keep passing even if a row button stopped
 * propagation, silently breaking real keyboard navigation. */
function pressKey(key: string): void {
  fireEvent.keyDown(document.activeElement as HTMLElement, { key });
}

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
      // `act()` to flush synchronously — react-dom's createRoot otherwise
      // defers both the re-render and the flash `useEffect` past the
      // assertion that immediately follows.
      act(() => {
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

  render(<Harness />);

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
