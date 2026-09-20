import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/** The app-head "View" dropdown (Phase 3 close/reopen): one
 * `menuitemcheckbox` row per static panel of the active tab. Rows carry
 * `data-testid="view-menu-row-<panelId>"`; `aria-checked` mirrors
 * visibility and `aria-disabled` the machine's last-visible floor. Pure DOM
 * queries against the mounted root, so the page works standalone
 * (HeaderChrome) and inside the AppShell composite alike.
 *
 * Below those rows sits the LAYOUTS section (Phase 6b saved layouts), keyed on
 * `view-menu-layout-*` testids: the built-in `Default`, one `menuitem` row per
 * stored preset (each with its own two-click bin), and the "Save current as…"
 * opener with its in-menu name field. Under the in-house engine only the head
 * and `Default` render. */
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
    return within(this.root).queryByTestId(`view-menu-row-${panelId}`) !== null;
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

  /** True while the open menu carries the LAYOUTS section (Phase 6b) — both
   * engines render it; only its contents differ. Queried by ROLE AND NAME, not
   * by testid: the section is an accessible group labelled "Layouts", so this
   * reading also pins the grouping each client must provide (a `<fieldset>`
   * here, since the a11y gate rejects `role="group"` on a plain div — an
   * element with the same implicit role satisfies it either way). */
  hasLayoutsSection(): boolean {
    return within(this.root).queryByRole("group", { name: "Layouts" }) !== null;
  }

  /** Every LAYOUTS row label, in DOM order: the built-in `Default`, then each
   * saved preset in stored order, then the "Save current as…" opener. Keyed on
   * `role="menuitem"`, which is exactly the section's rows — the per-panel
   * rows above are `menuitemcheckbox`, and a row's bin / confirm / cancel
   * controls carry no role at all, so neither can leak into this list. */
  layoutRowLabels(): string[] {
    return this.layoutRows().map((row) => {
      return row.textContent?.trim() ?? "";
    });
  }

  /** The preset ids of the saved-layout rows, in the same order
   * `layoutRowLabels` reports them — `Default` and the save opener excluded,
   * since neither is a stored preset. The one way a spec can name a preset it
   * just SAVED: the controller mints the id (`p<base36><seq>`), so no test can
   * know it up front. */
  layoutRowIds(): string[] {
    return this.layoutRows()
      .map((row) => {
        return row.getAttribute("data-testid") ?? "";
      })
      .filter((testid) => {
        return (
          testid.startsWith(LAYOUT_ROW_TESTID_PREFIX) &&
          testid !== "view-menu-layout-default" &&
          testid !== "view-menu-layout-save"
        );
      })
      .map((testid) => {
        return testid.slice(LAYOUT_ROW_TESTID_PREFIX.length);
      });
  }

  /** True when the preset's row refuses to load — an unreadable stored record
   * (`readable: false`), greyed and `aria-disabled`. */
  isLayoutRowDisabled(id: string): boolean {
    return this.layoutRow(id).getAttribute("aria-disabled") === "true";
  }

  /** Clicks the built-in `Default` row — resets the active tab's layout and
   * closes the menu. */
  async loadDefaultLayout(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("view-menu-layout-default"),
    );
  }

  /** Clicks a saved preset's row — loads it and closes the menu. A disabled
   * (unreadable) row swallows the click, exactly as the user finds it. */
  async loadLayout(id: string): Promise<void> {
    await this.user.click(this.layoutRow(id));
  }

  /** Opens the in-menu "Save current as…" name field. */
  async openSaveLayout(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("view-menu-layout-save"),
    );
  }

  /** True while the name field is open — the witness that a save closed the
   * form (or that Cancel / Escape dismissed it). */
  hasLayoutNameField(): boolean {
    return within(this.root).queryByTestId("view-menu-layout-name") !== null;
  }

  /** Replaces the draft name (clears first, so repeated calls in one case are
   * independent). */
  async typeLayoutName(text: string): Promise<void> {
    const field = this.layoutNameField();
    await this.user.clear(field);
    await this.user.type(field, text);
  }

  async confirmSaveLayout(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("view-menu-layout-save-confirm"),
    );
  }

  async cancelSaveLayout(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("view-menu-layout-save-cancel"),
    );
  }

  /** Enter inside the name field — the keyboard form of Save. */
  async saveLayoutWithEnter(): Promise<void> {
    await this.user.type(this.layoutNameField(), "{Enter}");
  }

  /** Escape inside the name field — the keyboard form of Cancel. */
  async cancelLayoutWithEscape(): Promise<void> {
    await this.user.type(this.layoutNameField(), "{Escape}");
  }

  /** Confirms overwriting the same-named preset the save reported (`exists`). */
  async confirmReplaceLayout(): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId("view-menu-layout-replace-confirm"),
    );
  }

  /** Clicks the row's bin — arms the delete, which the second click confirms. */
  async requestDeleteLayout(id: string): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`view-menu-layout-delete-${id}`),
    );
  }

  async confirmDeleteLayout(id: string): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`view-menu-layout-delete-confirm-${id}`),
    );
  }

  async cancelDeleteLayout(id: string): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`view-menu-layout-delete-cancel-${id}`),
    );
  }

  /** The section's status line, or null when the section shows none. */
  layoutMessage(): string | null {
    const message = within(this.root).queryByTestId("view-menu-layout-message");
    return message === null ? null : (message.textContent?.trim() ?? "");
  }

  private layoutNameField(): HTMLElement {
    return within(this.root).getByTestId("view-menu-layout-name");
  }

  private layoutRow(id: string): HTMLElement {
    return within(this.root).getByTestId(`view-menu-layout-${id}`);
  }

  private layoutRows(): HTMLElement[] {
    const section = within(this.root).getByTestId("view-menu-layouts");
    return [...section.querySelectorAll<HTMLElement>('[role="menuitem"]')];
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

/** Shared by `layoutRowIds`: every LAYOUTS row's testid starts with this, and
 * a preset row's remainder IS its stored id. */
const LAYOUT_ROW_TESTID_PREFIX = "view-menu-layout-";
