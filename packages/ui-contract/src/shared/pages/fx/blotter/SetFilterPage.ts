import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type { Trade } from "@rtc/domain";

import type { ColumnFilter } from "./filterTypes";

export interface SetFilterProps {
  column: keyof Trade;
  trades: readonly Trade[];
  currentFilter: ColumnFilter | undefined;
  onApply: (filter: ColumnFilter | null) => void;
}

export class SetFilterPage extends MountedComponent<SetFilterProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  /** Checkbox labels, in render order. */
  options(): string[] {
    return this.q()
      .getAllByRole("checkbox")
      .map((cb) => {
        return cb.closest("label")?.textContent?.trim() ?? "";
      });
  }

  /** Whether the checkbox with the given label is checked. */
  isChecked(label: string): boolean {
    const cb = this.q().getByRole("checkbox", {
      name: label,
    }) as HTMLInputElement;
    return cb.checked;
  }

  async toggle(label: string): Promise<void> {
    await this.user.click(this.q().getByRole("checkbox", { name: label }));
  }

  async apply(): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: /apply/i }));
  }
}
