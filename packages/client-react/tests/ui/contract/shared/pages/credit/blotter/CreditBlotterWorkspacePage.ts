import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { CreditBlotterPage } from "./CreditBlotterPage";

/** Page object for CreditBlotterHead + CreditBlotter mounted together
 * (sharing one CreditViewProvider, as they do under the real panel
 * header/body split) — exercises the head-chrome contract (count / quick
 * filter / CSV chip) that neither component carries on its own. Mirrors
 * FxBlotterWorkspacePage; extends the body page so all its table queries
 * apply to the combined mount. */
export class CreditBlotterWorkspacePage extends CreditBlotterPage {
  private readonly workspaceUser: UserEvent = userEvent.setup();

  /** The head's "{n} trades" count — always the UNFILTERED total, like FX. */
  tradeCountText(): string | null {
    return (
      within(this.root).queryByTestId("blotter-count")?.textContent?.trim() ??
      null
    );
  }

  /** The CSV export chip's visible label (kept at the `export-csv` testid). */
  csvChipLabel(): string {
    return (
      within(this.root).getByTestId("export-csv").textContent?.trim() ?? ""
    );
  }

  async typeQuickFilter(text: string): Promise<void> {
    const input = within(this.root).getByTestId("quick-filter");
    await this.workspaceUser.clear(input);

    if (text) {
      await this.workspaceUser.type(input, text);
    }
  }

  /** Export-CSV trigger, from the head's CSV chip. */
  async clickExport(): Promise<void> {
    await this.workspaceUser.click(within(this.root).getByTestId("export-csv"));
  }
}
