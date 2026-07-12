import { MountedComponent } from "@ui-contract/harness/component";

export interface RfqCountdownProps {
  remainingMs: number;
  totalMs: number;
}

export class RfqCountdownPage extends MountedComponent<RfqCountdownProps> {
  /** The "Ns remaining" caption text. */
  caption(): string {
    return this.root.querySelector("span")?.textContent?.trim() ?? "";
  }

  private fill(): HTMLDivElement | null {
    return this.root.querySelector<HTMLDivElement>(
      '[data-testid="rfq-countdown-fill"]',
    );
  }

  /** The mount-time drain-animation duration, e.g. "10000ms". */
  fillDuration(): string {
    return this.fill()?.style.getPropertyValue("--rfq-duration").trim() ?? "";
  }

  /** The mount-time drain fast-forward (negative delay), e.g. "-5000ms". */
  fillDelay(): string {
    return this.fill()?.style.getPropertyValue("--rfq-delay").trim() ?? "";
  }

  /** The fill colour token (switches when fraction drops below the warn threshold). */
  fillColor(): string {
    const warn = this.fill()?.dataset.warn === "true";
    return warn ? "var(--accent-aware)" : "var(--accent-primary)";
  }
}
