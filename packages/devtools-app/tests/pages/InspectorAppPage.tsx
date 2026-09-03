import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { StrictMode } from "react";

import type { InspectorStore } from "@rtc/devtools-core";

import { InspectorApp } from "#/InspectorApp";

export interface InspectorAppHandle {
  rerenderSame(): void;
}

interface KeyModifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
}

function mountElement(
  element: ReactElement,
  rerenderWith: () => ReactElement,
): InspectorAppHandle {
  const { rerender } = render(element);

  return {
    rerenderSame(): void {
      rerender(rerenderWith());
    },
  };
}

export interface InspectorAppPage {
  mount(store: InspectorStore): InspectorAppHandle;
  mountInStrictMode(store: InspectorStore): InspectorAppHandle;
  unmountAll(): void;
  commit(effects: () => void): void;
  waitFor(assertion: () => void): Promise<void>;
  exists(testId: string): boolean;
  text(testId: string): string;
  hasText(text: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
  timelineRowCount(): number;
  pinButtonOfRow(index: number): HTMLElement;
  navNode(id: string): HTMLElement;
  selectedNavScopeId(): string | undefined;
  expandCaretOf(id: string): HTMLElement;
  pinnedEventSeq(): string;
  placeholderElement(text: string): HTMLElement;
  timelineRowsList(): HTMLElement;
  click(testId: string): void;
  clickElement(element: HTMLElement): void;
  clickText(text: string): void;
  clickTextMatching(text: string, selector: string): void;
  clickTitle(title: string): void;
  focus(element: HTMLElement): void;
  pressKeyGlobal(key: string, modifiers?: KeyModifiers): void;
  pressKeyOn(element: HTMLElement, key: string): void;
  changeFile(testId: string, file: File): void;
  scroll(testId: string): void;
}

/** The framework surface for `InspectorApp.test.tsx` — the app's full
 * integration journey (keyboard shortcuts, mouse clicks, imports, scroll).
 * Kept close to the RTL/DOM primitives the journey actually drives (the
 * page's job here is to be the ONLY file naming them), with the tree's own
 * `nav-node` / `nav-node`-scoped lookups promoted to named queries. */
export function inspectorAppPage(): InspectorAppPage {
  function navNode(id: string): HTMLElement {
    const match = screen.getAllByTestId("nav-node").find((el) => {
      return el.dataset.scopeId === id;
    });

    if (match === undefined) {
      throw new Error(`no nav-node ${id}`);
    }

    return match;
  }

  return {
    mount(store: InspectorStore): InspectorAppHandle {
      return mountElement(<InspectorApp store={store} />, () => {
        return <InspectorApp store={store} />;
      });
    },
    mountInStrictMode(store: InspectorStore): InspectorAppHandle {
      return mountElement(
        <StrictMode>
          <InspectorApp store={store} />
        </StrictMode>,
        () => {
          return (
            <StrictMode>
              <InspectorApp store={store} />
            </StrictMode>
          );
        },
      );
    },
    unmountAll(): void {
      cleanup();
    },
    /** Flushes effects applied outside React's render cycle (raw
     * `store.apply(...)` calls driving the hub's subscribers) so the
     * following assertion observes them synchronously. */
    commit(effects: () => void): void {
      act(effects);
    },
    waitFor(assertion: () => void): Promise<void> {
      return waitFor(assertion);
    },

    // Queries
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    text(testId: string): string {
      return screen.getByTestId(testId).textContent ?? "";
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    timelineRowCount(): number {
      return screen.queryAllByTestId("timeline-row").length;
    },
    pinButtonOfRow(index: number): HTMLElement {
      const row = screen.getAllByTestId("timeline-row")[index] as HTMLElement;

      return row.querySelector("button") as HTMLElement;
    },
    navNode,
    selectedNavScopeId(): string | undefined {
      return screen.getAllByTestId("nav-node").find((el) => {
        return el.dataset.selected === "true";
      })?.dataset.scopeId;
    },
    expandCaretOf(id: string): HTMLElement {
      return navNode(id).parentElement?.querySelector(
        "[aria-label='Expand']",
      ) as HTMLElement;
    },
    pinnedEventSeq(): string {
      return screen.getByText("seq").nextElementSibling?.textContent ?? "";
    },
    placeholderElement(text: string): HTMLElement {
      return screen.getByPlaceholderText(text);
    },
    timelineRowsList(): HTMLElement {
      return screen.getByTestId("timeline-rows");
    },

    // Actions
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
    clickElement(element: HTMLElement): void {
      fireEvent.click(element);
    },
    clickText(text: string): void {
      fireEvent.click(screen.getByText(text));
    },
    clickTextMatching(text: string, selector: string): void {
      fireEvent.click(screen.getByText(text, { selector }));
    },
    clickTitle(title: string): void {
      fireEvent.click(screen.getByTitle(title));
    },
    focus(element: HTMLElement): void {
      element.focus();
    },
    pressKeyGlobal(key: string, modifiers?: KeyModifiers): void {
      fireEvent.keyDown(window, { key, ...modifiers });
    },
    pressKeyOn(element: HTMLElement, key: string): void {
      fireEvent.keyDown(element, { key });
    },
    changeFile(testId: string, file: File): void {
      fireEvent.change(screen.getByTestId(testId), {
        target: { files: [file] },
      });
    },
    scroll(testId: string): void {
      fireEvent.scroll(screen.getByTestId(testId));
    },
  };
}
