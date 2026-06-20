import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { type Direction, type CreateRfqInput } from "@rtc/domain";
import { MountedComponent } from "../../../harness/component";

export interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
}

export class NewRfqFormPage extends MountedComponent<NewRfqFormProps> {
  private user: UserEvent = userEvent.setup();

  /**
   * Re-configure the page's userEvent instance to advance fake timers between
   * interactions. Call this from a spec that has installed `vi.useFakeTimers()`
   * BEFORE driving any interaction, passing `vi.advanceTimersByTime`. Without
   * this, userEvent's internal delays wait on real timers and never resolve
   * once fake timers are installed.
   */
  useFakeTimerAdvance(advanceTimers: (ms: number) => void): void {
    this.user = userEvent.setup({ advanceTimers });
  }

  private q() {
    return within(this.root);
  }

  /** Type into the instrument search and pick the named result. */
  async chooseInstrument(name: string): Promise<void> {
    // Actual placeholder: "Search by ticker, name, or CUSIP..." — regex partial matches it
    const search = this.q().getByPlaceholderText(/search by ticker/i);
    await this.user.type(search, name);
    const option = await this.q().findByText(name);
    await this.user.click(option);
  }

  async setQuantity(value: number): Promise<void> {
    // Actual placeholder: "Enter quantity..." — regex partial matches it
    const input = this.q().getByPlaceholderText(/enter quantity/i);
    await this.user.clear(input);
    await this.user.type(input, String(value));
  }

  /** True once an instrument is selected (the search collapses to a summary). */
  hasSelectedInstrument(): boolean {
    return this.q().queryByRole("button", { name: /change/i }) !== null;
  }

  /** Click the "Change" button to clear the selected instrument. */
  async clearInstrument(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /change/i }));
  }

  /** The labels of all dealer checkboxes, in order. */
  dealerNames(): string[] {
    return this.q()
      .getAllByRole("checkbox")
      .map((c) => c.closest("label")?.textContent?.trim() ?? "");
  }

  /** Whether the dealer with the given name is currently checked. */
  isDealerSelected(name: string): boolean {
    return (this.q().getByRole("checkbox", { name }) as HTMLInputElement).checked;
  }

  /** Toggle the dealer checkbox with the given name. */
  async toggleDealer(name: string): Promise<void> {
    await this.user.click(this.q().getByRole("checkbox", { name }));
  }

  async setDirection(direction: Direction): Promise<void> {
    // Direction buttons render {dir} which equals Direction.Buy = "Buy", Direction.Sell = "Sell"
    await this.user.click(this.q().getByRole("button", { name: direction }));
  }

  async submit(): Promise<void> {
    // Submit button text: "Submit RFQ" — matches /submit rfq/i
    await this.user.click(this.q().getByRole("button", { name: /submit rfq/i }));
  }

  isSubmitDisabled(): boolean {
    const btn = this.q().getByRole("button", {
      name: /submit rfq/i,
    }) as HTMLButtonElement;
    return btn.disabled;
  }

  /** True while a submission is in flight — the submit button reads "Submitting…". */
  isSubmitting(): boolean {
    return this.q().queryByRole("button", { name: /submitting/i }) !== null;
  }

  /** Whether the in-flight ("Submitting…") submit button is disabled. */
  isSubmittingDisabled(): boolean {
    const btn = this.q().getByRole("button", {
      name: /submitting/i,
    }) as HTMLButtonElement;
    return btn.disabled;
  }

  hasQuantityError(): boolean {
    // Error text: "Max quantity exceeded" — matches /max quantity exceeded/i
    return this.q().queryByText(/max quantity exceeded/i) !== null;
  }

  /** The RFQ input recorded by the faked create-RFQ command, or null. */
  createdRfq(): CreateRfqInput | null {
    return this.commandLog().createRfq[0] ?? null;
  }

  /**
   * Resolves once the post-submit confirmation is shown.
   * The component renders <div>RFQ Created</div> after firstValueFrom(createRfq(...)) resolves.
   */
  async shouldShowConfirmation(): Promise<void> {
    await this.q().findByText(/rfq created/i);
  }
}
