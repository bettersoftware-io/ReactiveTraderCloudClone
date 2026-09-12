import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/** The app-head "View" dropdown (Phase 3 close/reopen): one
 * `menuitemcheckbox` row per static panel of the active tab. Rows carry
 * `data-testid="view-menu-row-<panelId>"`; `aria-checked` mirrors
 * visibility and `aria-disabled` the machine's last-visible floor. Pure DOM
 * queries against the mounted root, so the page works standalone
 * (HeaderChrome) and inside the AppShell composite alike. */
export class ViewMenuPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** Opens (or closes) the dropdown via the header toggle. */
  async toggle(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("view-menu-toggle"));
  }

  /** True while the dropdown is rendered. */
  isOpen(): boolean {
    return within(this.root).queryByTestId("view-menu-panel") !== null;
  }

  /** The visible row labels (panel titles, check glyph excluded), in seed
   * order. The title is the row's LAST span — the first is the aria-hidden
   * check column. */
  rowLabels(): string[] {
    return this.rows().map((row) => {
      const spans = row.querySelectorAll("span");
      return spans[spans.length - 1]?.textContent?.trim() ?? "";
    });
  }

  /** True when the panel has a row in the open menu. */
  rowExists(panelId: string): boolean {
    return (
      within(this.root).queryByTestId(`view-menu-row-${panelId}`) !== null
    );
  }

  /** The row's checkbox state — true = panel visible. */
  isChecked(panelId: string): boolean {
    return this.row(panelId).getAttribute("aria-checked") === "true";
  }

  /** True when the row is the last visible panel and refuses to close. */
  isRowDisabled(panelId: string): boolean {
    return this.row(panelId).getAttribute("aria-disabled") === "true";
  }

  /** Clicks the row — closes a visible panel, reopens a closed one. */
  async toggleRow(panelId: string): Promise<void> {
    await this.user.click(this.row(panelId));
  }

  private row(panelId: string): HTMLElement {
    return within(this.root).getByTestId(`view-menu-row-${panelId}`);
  }

  private rows(): HTMLElement[] {
    const panel = within(this.root).getByTestId("view-menu-panel");
    return [
      ...panel.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'),
    ];
  }
}
