import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";
import type { JarvisOwnKeyCall } from "@ui-contract/harness/world";

import type { JarvisProvider } from "@rtc/domain";

/** What a browser may do with the key field, read off its attributes. */
export interface KeyFieldAttributes {
  readonly type: string | null;
  readonly autocomplete: string | null;
  readonly maxLength: string | null;
}

/**
 * Page object for the Preferences "Your key" section (`OwnKeySection`):
 * the explanation, the form while no key is saved, and the masked readout
 * once one is. It reads what the section renders and drives its controls;
 * what the section asks the key presenter to do is read back through
 * `calls()`, in order.
 */
export class OwnKeySectionPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  private section(): HTMLElement {
    return within(this.root).getByTestId("jarvis-key-section");
  }

  private control(testid: string): HTMLElement {
    return within(this.section()).getByTestId(testid);
  }

  /** True while the section is rendered at all. */
  isPresent(): boolean {
    return within(this.root).queryByTestId("jarvis-key-section") !== null;
  }

  /** The section's visible text. */
  text(): string {
    return this.section().textContent ?? "";
  }

  /** True when `copy` is rendered in the section and comes earlier in the
   * document than the key field. */
  explanationPrecedesField(copy: string): boolean {
    const explanation = within(this.section()).getByText(copy);
    const field = this.control("jarvis-key-input");
    return Boolean(
      explanation.compareDocumentPosition(field) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }

  /** True while the empty form (the key field) is rendered. */
  showsForm(): boolean {
    return within(this.section()).queryByTestId("jarvis-key-input") !== null;
  }

  /** True while the masked readout is rendered. */
  showsMasked(): boolean {
    return within(this.section()).queryByTestId("jarvis-key-masked") !== null;
  }

  /** The masked key as shown, or `null` when no key is saved. */
  masked(): string | null {
    return (
      within(this.section()).queryByTestId("jarvis-key-masked")?.textContent ??
      null
    );
  }

  /** The status line as shown, or `null` when none is rendered. */
  status(): string | null {
    return (
      within(this.section()).queryByTestId("jarvis-key-status")?.textContent ??
      null
    );
  }

  /** The saved key's daily limit as shown, or `null` when none is rendered. */
  limitText(): string | null {
    return (
      within(this.section()).queryByTestId("jarvis-key-limit")?.textContent ??
      null
    );
  }

  /** The key field's attributes, for what a browser may do with it. */
  keyFieldAttributes(): KeyFieldAttributes {
    const field = this.control("jarvis-key-input");
    return {
      type: field.getAttribute("type"),
      autocomplete: field.getAttribute("autocomplete"),
      maxLength: field.getAttribute("maxlength"),
    };
  }

  /** The providers the form offers, in order. */
  providers(): string[] {
    return within(this.control("jarvis-key-provider"))
      .getAllByRole("option")
      .map((option) => {
        return option.getAttribute("value") ?? "";
      });
  }

  async chooseProvider(provider: JarvisProvider): Promise<void> {
    await this.user.selectOptions(
      this.control("jarvis-key-provider"),
      provider,
    );
  }

  /** Types into the key field. A paste is a single event, so a long key or one
   * with surrounding whitespace goes in as it would from the clipboard. */
  async typeKey(key: string): Promise<void> {
    await this.user.click(this.control("jarvis-key-input"));
    await this.user.paste(key);
  }

  keyFieldValue(): string {
    return (this.control("jarvis-key-input") as HTMLInputElement).value;
  }

  async toggleRemember(): Promise<void> {
    await this.user.click(this.control("jarvis-key-remember"));
  }

  rememberChecked(): boolean {
    return (this.control("jarvis-key-remember") as HTMLInputElement).checked;
  }

  /** Replaces the daily limit's text. */
  async typeCap(text: string): Promise<void> {
    const field = this.control("jarvis-key-cap");
    await this.user.clear(field);
    await this.user.type(field, text);
  }

  capValue(): string {
    return (this.control("jarvis-key-cap") as HTMLInputElement).value;
  }

  capDisabled(): boolean {
    return (this.control("jarvis-key-cap") as HTMLInputElement).disabled;
  }

  async toggleNoLimit(): Promise<void> {
    await this.user.click(this.control("jarvis-key-no-limit"));
  }

  noLimitChecked(): boolean {
    return (this.control("jarvis-key-no-limit") as HTMLInputElement).checked;
  }

  saveDisabled(): boolean {
    return (this.control("jarvis-key-save") as HTMLButtonElement).disabled;
  }

  async save(): Promise<void> {
    await this.user.click(this.control("jarvis-key-save"));
  }

  async replace(): Promise<void> {
    await this.user.click(this.control("jarvis-key-replace"));
  }

  async remove(): Promise<void> {
    await this.user.click(this.control("jarvis-key-remove"));
  }

  /** Every call the section made on the key presenter, in order. */
  calls(): JarvisOwnKeyCall[] {
    return this.commandLog().jarvisOwnKeyCalls;
  }

  /** True when `secret` is anywhere in the page: markup (every attribute, so
   * any `data-*`) or the value of a field. */
  pageHolds(secret: string): boolean {
    if (document.documentElement.outerHTML.includes(secret)) {
      return true;
    }

    return [...document.querySelectorAll("input, textarea, select")].some(
      (field) => {
        return (field as HTMLInputElement).value.includes(secret);
      },
    );
  }
}
