import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TileHeaderProps {
  base: string;
  terms: string;
}

export class TileHeaderPage extends MountedComponent<TileHeaderProps> {
  /** All span texts in order: [base, "/", terms]. */
  parts(): string[] {
    return [...this.root.querySelectorAll("span")].map((s) => {
      return s.textContent?.trim() ?? "";
    });
  }

  /** The full header text (e.g. "EUR/USD" rendered as "EUR / USD"). */
  text(): string {
    return this.root.textContent?.trim() ?? "";
  }
}
