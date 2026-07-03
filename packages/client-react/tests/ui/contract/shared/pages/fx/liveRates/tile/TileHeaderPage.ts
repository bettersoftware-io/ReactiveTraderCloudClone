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
    return [...this.root.querySelectorAll("span")].map((s) => {
      return s.textContent?.trim() ?? "";
    });
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
