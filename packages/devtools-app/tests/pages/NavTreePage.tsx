import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { type ReactElement, useState } from "react";

import type { NavNode } from "#/nav/buildNavTree";
import { NavTree } from "#/nav/NavTree";
import type { Scope } from "#/nav/scope";
import { ALL_SCOPE } from "#/nav/scope";

/** Every scope `NavTree`'s `onSelect` fired with, in order, plus a way to
 * push a new `lastSeq` into a node from OUTSIDE React's render cycle. Kept as
 * an array subtype so a case reads `selected.at(-1)` / `selected.length`
 * directly. */
interface NavTreeMountHandle extends Array<Scope> {
  bump: (id: string, lastSeq: number) => void;
}

interface NavTreeMountProps {
  nodes: readonly NavNode[];
}

export interface NavTreePage {
  /** Mounts `NavTree` inside a harness that owns its `nodes` and `scope`
   * state, so a case can drive a selection or a seq bump and see the tree
   * re-render. The harness is the page's business — a spec that built it
   * would be back to composing the subject itself. */
  mount(props: NavTreeMountProps): NavTreeMountHandle;
  /** Mounts `NavTree` beside a button rendered OUTSIDE it — a stand-in for a
   * programmatic scope change (probe push/pop, Esc, "show in All", datasource
   * swap) rather than a click inside the tree. */
  mountWithExternalScope(props: NavTreeMountProps): Scope[];
  unmountAll(): void;
  commit(effects: () => void): void;
  node(id: string): HTMLElement;
  isDisposed(id: string): boolean;
  labelIsExpandable(text: string): boolean;
  hasLabel(text: string): boolean;
  click(id: string): void;
  clickLabel(text: string): void;
  clickExpandAt(index: number): void;
  clickCaretOf(id: string): void;
  clickExternalSelectBlotter(): void;
  focus(id: string): void;
  pressKeyOnFocused(key: string): void;
  pressKeyOnFocusedIsPrevented(key: string): boolean;
  scopeIds(): string[];
}

/** The framework surface for `NavTree.test.tsx`: every `screen`/`fireEvent`/
 * `render`/`act` call the spec needs, behind semantic verbs/queries. */
export function navTreePage(): NavTreePage {
  function node(id: string): HTMLElement {
    const match = screen.getAllByTestId("nav-node").find((el) => {
      return el.dataset.scopeId === id;
    });

    if (match === undefined) {
      throw new Error(`no nav-node ${id}`);
    }

    return match;
  }

  return {
    mount(props: NavTreeMountProps): NavTreeMountHandle {
      const selected = [] as unknown as NavTreeMountHandle;

      selected.bump = (): void => {};

      function Harness(): ReactElement {
        const [nodes, setNodes] = useState(props.nodes);
        const [scope, setScope] = useState<Scope>(ALL_SCOPE);

        selected.bump = (id: string, lastSeq: number): void => {
          // The caller invokes this from outside React's render cycle (a test
          // harness, not an event handler), so the update needs an explicit
          // `act` flush to happen synchronously — react-dom's createRoot
          // otherwise defers both the re-render and the flash `useEffect`
          // past the assertion that immediately follows.
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
    },
    mountWithExternalScope(props: NavTreeMountProps): Scope[] {
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
            <NavTree nodes={props.nodes} scope={scope} onSelect={selectScope} />
            <button
              type="button"
              data-testid="external-select-blotter"
              onClick={selectBlotterExternally}
            />
          </>
        );
      }

      render(<Harness />);

      return selected;
    },
    unmountAll(): void {
      cleanup();
    },
    /** Flushes a state update made outside React's render cycle (a test
     * harness callback, not an event handler) so the following assertion
     * sees it synchronously. */
    commit(effects: () => void): void {
      act(effects);
    },
    node,
    isDisposed(id: string): boolean {
      return (
        node(id).closest("[data-disposed]")?.getAttribute("data-disposed") ===
        "true"
      );
    },
    labelIsExpandable(text: string): boolean {
      return (
        screen
          .getByText(text)
          .closest("[data-depth]")
          ?.querySelector("[aria-label='Expand'], [aria-label='Collapse']") !=
        null
      );
    },
    hasLabel(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    click(id: string): void {
      fireEvent.click(node(id));
    },
    clickLabel(text: string): void {
      fireEvent.click(screen.getByText(text));
    },
    clickExpandAt(index: number): void {
      fireEvent.click(screen.getAllByLabelText("Expand")[index] as HTMLElement);
    },
    clickCaretOf(id: string): void {
      const caret = node(id).parentElement?.querySelector(
        "[aria-label='Expand'], [aria-label='Collapse']",
      ) as HTMLElement;

      fireEvent.click(caret);
    },
    clickExternalSelectBlotter(): void {
      fireEvent.click(screen.getByTestId("external-select-blotter"));
    },
    focus(id: string): void {
      node(id).focus();
    },
    pressKeyOnFocused(key: string): void {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key });
    },
    /** Dispatches the key via `createEvent` so the caller can observe
     * whether the handler called `preventDefault()`. */
    pressKeyOnFocusedIsPrevented(key: string): boolean {
      const target = document.activeElement as HTMLElement;
      const event = createEvent.keyDown(target, { key });

      fireEvent(target, event);

      return event.defaultPrevented;
    },
    scopeIds(): string[] {
      return screen.getAllByTestId("nav-node").map((el) => {
        return el.dataset.scopeId ?? "";
      });
    },
  };
}

/** Sets `lastSeq` on the node with `id`, anywhere in the tree. Harness
 * mechanics, not spec data, so it lives with the harness. */
function withLastSeq(node: NavNode, id: string, lastSeq: number): NavNode {
  return {
    ...node,
    lastSeq: node.id === id ? lastSeq : node.lastSeq,
    children: node.children.map((child) => {
      return withLastSeq(child, id, lastSeq);
    }),
  };
}
