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

interface InspectorAppHandle {
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

// The scoped-search box's placeholder is the one stable handle the spec
// needs for it; centralized here so the two search-focused methods below
// (and only they) know it.
const SEARCH_PLACEHOLDER = "Search scope… ( / )";

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
  navNodeIsSelected(id: string): boolean;
  navNodeText(id: string): string;
  selectedNavScopeId(): string | undefined;
  pinnedEventSeq(): string;
  searchHasFocus(): boolean;
  timelineRowsList(): HTMLElement;
  click(testId: string): void;
  clickNavNode(id: string): void;
  clickExpandCaretOf(id: string): void;
  clickPinButtonOfRow(index: number): void;
  clickWireProbeButton(): void;
  clickTitle(title: string): void;
  focusNavNode(id: string): void;
  pressKeyGlobal(key: string, modifiers?: KeyModifiers): void;
  pressKeyOnNavNode(id: string, key: string): void;
  pressKeyOnSearch(key: string): void;
  changeFile(testId: string, file: File): void;
  scroll(testId: string): void;
}

/** The framework surface for `InspectorApp.test.tsx` — the app's full
 * integration journey (keyboard shortcuts, mouse clicks, imports, scroll).
 * Every method is named for the domain action it performs (a nav-tree node,
 * the scoped search box, a timeline row's pin button, the wire-probe button
 * inside the pinned bar) — no raw `HTMLElement`, CSS selector, or DOM query
 * crosses back into the spec. */
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

  function searchInput(): HTMLElement {
    return screen.getByPlaceholderText(SEARCH_PLACEHOLDER);
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
    navNodeIsSelected(id: string): boolean {
      return navNode(id).dataset.selected === "true";
    },
    navNodeText(id: string): string {
      return navNode(id).textContent ?? "";
    },
    selectedNavScopeId(): string | undefined {
      return screen.getAllByTestId("nav-node").find((el) => {
        return el.dataset.selected === "true";
      })?.dataset.scopeId;
    },
    pinnedEventSeq(): string {
      return screen.getByText("seq").nextElementSibling?.textContent ?? "";
    },
    searchHasFocus(): boolean {
      return document.activeElement === searchInput();
    },
    timelineRowsList(): HTMLElement {
      return screen.getByTestId("timeline-rows");
    },

    // Actions
    click(testId: string): void {
      fireEvent.click(screen.getByTestId(testId));
    },
    clickNavNode(id: string): void {
      fireEvent.click(navNode(id));
    },
    clickExpandCaretOf(id: string): void {
      const caret = navNode(id).parentElement?.querySelector(
        "[aria-label='Expand']",
      ) as HTMLElement;

      fireEvent.click(caret);
    },
    clickPinButtonOfRow(index: number): void {
      const row = screen.getAllByTestId("timeline-row")[index] as HTMLElement;
      const button = row.querySelector("button") as HTMLElement;

      fireEvent.click(button);
    },
    /** The "wire ±100ms" button rendered inside the pinned bar — the one
     * spot the journey clicks a button scoped by an ancestor, not by its
     * own testid. */
    clickWireProbeButton(): void {
      fireEvent.click(
        screen.getByText("wire ±100ms", {
          selector: "[data-testid='pinned-bar'] button",
        }),
      );
    },
    clickTitle(title: string): void {
      fireEvent.click(screen.getByTitle(title));
    },
    focusNavNode(id: string): void {
      navNode(id).focus();
    },
    pressKeyGlobal(key: string, modifiers?: KeyModifiers): void {
      fireEvent.keyDown(window, { key, ...modifiers });
    },
    pressKeyOnNavNode(id: string, key: string): void {
      fireEvent.keyDown(navNode(id), { key });
    },
    pressKeyOnSearch(key: string): void {
      fireEvent.keyDown(searchInput(), { key });
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
