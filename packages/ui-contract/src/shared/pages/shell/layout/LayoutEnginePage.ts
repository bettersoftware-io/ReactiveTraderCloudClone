import { fireEvent, within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import { PANEL_RENDERER_TESTIDS } from "../jarvis/JarvisPanelLayerPage";

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

/** The `aria-label` prefix `JarvisDockedPanelHead` builds its unpin control's
 * label from (`` `Unpin ${title}` ``) — parsed back out by {@link
 * LayoutEnginePage.dockedTitle}. */
const UNPIN_LABEL_PREFIX = "Unpin ";

/** Page object for the InhouseLayoutEngine. The engine is dumb: it renders a
 * LayoutState and calls intent callbacks. The contract spec mounts it with a
 * test PanelRegistry (Task 7 registry) and a seeded state, drives the controls,
 * and asserts the data-* render contract + recorded intent calls. */
export class LayoutEnginePage extends MountedComponent<LayoutEngineProps> {
  private readonly user: UserEvent = userEvent.setup();

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

  /** True when `id` currently renders as a DOCKED desk panel: a `panel-<id>`
   * leaf whose head slot is `JarvisDockedPanelHead` (its unpin control is the
   * discriminator). Deliberately NOT `data-pinned` — that attribute is the
   * engine's own pre-existing "fixed bottom strip" concept and has nothing to
   * do with GenUI L3 docking (see `isPinned` above). Returns false — never
   * throws — for an id the active tab's tree has no leaf for, which is the
   * shape an "it undocked / it closed" assertion needs. */
  isDocked(id: string): boolean {
    const panel = within(this.root).queryByTestId(`panel-${id}`);
    return (
      panel !== null &&
      within(panel).queryByTestId("jarvis-panel-undock") !== null
    );
  }

  /** A docked desk panel's own title, parsed back out of its unpin control's
   * `aria-label` (`` `Unpin ${title}` ``) rather than read off a CSS-module
   * class — the same indirection `JarvisPanelLayerPage.title` uses for the
   * floating card. The docked head REPLACES the engine's default title span,
   * so `titleText` reads null for these leaves. */
  dockedTitle(id: string): string | null {
    const label = this.undockLabel(id);
    return label?.startsWith(UNPIN_LABEL_PREFIX) === true
      ? label.slice(UNPIN_LABEL_PREFIX.length)
      : label;
  }

  /** Which renderer testid (line/table/gauge/spark-grid/heatmap/unsupported)
   * is currently mounted inside a DOCKED panel's body, or null while pending
   * (`data$` hasn't emitted yet — the "Connecting…" placeholder). Scans the
   * SAME {@link PANEL_RENDERER_TESTIDS} list as
   * `JarvisPanelLayerPage.rendererTestId`, scoped inside the `panel-<id>`
   * section, because a docked leaf renders the very same `JarvisPanelBody`
   * switch — only its chrome differs.
   *
   * This is the only accessor here that witnesses a docked panel's BODY.
   * Every other docked check on this page reads the docked HEAD, so a leaf
   * that rendered head-only — or a restored panel whose `panelData$`
   * subscription was never re-established — would satisfy all of them. */
  dockedRendererTestId(id: string): string | null {
    const panel = this.panel(id);

    for (const testid of PANEL_RENDERER_TESTIDS) {
      if (within(panel).queryByTestId(testid)) {
        return testid;
      }
    }

    return null;
  }

  /** The docked head's unpin-control accessible name (`Unpin <title>`). */
  undockLabel(id: string): string | null {
    return this.dockedControl(id, "jarvis-panel-undock").getAttribute(
      "aria-label",
    );
  }

  /** The docked head's close-control accessible name (`Close <title>`). */
  closeLabel(id: string): string | null {
    return this.dockedControl(id, "jarvis-panel-close").getAttribute(
      "aria-label",
    );
  }

  /** Click a docked desk panel's unpin (📌) control — it leaves the tree and
   * floats again in `JarvisPanelLayer`. */
  async undock(id: string): Promise<void> {
    await this.user.click(this.dockedControl(id, "jarvis-panel-undock"));
  }

  /** Click a docked desk panel's close (✕) control — it leaves the tree AND
   * the panel roster entirely (the docked-safe dismiss). */
  async closeDocked(id: string): Promise<void> {
    await this.user.click(this.dockedControl(id, "jarvis-panel-close"));
  }

  private dockedControl(id: string, testId: string): HTMLElement {
    return within(this.panel(id)).getByTestId(testId);
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

  resizeHandleExists(pathKey: string, i: number): boolean {
    return within(this.root).queryByTestId(`handle-${pathKey}-${i}`) !== null;
  }

  /** True when the cell wrapping this child (identified the same way as
   * `resizeHandleExists`'s pathKey/index pair) has released its ratio-derived
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
  resizeHandleElement(pathKey: string, i: number): HTMLElement {
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
