import type { PriceMovementType } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TileHeaderProps {
  base: string;
  terms: string;
  symbol: string;
  movement: PriceMovementType;
  /** Pip magnitude of the last tick, or null (no badge) before two ticks. */
  movementPips: number | null;
}

export class TileHeaderPage extends MountedComponent<TileHeaderProps> {
  /** All span texts in order: [base, "/", terms, movement badge]. */
  parts(): string[] {
    // Find the wrapper div that contains the symbol code and pair row
    const header = this.root.querySelector("div");
    if (!header) return [];

    // Find all divs (the structure is: header > [symbolCode div, pairRow div])
    const divs = [...header.querySelectorAll(":scope > div")];
    const pairRowDiv = divs.length > 1 ? divs[1] : divs[0];

    if (!pairRowDiv) return [];

    // Get all spans at this level and one level deep
    const directSpans = [...pairRowDiv.querySelectorAll(":scope > span")];

    // First span should be pairName wrapper, get its child spans
    const pairNameSpan = directSpans[0];
    const pairParts = pairNameSpan
      ? [...pairNameSpan.querySelectorAll("span")].map(
          (s) => {return s.textContent?.trim() ?? ""},
        )
      : [];

    // Look for movement badge among direct spans (second span if present)
    const badge = directSpans.find((s) => {return s.hasAttribute("data-movement")});
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
}
