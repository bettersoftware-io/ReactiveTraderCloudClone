import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { type Direction, type CreateRfqInput } from "@rtc/domain";
import { MountedComponent } from "../../../harness/component";

export interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
}

export class NewRfqFormPage extends MountedComponent<NewRfqFormProps> {
  private readonly user: UserEvent = userEvent.setup();

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
