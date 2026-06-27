import { fireEvent, within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Page object for the InhouseLayoutEngine. The engine is dumb: it renders a
 * LayoutState and calls intent callbacks. The contract spec mounts it with a
 * test PanelRegistry (Task 7 registry) and a seeded state, drives the controls,
 * and asserts the data-* render contract + recorded intent calls. */
export class LayoutEnginePage extends MountedComponent<Record<string, never>> {
  private panel(id: string): HTMLElement {
    return within(this.root).getByTestId(`panel-${id}`);
  }

  bodyText(id: string): string | null {
    const body = within(this.root).queryByTestId(`${id}-body`);
    return body?.textContent ?? null;
  }

  isStrip(id: string): boolean {
    return this.panel(id).getAttribute("data-strip") === "true";
  }

  isPinned(id: string): boolean {
    return this.panel(id).getAttribute("data-pinned") === "true";
  }

  maximize(id: string): void {
    this.emitClick(`panel-${id}-maximize`);
  }

  collapse(id: string): void {
    this.emitClick(`panel-${id}-collapse`);
  }

  expand(id: string): void {
    this.emitClick(`panel-${id}-collapse`);
  }

  private emitClick(testId: string): void {
    fireEvent.click(within(this.root).getByTestId(testId));
  }

  handleExists(pathKey: string, i: number): boolean {
    return within(this.root).queryByTestId(`handle-${pathKey}-${i}`) !== null;
  }
}
