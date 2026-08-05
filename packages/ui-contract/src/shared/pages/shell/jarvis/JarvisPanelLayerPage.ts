import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/** The `data-testid` of a panel's rendered body — the discriminating marker
 * for whichever viz kind (or the unsupported card) it currently resolves to.
 * Order matters only for {@link JarvisPanelLayerPage.rendererTestId}'s scan;
 * it is not otherwise significant. */
const RENDERER_TESTIDS = [
  "jarvis-panel-line",
  "jarvis-panel-table",
  "jarvis-panel-gauge",
  "jarvis-panel-spark-grid",
  "jarvis-panel-heatmap",
  "jarvis-panel-unsupported",
] as const;

/** The `aria-label` prefix `JarvisPanelLayer.tsx` builds its dismiss button's
 * label from (`` `Dismiss ${panel.title}` ``) — parsed back out by {@link
 * JarvisPanelLayerPage.title} instead of reaching for a CSS-module class
 * name or relying on DOM sibling order. */
const DISMISS_LABEL_PREFIX = "Dismiss ";

/**
 * Page object for the top-right desk-panel cascade (`JarvisPanelLayer`,
 * Task 9). Hook-driven like its `JarvisOrbPage`/`JarvisOverlayPage` siblings:
 * `useJarvisPanels()`/`useJarvisPanelData()` read the REAL
 * `JarvisPanelsPresenter`, fed by the SAME `jarvis.events$` a co-mounted
 * `JarvisOverlayPage` drives via `send()`/`emitEvents()` — panel events ride
 * the identical per-turn `JarvisEvent` stream as everything else `ask()`
 * emits (`world.jarvis.emit([{ type: "panel", panelId, spec }, …])`), so
 * every scenario here mounts a `JarvisOverlay` on the SAME World, opens a
 * turn with `overlay.send(...)`, and pushes `"panel"` events with
 * `overlay.emitEvents([...])` — mirroring `JarvisOrbPage`'s own documented
 * "mount both on one shared World" pattern for anything needing `send()`.
 */
export class JarvisPanelLayerPage extends MountedComponent<
  Record<string, never>
> {
  private readonly user: UserEvent = userEvent.setup();

  private layer(): HTMLElement | null {
    return within(this.root).queryByTestId("jarvis-panel-layer");
  }

  /** True while the layer renders at all — false whenever the panel list is
   * empty (initial state, or the last live panel just got dismissed). Every
   * other accessor below assumes presence; check this first. */
  isPresent(): boolean {
    return this.layer() !== null;
  }

  private panelEls(): HTMLElement[] {
    const layer = this.layer();
    return layer ? within(layer).queryAllByTestId("jarvis-panel") : [];
  }

  /** Every currently-rendered panel's `data-panel-id`, in DOM order (which
   * mirrors the machine's own array order — oldest first). */
  panelIds(): string[] {
    return this.panelEls().map((el) => {
      return el.getAttribute("data-panel-id") ?? "";
    });
  }

  private panel(panelId: string): HTMLElement {
    const el = this.panelEls().find((candidate) => {
      return candidate.getAttribute("data-panel-id") === panelId;
    });

    if (!el) {
      throw new Error(`JarvisPanelLayer: no rendered panel "${panelId}"`);
    }

    return el;
  }

  /** `data-status`: "live" | "unsupported". */
  status(panelId: string): string {
    return this.panel(panelId).getAttribute("data-status") ?? "";
  }

  /** The panel's title, read off its dismiss button's `aria-label` (see
   * {@link DISMISS_LABEL_PREFIX}'s doc) rather than a CSS class or DOM
   * sibling order. */
  title(panelId: string): string {
    const label =
      within(this.panel(panelId))
        .getByTestId("jarvis-panel-dismiss")
        .getAttribute("aria-label") ?? "";
    return label.startsWith(DISMISS_LABEL_PREFIX)
      ? label.slice(DISMISS_LABEL_PREFIX.length)
      : label;
  }

  /** The provenance tooltip (`title` attribute, from the spec's
   * `rationale`), or null when the panel carries none. */
  rationale(panelId: string): string | null {
    return this.panel(panelId).getAttribute("title");
  }

  /** Which renderer testid (line/table/gauge/spark-grid/heatmap/unsupported)
   * is currently mounted inside this panel's body, or null while pending
   * (`data$` hasn't emitted yet — the "Connecting…" placeholder). */
  rendererTestId(panelId: string): string | null {
    const panel = this.panel(panelId);

    for (const testid of RENDERER_TESTIDS) {
      if (within(panel).queryByTestId(testid)) {
        return testid;
      }
    }

    return null;
  }

  /** Whether a SPECIFIC renderer testid is present in this panel's body —
   * an explicit absence check (e.g. "the line renderer is gone post-morph")
   * rather than reading back {@link rendererTestId}'s single "whichever one
   * is mounted" scan. */
  hasRendererTestId(panelId: string, testid: string): boolean {
    return within(this.panel(panelId)).queryByTestId(testid) !== null;
  }

  /** The unsupported card's visible copy, or null when the panel isn't
   * (currently) rendering it. */
  unsupportedCopy(panelId: string): string | null {
    const el = within(this.panel(panelId)).queryByTestId(
      "jarvis-panel-unsupported",
    );
    return el ? el.textContent : null;
  }

  /** Click a panel's dismiss (✕) control. */
  async dismiss(panelId: string): Promise<void> {
    await this.user.click(
      within(this.panel(panelId)).getByTestId("jarvis-panel-dismiss"),
    );
  }
}
