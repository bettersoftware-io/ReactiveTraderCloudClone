import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "../../../harness/component";

export class RfqTilesPanelPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  private q() {
    return within(this.root);
  }

  /** Number of RFQ cards currently rendered (each has a state badge). */
  cardCount(): number {
    return [...this.root.querySelectorAll("span")].filter((s) =>
      /^(Live|Done|Expired|Cancelled)$/.test(s.textContent?.trim() ?? ""),
    ).length;
  }

  /** The empty-state message, or null when cards are present. */
  emptyMessage(): string | null {
    const el = this.q().queryByText(/no rfqs to display/i);
    return el?.textContent?.trim() ?? null;
  }

  /** Whether any text matching the supplied value is present. */
  hasText(text: string | RegExp): boolean {
    return this.q().queryByText(text) !== null;
  }

  /** Click one of the filter tabs by label. */
  async selectFilter(label: string): Promise<void> {
    await this.user.click(this.q().getByRole("button", { name: label }));
  }

  /** Dismiss the first card via its ✕ control. */
  async dismissFirst(): Promise<void> {
    const btn = [...this.root.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("\\u2715"),
    );
    if (!btn) throw new Error("No dismissable card present");
    await this.user.click(btn);
  }

  /** Accept the first acceptable quote. */
  async acceptFirstQuote(): Promise<void> {
    await this.user.click(this.q().getAllByRole("button", { name: /accept/i })[0]);
  }

  /** Quote ids recorded by the faked accept-quote command. */
  acceptedQuoteIds(): readonly number[] {
    return this.commandLog().acceptQuote;
  }
}
