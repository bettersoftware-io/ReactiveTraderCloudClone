import { flushSync } from "react-dom";

export interface ReactTreeMountPage {
  /** A fresh container in the document, for one tree mount. */
  createContainer(): HTMLElement;
  /** True when `container` holds an element with `testId`. */
  shows(container: HTMLElement, testId: string): boolean;
  /** True when `container` holds nothing at all. */
  isEmpty(container: HTMLElement): boolean;
  /** Clicks the mounted tree's button, flushing the update synchronously —
   * not through `act`, which rethrows a render error itself and would hide
   * the root's own error path. */
  clickButtonIn(container: HTMLElement): void;
  removeContainers(): void;
}

/** The DOM surface for `reactTreeMount.test.tsx`. */
export function reactTreeMountPage(): ReactTreeMountPage {
  return {
    createContainer(): HTMLElement {
      const container = document.createElement("div");
      document.body.append(container);
      return container;
    },
    shows(container: HTMLElement, testId: string): boolean {
      return container.querySelector(`[data-testid="${testId}"]`) !== null;
    },
    isEmpty(container: HTMLElement): boolean {
      return container.innerHTML === "";
    },
    clickButtonIn(container: HTMLElement): void {
      flushSync(() => {
        container.querySelector("button")?.click();
      });
    },
    removeContainers(): void {
      document.body.replaceChildren();
    },
  };
}
