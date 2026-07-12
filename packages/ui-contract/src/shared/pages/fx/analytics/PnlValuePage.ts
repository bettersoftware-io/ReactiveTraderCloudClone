import { MountedComponent } from "@ui-contract/harness/component";

export interface PnlValueProps {
  value: number;
}

/** Page object for the PnlValue leaf. */
export class PnlValuePage extends MountedComponent<PnlValueProps> {
  /** The formatted P&L text the user sees, e.g. "+12.5k". */
  text(): string {
    return this.root.textContent?.trim() ?? "";
  }
}
