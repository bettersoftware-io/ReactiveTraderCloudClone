import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { CandleTimeframe } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Props the TimeframePills component reads (current selection + a setter). */
export interface TimeframePillsProps {
  tf: CandleTimeframe;
  onSet: (tf: CandleTimeframe) => void;
}

/** Page object for the 1D/1W/1M/3M timeframe selector — pure props leaf. */
export class TimeframePillsPage extends MountedComponent<TimeframePillsProps> {
  private readonly user: UserEvent = userEvent.setup();

  pills(): string[] {
    return within(this.root)
      .queryAllByRole("button")
      .map((el) => {
        return el.getAttribute("data-tf") ?? "";
      });
  }

  activeTf(): string | null {
    const active = within(this.root)
      .queryAllByRole("button")
      .find((el) => {
        return el.getAttribute("data-active") === "true";
      });
    return active?.getAttribute("data-tf") ?? null;
  }

  async select(tf: CandleTimeframe): Promise<void> {
    await this.user.click(within(this.root).getByRole("button", { name: tf }));
  }
}
