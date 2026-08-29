import {
  act,
  cleanup,
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
  const tree = screen.getByTestId("nav-tree");

  // No container tabIndex to focus (focus-WITHIN, not a focused div): focus
  // the first row's label button, same as a real keyboard user tabbing in.
  // Keydown still bubbles up to the tree's onKeyDown either way.
  node("all").focus();
  fireEvent.keyDown(tree, { key: "ArrowDown" }); // all → presenter:blotter
  fireEvent.keyDown(tree, { key: "ArrowRight" }); // expand blotter
  expect(node("stream:blotter.trades$")).toBeTruthy();

  fireEvent.keyDown(tree, { key: "ArrowDown" }); // → stream:blotter.activity$
  fireEvent.keyDown(tree, { key: "ArrowDown" }); // → stream:blotter.trades$
  fireEvent.keyDown(tree, { key: "Enter" });
  expect(selected.at(-1)).toEqual({
    kind: "stream",
    streamId: "blotter.trades$",
  });

  fireEvent.keyDown(tree, { key: "ArrowUp" }); // → stream:blotter.activity$
  fireEvent.keyDown(tree, { key: "Enter" });
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

function node(id: string): HTMLElement {
  const match = screen.getAllByTestId("nav-node").find((el) => {
    return el.dataset.scopeId === id;
  });

  if (match === undefined) {
    throw new Error(`no nav-node ${id}`);
  }

  return match;
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
