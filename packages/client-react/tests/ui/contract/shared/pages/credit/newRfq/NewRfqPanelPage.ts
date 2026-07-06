import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { CreateRfqInput, Direction } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface NewRfqPanelProps {
  onCreated: (rfqId: number) => void;
}

export class NewRfqPanelPage extends MountedComponent<NewRfqPanelProps> {
  private readonly user: UserEvent = userEvent.setup();

  /** Click the "You Buy"/"You Sell" segmented direction button. */
  async chooseDirection(dir: Direction): Promise<void> {
    await this.user.click(this.byTestId(`new-rfq-dir-${dir.toLowerCase()}`));
  }

  /** Whether the given direction button is currently the active one. */
  isDirectionActive(dir: Direction): boolean {
    return (
      this.byTestId(`new-rfq-dir-${dir.toLowerCase()}`).dataset.active ===
      "true"
    );
  }

  /** Open/close the instrument dropdown via its label button. */
  async toggleInstrumentDropdown(): Promise<void> {
    await this.user.click(this.byTestId("new-rfq-instrument-toggle"));
  }

  /** Whether the instrument dropdown is currently expanded. */
  isInstrumentDropdownOpen(): boolean {
    return this.byTestId("new-rfq-instrument-toggle").dataset.open === "true";
  }

  /** Open the dropdown (if needed) and select an instrument row by id. */
  async chooseInstrument(instrumentId: number): Promise<void> {
    if (!this.isInstrumentDropdownOpen()) {
      await this.toggleInstrumentDropdown();
    }

    await this.user.click(
      this.byTestId(`new-rfq-instrument-option-${instrumentId}`),
    );
  }

  /** The ticker shown on the instrument dropdown's label button, or the placeholder. */
  instrumentLabel(): string {
    return this.byTestId("new-rfq-instrument-toggle").textContent?.trim() ?? "";
  }

  async setQuantity(value: number | string): Promise<void> {
    const input = this.byTestId("new-rfq-qty-input") as HTMLInputElement;
    await this.user.clear(input);
    await this.user.type(input, String(value));
  }

  /** The static "N Min" duration caption. */
  durationLabel(): string {
    return within(this.root).getByText(/min$/i).textContent?.trim() ?? "";
  }

  async toggleAllDealers(): Promise<void> {
    await this.user.click(this.byTestId("new-rfq-dealer-all"));
  }

  async toggleDealer(dealerId: number): Promise<void> {
    await this.user.click(this.byTestId(`new-rfq-dealer-${dealerId}`));
  }

  isDealerChecked(dealerId: number): boolean {
    return (
      this.byTestId(`new-rfq-dealer-${dealerId}`).dataset.checked === "true"
    );
  }

  isAllDealersChecked(): boolean {
    return this.byTestId("new-rfq-dealer-all").dataset.checked === "true";
  }

  /** Whether the given dealer row is flagged as the house dealer (Adaptive Bank). */
  isHouseDealer(dealerId: number): boolean {
    return this.byTestId(`new-rfq-dealer-${dealerId}`).dataset.house === "true";
  }

  /** True once SEND RFQ is enabled by validation (instrument + qty>0 + ≥1 dealer). */
  isSendEnabled(): boolean {
    return this.byTestId("new-rfq-send").dataset.enabled === "true";
  }

  isSendDisabled(): boolean {
    return (this.byTestId("new-rfq-send") as HTMLButtonElement).disabled;
  }

  async send(): Promise<void> {
    await this.user.click(this.byTestId("new-rfq-send"));
  }

  async clear(): Promise<void> {
    await this.user.click(this.byTestId("new-rfq-clear"));
  }

  /** True once the machine has reached its "confirmed" state (brief inline confirmation). */
  isConfirmed(): boolean {
    return (
      this.root.querySelector('[data-testid="new-rfq-confirmed"]') !== null
    );
  }

  /** The RFQ input recorded by the faked useRfqSubmission().submit() call, or null. */
  submittedRfq(): CreateRfqInput | null {
    return this.commandLog().createRfq[0] ?? null;
  }

  private byTestId(testId: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(
      `[data-testid="${testId}"]`,
    );
    if (!el) throw new Error(`No element for data-testid="${testId}"`);
    return el;
  }
}
