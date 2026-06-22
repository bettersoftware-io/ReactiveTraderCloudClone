import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { CurrencyCategory } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface CurrencyFilterProps {
  selected: CurrencyCategory;
  onChange: (category: CurrencyCategory) => void;
}

export class CurrencyFilterPage extends MountedComponent<CurrencyFilterProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q() {
    return within(this.root);
  }

  /** The text label on every category button, in render order. */
  categories(): string[] {
    return [
      ...this.root.querySelectorAll<HTMLButtonElement>(
        "[data-testid^='filter-']",
      ),
    ].map((b) => {
      return b.textContent?.trim() ?? "";
    });
  }

  /** The category whose button is rendered as selected (data-active="true"). */
  selectedCategory(): string | null {
    const buttons = [
      ...this.root.querySelectorAll<HTMLButtonElement>(
        "[data-testid^='filter-']",
      ),
    ];
    const active = buttons.find((b) => {
      return b.dataset.active === "true";
    });
    return active?.textContent?.trim() ?? null;
  }

  /** Click the named category button. */
  async choose(category: CurrencyCategory): Promise<void> {
    await this.user.click(this.q().getByTestId(`filter-${category}`));
  }
}
