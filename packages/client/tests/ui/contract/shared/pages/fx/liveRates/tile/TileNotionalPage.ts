import { within, fireEvent } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "../../../../harness/component";

/** Shape of the notional hook result the component consumes. */
export interface NotionalLike {
  state: {
    displayValue: string;
    numericValue: number;
    error: string | null;
    isRfq: boolean;
    isDefault: boolean;
  };
  change: (input: string) => void;
  reset: () => void;
}

export interface TileNotionalProps {
  notional: NotionalLike;
  baseCurrency: string;
  disabled?: boolean;
}

export class TileNotionalPage extends MountedComponent<TileNotionalProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q() {
    return within(this.root);
  }

  input(): HTMLInputElement {
    return this.root.querySelector("input") as HTMLInputElement;
  }

  /** The base-currency label (first span). */
  currencyLabel(): string {
    return this.root.querySelector("span")?.textContent?.trim() ?? "";
  }

  value(): string {
    return this.input().value;
  }

  isDisabled(): boolean {
    return this.input().disabled;
  }

  /** The inline error message, if rendered. */
  errorText(): string | null {
    // Error is the last span; only present when notional.error is set.
    const spans = [...this.root.querySelectorAll("span")];
    const last = spans[spans.length - 1];
    return last && last !== this.root.querySelector("span")
      ? last.textContent?.trim() ?? null
      : null;
  }

  hasResetButton(): boolean {
    return this.q().queryByTitle(/reset to default/i) !== null;
  }

  /** Type a character into the input (fires onChange with the new value). */
  async typeIntoInput(text: string): Promise<void> {
    await this.user.type(this.input(), text);
  }

  /** Fire a direct change event with an explicit value. */
  changeInput(value: string): void {
    this.setProps({});
    fireEvent.change(this.input(), { target: { value } });
  }

  async clickReset(): Promise<void> {
    await this.user.click(this.q().getByTitle(/reset to default/i));
  }

  /** Press Enter in the input (blurs the field). */
  pressEnter(): void {
    fireEvent.keyDown(this.input(), { key: "Enter" });
  }

  /** Press a non-Enter key (no blur). */
  pressOtherKey(): void {
    fireEvent.keyDown(this.input(), { key: "a" });
  }

  isInputFocused(): boolean {
    return document.activeElement === this.input();
  }

  focusInput(): void {
    // Use the real DOM focus so document.activeElement updates and React's
    // onFocus (which calls input.select()) fires.
    this.input().focus();
  }

  /** Border colour of the input's bottom edge (red when in error). */
  borderBottomColor(): string {
    return this.input().style.borderBottom;
  }
}
