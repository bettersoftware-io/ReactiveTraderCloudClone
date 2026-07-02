import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TileFooterProps {
  spotDate: string;
  notional: string;
  baseCurrency: string;
}

export class TileFooterPage extends MountedComponent<TileFooterProps> {
  private spans(): HTMLSpanElement[] {
    return [...this.root.querySelectorAll("span")];
  }

  /** The left "SPT {date}" text. */
  spotDateText(): string {
    return this.spans()[0]?.textContent?.trim() ?? "";
  }

  /** The right "{notional} {base}" text. */
  notionalText(): string {
    return this.spans()[1]?.textContent?.trim() ?? "";
  }
}
