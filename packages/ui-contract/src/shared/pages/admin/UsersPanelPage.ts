import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";
import type { AccountActionCall } from "@ui-contract/harness/world";

/** The buttons a row can show, by the testid stem each one wears. */
export type UserRowButton =
  | "approve"
  | "block"
  | "unblock"
  | "rename"
  | "delete"
  | "confirm-delete"
  | "cancel"
  | "save"
  | "dismiss";

/** Page object for UsersPanel — the Admin tab's account list, one row per
 * account. A row is addressed by its account id. */
export class UsersPanelPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** True when the panel element is present. */
  isPresent(): boolean {
    return within(this.root).queryByTestId("users-panel") !== null;
  }

  /** The panel's `data-status`: loading, ready, failed or forbidden. */
  status(): string | null {
    return (
      within(this.root)
        .queryByTestId("users-panel")
        ?.getAttribute("data-status") ?? null
    );
  }

  /** The account ids of the rows shown, in display order. */
  rowIds(): string[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>("[data-testid^='user-row-']"),
    ).map((row) => {
      return (row.dataset.testid ?? "").replace(/^user-row-/, "");
    });
  }

  /** True when the row for `id` is shown. */
  hasRow(id: string): boolean {
    return within(this.root).queryByTestId(`user-row-${id}`) !== null;
  }

  /** The row's whole text, for copy a row shows without its own testid. */
  rowText(id: string): string {
    return this.row(id).textContent ?? "";
  }

  /** The row's `data-status` (the account's status). */
  rowStatus(id: string): string | null {
    return this.row(id).getAttribute("data-status");
  }

  /** True when the row is flagged as the administrator's own. */
  isSelf(id: string): boolean {
    return this.row(id).getAttribute("data-self") === "true";
  }

  /** True when the row wears the "You" marker. */
  showsYou(id: string, youLabel: string): boolean {
    return within(this.row(id)).queryByText(youLabel) !== null;
  }

  /** The testids of every button in the row, in document order. */
  buttonIds(id: string): string[] {
    return Array.from(this.row(id).querySelectorAll("button")).map((button) => {
      return button.dataset.testid ?? "";
    });
  }

  /** True when the row shows that button. */
  hasButton(id: string, button: UserRowButton): boolean {
    return within(this.root).queryByTestId(`user-${button}-${id}`) !== null;
  }

  /** The button's visible label. */
  buttonLabel(id: string, button: UserRowButton): string {
    return (
      within(this.root)
        .getByTestId(`user-${button}-${id}`)
        .textContent?.trim() ?? ""
    );
  }

  /** True when the row holds a button whose accessible name is exactly
   * `name` (what a screen reader announces, not the visible label). */
  hasButtonNamed(id: string, name: string): boolean {
    return within(this.row(id)).queryByRole("button", { name }) !== null;
  }

  /** The email cell's hover title (the full address), or null. */
  emailTitle(id: string): string | null {
    return within(this.root)
      .getByTestId(`user-email-${id}`)
      .getAttribute("title");
  }

  /** True when the button is disabled. */
  isButtonDisabled(id: string, button: UserRowButton): boolean {
    return within(this.root)
      .getByTestId(`user-${button}-${id}`)
      .hasAttribute("disabled");
  }

  /** True when the row shows at least one button and every one is disabled
   * (the row's request is in flight). */
  areRowButtonsDisabled(id: string): boolean {
    const buttons = Array.from(this.row(id).querySelectorAll("button"));

    return (
      buttons.length > 0 &&
      buttons.every((button) => {
        return button.hasAttribute("disabled");
      })
    );
  }

  /** Click one of the row's buttons. */
  async click(id: string, button: UserRowButton): Promise<void> {
    await this.user.click(
      within(this.root).getByTestId(`user-${button}-${id}`),
    );
  }

  /** True when the rename field is shown. */
  hasNameInput(id: string): boolean {
    return within(this.root).queryByTestId(`user-name-input-${id}`) !== null;
  }

  /** The rename field's text. */
  nameDraft(id: string): string {
    const input = within(this.root).getByTestId<HTMLInputElement>(
      `user-name-input-${id}`,
    );

    return input.value;
  }

  /** Replaces the rename field's text, one edit per keystroke. */
  async typeName(id: string, text: string): Promise<void> {
    const input = within(this.root).getByTestId(`user-name-input-${id}`);

    await this.user.clear(input);

    if (text !== "") {
      await this.user.type(input, text);
    }
  }

  /** Presses Enter or Escape in the rename field. */
  async pressNameKey(id: string, key: "Enter" | "Escape"): Promise<void> {
    await this.user.type(
      within(this.root).getByTestId(`user-name-input-${id}`),
      `{${key}}`,
    );
  }

  /** True when the rename field holds the focus. */
  isNameInputFocused(id: string): boolean {
    return (
      within(this.root).getByTestId(`user-name-input-${id}`) ===
      this.root.ownerDocument.activeElement
    );
  }

  /** The rename field's error text, or null when none is shown. */
  nameError(id: string): string | null {
    return (
      within(this.root)
        .queryByTestId(`user-name-error-${id}`)
        ?.textContent?.trim() ?? null
    );
  }

  /** The failure message the row shows, or null when none. */
  errorText(id: string): string | null {
    return (
      within(this.root)
        .queryByTestId(`user-error-${id}`)
        ?.textContent?.trim() ?? null
    );
  }

  /** The list-failure line shown over the rows kept, or null when none. */
  failedText(): string | null {
    return (
      within(this.root).queryByTestId("users-failed")?.textContent?.trim() ??
      null
    );
  }

  /** True when the empty-list state is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByTestId("users-empty") !== null;
  }

  /** The empty-list copy, or null. */
  emptyText(): string | null {
    return (
      within(this.root).queryByTestId("users-empty")?.textContent?.trim() ??
      null
    );
  }

  /** True when the forbidden state is shown. */
  isForbidden(): boolean {
    return within(this.root).queryByTestId("users-forbidden") !== null;
  }

  /** The forbidden copy, or null. */
  forbiddenText(): string | null {
    return (
      within(this.root).queryByTestId("users-forbidden")?.textContent?.trim() ??
      null
    );
  }

  /** Every row-action intent the UI fired, in order. */
  actionCalls(): readonly AccountActionCall[] {
    return this.commandLog().accountActions;
  }

  private row(id: string): HTMLElement {
    return within(this.root).getByTestId(`user-row-${id}`);
  }
}
