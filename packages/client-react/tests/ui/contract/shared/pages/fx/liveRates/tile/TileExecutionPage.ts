import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { Direction } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TileExecutionProps {
  onExecute: (direction: Direction) => void;
  disabled: boolean;
}

export class TileExecutionPage extends MountedComponent<TileExecutionProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  private sell(): HTMLButtonElement {
    return this.q().getByTestId("sell-btn") as HTMLButtonElement;
  }

  private buy(): HTMLButtonElement {
    return this.q().getByTestId("buy-btn") as HTMLButtonElement;
  }

  sellLabel(): string {
    return this.sell().textContent?.trim() ?? "";
  }

  buyLabel(): string {
    return this.buy().textContent?.trim() ?? "";
  }

  isSellDisabled(): boolean {
    return this.sell().disabled;
  }

  isBuyDisabled(): boolean {
    return this.buy().disabled;
  }

  async clickSell(): Promise<void> {
    await this.user.click(this.sell());
  }

  async clickBuy(): Promise<void> {
    await this.user.click(this.buy());
  }
}
