import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "../../../harness/component";

export interface QuickFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export class QuickFilterPage extends MountedComponent<QuickFilterProps> {
  private readonly user: UserEvent = userEvent.setup();

  private input(): HTMLInputElement {
    return within(this.root).getByTestId("quick-filter") as HTMLInputElement;
  }

  /** The current text shown in the input. */
  value(): string {
    return this.input().value;
  }

  placeholder(): string {
    return this.input().placeholder;
  }

  /** Type the given text into the filter (fires onChange per keystroke). */
  async type(text: string): Promise<void> {
    await this.user.type(this.input(), text);
  }
}
