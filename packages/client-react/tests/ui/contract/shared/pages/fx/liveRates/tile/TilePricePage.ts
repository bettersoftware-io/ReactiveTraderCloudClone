import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { Direction, Price } from "@rtc/domain";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TilePriceProps {
  price: Price;
  ratePrecision: number;
  pipsPosition: number;
  anim?: "tickUp" | "tickDown";
  spread: string;
  onExecute: (direction: Direction) => void;
  disabled: boolean;
}

export class TilePricePage extends MountedComponent<TilePriceProps> {
  private readonly user: UserEvent = userEvent.setup();

  private buttons(): HTMLButtonElement[] {
    return [...this.root.querySelectorAll("button")];
  }

  /** The price box for one side — also the sell-btn/buy-btn execution button. */
  private box(side: "SELL" | "BUY"): HTMLButtonElement {
    const testId = side === "SELL" ? "sell-btn" : "buy-btn";
    return within(this.root).getByTestId(testId) as HTMLButtonElement;
  }

  isDisabled(side: "SELL" | "BUY"): boolean {
    return this.box(side).disabled;
  }

  async click(side: "SELL" | "BUY"): Promise<void> {
    await this.user.click(this.box(side));
  }

  /**
   * The rendered spread text, between the two price boxes. SpreadDisplay
   * renders a childless <div>; the pip digits live in <span>s, so filtering
   * to <div> disambiguates it from the numeric price text.
   */
  spreadText(): string {
    const candidate = [...this.root.querySelectorAll("div")].find((d) => {
      return (
        d.children.length === 0 &&
        /^\d+(\.\d+)?$/.test(d.textContent?.trim() ?? "")
      );
    });
    return candidate?.textContent?.trim() ?? "";
  }

  /** The two price-side labels in order: ["SELL", "BUY"]. */
  labels(): string[] {
    return this.buttons().map((b) => {
      return (b.querySelector("span")?.textContent ?? "").trim();
    });
  }

  /** The concatenated digit text rendered on one side (prefix+pips+fractional). */
  digits(side: "SELL" | "BUY"): string {
    const btn = this.buttons().find((b) => {
      return (b.querySelector("span")?.textContent ?? "").trim() === side;
    });
    if (!btn) throw new Error(`No ${side} button`);
    // The numeric value lives in the second top-level <span> (after the label).
    const valueSpan = btn.querySelectorAll(":scope > span")[1];
    return (valueSpan?.textContent ?? "").trim();
  }

  /** The colour of the big "pips" segment on one side (movement-driven). */
  pipsColor(side: "SELL" | "BUY"): string {
    const btn = this.buttons().find((b) => {
      return (b.querySelector("span")?.textContent ?? "").trim() === side;
    });
    if (!btn) throw new Error(`No ${side} button`);
    const pips = btn.querySelector<HTMLSpanElement>(
      '[data-testid="tile-pips"]',
    );
    const movement = pips?.dataset.movement;
    if (movement === "up") return "var(--accent-positive)";
    if (movement === "down") return "var(--accent-negative)";
    return "var(--text-primary)";
  }
}
