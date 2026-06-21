import type { Price } from "@rtc/domain";
import { MountedComponent } from "../../../../harness/component";

export interface TilePriceProps {
  price: Price;
  ratePrecision: number;
  pipsPosition: number;
}

export class TilePricePage extends MountedComponent<TilePriceProps> {
  private buttons(): HTMLButtonElement[] {
    return [...this.root.querySelectorAll("button")];
  }

  /** The two price-side labels in order: ["SELL", "BUY"]. */
  labels(): string[] {
    return this.buttons().map((b) =>
      (b.querySelector("span")?.textContent ?? "").trim(),
    );
  }

  /** The concatenated digit text rendered on one side (prefix+pips+fractional). */
  digits(side: "SELL" | "BUY"): string {
    const btn = this.buttons().find((b) =>
      (b.querySelector("span")?.textContent ?? "").trim() === side,
    );
    if (!btn) throw new Error(`No ${side} button`);
    // The numeric value lives in the second top-level <span> (after the label).
    const valueSpan = btn.querySelectorAll(":scope > span")[1];
    return (valueSpan?.textContent ?? "").trim();
  }

  /** The colour of the big "pips" segment on one side (movement-driven). */
  pipsColor(side: "SELL" | "BUY"): string {
    const btn = this.buttons().find((b) =>
      (b.querySelector("span")?.textContent ?? "").trim() === side,
    );
    if (!btn) throw new Error(`No ${side} button`);
    const pips = btn.querySelector<HTMLSpanElement>('[data-testid="tile-pips"]');
    const movement = pips?.dataset.movement;
    if (movement === "up") return "var(--accent-positive)";
    if (movement === "down") return "var(--accent-negative)";
    return "var(--text-primary)";
  }
}
