import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";

export interface NavTreePage {
  mount(element: ReactElement): void;
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
    mount(element: ReactElement): void {
      render(element);
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
