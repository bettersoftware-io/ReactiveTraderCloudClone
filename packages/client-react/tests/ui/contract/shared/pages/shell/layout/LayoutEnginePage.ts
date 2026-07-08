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
  /** Mounts the synthetic pinned + fixedPx fixture (see
   * react/pinnedFixtureLayoutPort.ts) instead of the default FX tree, to
   * exercise the InhouseLayoutEngine render branches that PANEL_SPECS /
   * defaultLayoutPort no longer produce since every default split became
   * user-resizable (Task 2). The pinned/fixedPx machinery itself stays in the
   * engine for a future panel that opts out of resizing. */
  pinnedFixture?: boolean;
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

  /** The accessible name of whatever control currently sits at the shared
   * `panel-<id>-collapse` testid: the strip's restore bar ("Restore <title>")
   * while the panel is a strip (collapsed, or a sibling of the maximized
   * panel), or the header's small collapse icon ("Collapse <title>")
   * otherwise. */
  stripRestoreLabel(id: string): string | null {
    return (
      within(this.panel(id))
        .queryByTestId(`panel-${id}-collapse`)
        ?.getAttribute("aria-label") ?? null
    );
  }

  /** "vertical" when the strip restore bar reads top-to-bottom (its cell is
   * a child of a row split — narrow/tall), "horizontal" otherwise. Null when
   * the panel isn't currently a strip. */
  stripOrientation(id: string): string | null {
    return (
      within(this.panel(id))
        .queryByTestId(`panel-${id}-collapse`)
        ?.getAttribute("data-orientation") ?? null
    );
  }

  isPinned(id: string): boolean {
    return this.panel(id).getAttribute("data-pinned") === "true";
  }

  /** The header's own maximize/restore control glyph: "⛶" while collapsed
   * (click to maximize) or "⧉" once maximized (click to restore) — ported
   * from client-prototype's Panel.tsx `maxBtn` glyph pair (Task 4). */
  maximizeGlyph(id: string): string | null {
    return (
      within(this.panel(id)).queryByTestId(`panel-${id}-maximize`)
        ?.textContent ?? null
    );
  }

  /** The accessible name of the header's maximize/restore control — kept
   * separate from `stripRestoreLabel` (the strip's own restore-bar control,
   * a different element with the "-collapse" testid). */
  maximizeAriaLabel(id: string): string | null {
    return (
      within(this.panel(id))
        .queryByTestId(`panel-${id}-maximize`)
        ?.getAttribute("aria-label") ?? null
    );
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

  /** Clicks a strip's restore bar when the panel isn't itself collapsed but
   * was forced to strip by another panel's maximize — same control, named
   * separately here because it drives `onRestore` rather than `onExpand`. */
  expandStrip(id: string): void {
    this.emitClick(`panel-${id}-collapse`);
  }

  private emitClick(testId: string): void {
    fireEvent.click(within(this.root).getByTestId(testId));
  }

  handleExists(pathKey: string, i: number): boolean {
    return within(this.root).queryByTestId(`handle-${pathKey}-${i}`) !== null;
  }

  /** True when the cell wrapping this child (identified the same way as
   * `handleExists`'s pathKey/index pair) has released its ratio-derived
   * flex-grow because its entire subtree is strips — every panel leaf inside
   * it is either collapsed or a sibling of the maximized panel elsewhere. */
  isStripCell(pathKey: string, i: number): boolean {
    return (
      within(this.root)
        .getByTestId(`cell-${pathKey}-${i}`)
        .getAttribute("data-strip-cell") === "true"
    );
  }

  /** The handle element itself — for asserting DOM position (sibling vs
   * descendant of a cell), not just presence. */
  handleElement(pathKey: string, i: number): HTMLElement {
    return within(this.root).getByTestId(`handle-${pathKey}-${i}`);
  }

  /** True when the cell still renders its initialPx design width (px-fixed
   * with the resize handle kept). Root-scope maximize drops this everywhere;
   * a nearest-column maximize keeps it on the rail cell, which sits at (not
   * inside) the boundary. */
  isInitialCell(pathKey: string, i: number): boolean {
    return (
      within(this.root)
        .getByTestId(`cell-${pathKey}-${i}`)
        .getAttribute("data-initial-cell") === "true"
    );
  }

  /** True when this strip cell's strips run perpendicular to the owning
   * split's axis (inherited orientation) and it therefore shares the split's
   * main-axis space instead of hugging — vertical strips stacking down (and
   * filling) the freed full-height rail. */
  isStripFillCell(pathKey: string, i: number): boolean {
    return (
      within(this.root)
        .getByTestId(`cell-${pathKey}-${i}`)
        .getAttribute("data-strip-fill") === "true"
    );
  }
}
