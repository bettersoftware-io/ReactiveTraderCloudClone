import { within, fireEvent } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { Trade } from "@rtc/domain";
import type {
  ColumnFilter,
  Comparator,
} from "../../../../../../../src/ui/fx/blotter/columnFilter/filterState";
import { MountedComponent } from "../../../harness/component";

export interface DateFilterProps {
  column: keyof Trade;
  currentFilter: ColumnFilter | undefined;
  onApply: (filter: ColumnFilter | null) => void;
}

export class DateFilterPage extends MountedComponent<DateFilterProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q() {
    return within(this.root);
  }

  private comparatorSelect(): HTMLSelectElement {
    return this.q().getByRole("combobox") as HTMLSelectElement;
  }

  private dateInputs(): HTMLInputElement[] {
    return [...this.root.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
  }

  comparator(): Comparator {
    return this.comparatorSelect().value as Comparator;
  }

  value(): string {
    return this.dateInputs()[0]?.value ?? "";
  }

  /** Number of date inputs shown (2 when the in-range "to" input is visible). */
  dateInputCount(): number {
    return this.dateInputs().length;
  }

  async chooseComparator(comparator: Comparator): Promise<void> {
    await this.user.selectOptions(this.comparatorSelect(), comparator);
  }

  setValue(isoDate: string): void {
    // Native date inputs are unreliable with userEvent.type in jsdom; set the
    // value directly and fire the change event React listens for.
    fireEvent.change(this.dateInputs()[0], { target: { value: isoDate } });
  }

  setRangeTo(isoDate: string): void {
    fireEvent.change(this.dateInputs()[1], { target: { value: isoDate } });
  }

  async apply(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /apply/i }));
  }

  async reset(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /reset/i }));
  }
}
