import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { Trade } from "@rtc/domain";

import type {
  ColumnFilter,
  Comparator,
} from "#/ui/fx/blotter/columnFilter/filterState";
import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface NumberFilterProps {
  column: keyof Trade;
  currentFilter: ColumnFilter | undefined;
  onApply: (filter: ColumnFilter | null) => void;
}

export class NumberFilterPage extends MountedComponent<NumberFilterProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  private comparatorSelect(): HTMLSelectElement {
    return this.q().getByRole("combobox") as HTMLSelectElement;
  }

  private valueInput(): HTMLInputElement {
    return this.q().getByPlaceholderText("Value") as HTMLInputElement;
  }

  private toInput(): HTMLInputElement {
    return this.q().getByPlaceholderText("To") as HTMLInputElement;
  }

  comparator(): Comparator {
    return this.comparatorSelect().value as Comparator;
  }

  value(): string {
    return this.valueInput().value;
  }

  hasRangeInput(): boolean {
    return this.q().queryByPlaceholderText("To") !== null;
  }

  async chooseComparator(comparator: Comparator): Promise<void> {
    await this.user.selectOptions(this.comparatorSelect(), comparator);
  }

  async setValue(value: string): Promise<void> {
    await this.user.clear(this.valueInput());

    if (value) {
      await this.user.type(this.valueInput(), value);
    }
  }

  async setRangeTo(value: string): Promise<void> {
    await this.user.clear(this.toInput());

    if (value) {
      await this.user.type(this.toInput(), value);
    }
  }

  async apply(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /apply/i }));
  }

  async reset(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /reset/i }));
  }
}
