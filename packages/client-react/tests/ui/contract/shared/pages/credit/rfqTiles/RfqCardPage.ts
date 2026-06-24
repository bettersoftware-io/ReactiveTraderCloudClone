import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { Dealer, Instrument, Quote, Rfq } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface RfqCardProps {
  rfq: Rfq;
  quotes: readonly Quote[];
  instrument: Instrument | undefined;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => void;
  onDismiss?: (rfqId: number) => void;
}

export class RfqCardPage extends MountedComponent<RfqCardProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
    return within(this.root);
  }

  /** The instrument title (or fallback) shown at the top of the card. */
  title(): string {
    // outer card → header row → left block → name div (first leaf).
    return (
      this.root
        .querySelector(":scope > div > div > div > div")
        ?.textContent?.trim() ?? ""
    );
  }

  /** The state badge label (Live / Done / Expired / Cancelled). */
  stateBadge(): string {
    const badge = [...this.root.querySelectorAll("span")].find((s) => {
      return /^(Live|Done|Expired|Cancelled)$/.test(
        s.textContent?.trim() ?? "",
      );
    });
    return badge?.textContent?.trim() ?? "";
  }

  /** Whether any text matching the supplied string is present. */
  hasText(text: string | RegExp): boolean {
    return this.q().queryByText(text) !== null;
  }

  /** Number of quote rows (each dealer-named span block). */
  quoteCount(): number {
    return this.q().queryAllByRole("button", { name: /accept/i }).length;
  }

  /** Whether a dismiss (✕) control is present. */
  canDismiss(): boolean {
    return [...this.root.querySelectorAll("button")].some((b) => {
      return (b.textContent ?? "").includes("✕");
    });
  }

  /** Click the dismiss control. */
  async dismiss(): Promise<void> {
    const btn = [...this.root.querySelectorAll("button")].find((b) => {
      return (b.textContent ?? "").includes("✕");
    });
    if (!btn) throw new Error("No dismiss control present");
    await this.user.click(btn);
  }

  /** Click the first Accept button. */
  async acceptFirst(): Promise<void> {
    await this.user.click(
      this.q().getAllByRole("button", { name: /accept/i })[0],
    );
  }

  /** Whether the live countdown widget is present (data-testid="rfq-countdown-fill"). */
  hasCountdown(): boolean {
    return (
      this.root.querySelector('[data-testid="rfq-countdown-fill"]') !== null
    );
  }
}
