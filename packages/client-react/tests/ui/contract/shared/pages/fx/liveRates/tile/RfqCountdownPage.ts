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

  /** The progress-bar fill width, e.g. "50%". */
  fillWidth(): string {
    const bars = this.root.querySelectorAll<HTMLDivElement>("div");
    // Structure: outer wrapper > track div > fill div. The fill carries width %.
    const fill = [...bars].find((d) => d.style.width.endsWith("%"));
    return fill?.style.width ?? "";
  }

  /** The fill colour (switches when fraction drops below the warn threshold). */
  fillColor(): string {
    const bars = this.root.querySelectorAll<HTMLDivElement>("div");
    const fill = [...bars].find((d) => d.style.width.endsWith("%"));
    return fill?.style.backgroundColor ?? "";
  }
}
