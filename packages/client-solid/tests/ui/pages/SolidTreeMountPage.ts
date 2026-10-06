export interface SolidTreeMountPage {
  /** A fresh container in the document, for one tree mount. */
  createContainer(): HTMLElement;
  /** True when `container` holds an element with `testId`. */
  shows(container: HTMLElement, testId: string): boolean;
  /** True when `container` holds nothing at all. */
  isEmpty(container: HTMLElement): boolean;
  removeContainers(): void;
}

/** The DOM surface for `solidTreeMount.test.tsx`. */
export function solidTreeMountPage(): SolidTreeMountPage {
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
    removeContainers(): void {
      document.body.replaceChildren();
    },
  };
}
