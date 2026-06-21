import { MountedComponent } from "../../../../harness/component";

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

  /** The progress-bar fill width, e.g. "50%". */
  fillWidth(): string {
    return this.fill()?.style.getPropertyValue("--rfq-fill").trim() ?? "";
  }

  /** The fill colour token (switches when fraction drops below the warn threshold). */
  fillColor(): string {
    const warn = this.fill()?.dataset.warn === "true";
    return warn ? "var(--accent-aware)" : "var(--accent-primary)";
  }
}
