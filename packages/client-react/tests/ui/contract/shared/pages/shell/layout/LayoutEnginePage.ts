import { fireEvent, within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface LayoutEngineProps {
  /** Panel ids that should receive a custom head-slot test double (renders
   * `data-testid="custom-head"` in place of the title span). Undefined/empty
   * means every panel falls back to the default title (Task 11's headRegistry
   * slot). Kept as a plain string list — not the real
   * `Partial<Record<PanelId, () => ReactElement>>` — so the spec stays a plain
   * .ts file; the React registry builds the actual headRegistry from it. */
  customHeadPanelIds?: readonly string[];
}

/** Page object for the InhouseLayoutEngine. The engine is dumb: it renders a
 * LayoutState and calls intent callbacks. The contract spec mounts it with a
 * test PanelRegistry (Task 7 registry) and a seeded state, drives the controls,
 * and asserts the data-* render contract + recorded intent calls. */
export class LayoutEnginePage extends MountedComponent<LayoutEngineProps> {
  private panel(id: string): HTMLElement {
    return within(this.root).getByTestId(`panel-${id}`);
  }

  bodyText(id: string): string | null {
    const body = within(this.root).queryByTestId(`${id}-body`);
    return body?.textContent ?? null;
  }

  /** True when the panel's head slot rendered the registered custom head
   * (Task 11's `panel-a-header` slot contract). */
  hasCustomHead(id: string): boolean {
    return within(this.panel(id)).queryByTestId("custom-head") !== null;
  }

  /** The default title span's text, or null when a custom head replaced it. */
  titleText(id: string): string | null {
    return (
      within(this.panel(id)).queryByTestId(`panel-${id}-title`)?.textContent ??
      null
    );
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
