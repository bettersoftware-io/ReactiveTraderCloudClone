import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { PriceMovementType } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TileHeaderProps {
  base: string;
  terms: string;
  symbol: string;
  movement: PriceMovementType;
  /** Pip magnitude of the last tick, or null (no badge) before two ticks. */
  movementPips: number | null;
  /** When set, the compact ⚡ RFQ chip renders on the pair row's right side. */
  onInitiateRfq?: () => void;
}

export class TileHeaderPage extends MountedComponent<TileHeaderProps> {
  private readonly user: UserEvent = userEvent.setup();

  /** All span texts in order: [base, "/", terms, movement badge]. */
  parts(): string[] {
    // The pair name is wrapped in a span; skip that wrapper and get its 3 children (base, /, terms)
    const spans = [...this.root.querySelectorAll("span")];
    const pairParts = spans.slice(1, 4).map((s) => {
      return s.textContent?.trim() ?? "";
    });

    // Look for movement badge by attribute
    const badge = spans.find((s) => {
      return s.hasAttribute("data-movement");
    });
    const badgeParts = badge ? [badge.textContent?.trim() ?? ""] : [];

    return [...pairParts, ...badgeParts];
  }

  /** The pair-name text only (e.g. "EUR/USD"), excluding the movement badge. */
  text(): string {
    return this.parts().slice(0, 3).join("");
  }

  /** True when the movement badge is rendered at all. */
  hasMovementBadge(): boolean {
    return this.root.querySelector("[data-movement]") !== null;
  }

  /** The movement badge's text (e.g. "▲ 5 pip"), or "" when hidden. */
  movementText(): string {
    return this.parts()[3] ?? "";
  }

  /** The `data-movement` value driving the movement badge's colour. */
  movementKey(): string | undefined {
    return this.root.querySelector<HTMLElement>("[data-movement]")?.dataset
      .movement;
  }

  /**
   * The tiny top-right symbol code text (e.g. "EURUSD") — the outer header
   * element's first child div (a sibling of the pair-name/movement row).
   */
  symbolCode(): string {
    const header = this.root.firstElementChild;
    const first = header?.firstElementChild;
    return first?.textContent?.trim() ?? "";
  }

  // --- compact ⚡ RFQ chip (the RFQ init-state affordance) ------------------

  private rfqChip(): HTMLElement | null {
    return within(this.root).queryByTestId("rfq-initiate");
  }

  /** True when the ⚡ RFQ chip is rendered (onInitiateRfq provided). */
  hasRfqChip(): boolean {
    return this.rfqChip() !== null;
  }

  /** The chip's visible glyph+label text. */
  rfqChipText(): string {
    return this.rfqChip()?.textContent?.trim() ?? "";
  }

  /** The chip's native-tooltip title (the house tooltip pattern). */
  rfqChipTitle(): string | null {
    return this.rfqChip()?.getAttribute("title") ?? null;
  }

  /** The chip's accessible name (aria-label). */
  rfqChipAriaLabel(): string | null {
    return this.rfqChip()?.getAttribute("aria-label") ?? null;
  }

  async clickRfqChip(): Promise<void> {
    await this.user.click(
      within(this.root).getByRole("button", { name: /initiate rfq/i }),
    );
  }
}
