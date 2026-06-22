import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface SpreadDisplayProps {
  spread: string;
}

export class SpreadDisplayPage extends MountedComponent<SpreadDisplayProps> {
  /** The rendered spread text. */
  text(): string {
    return this.root.textContent?.trim() ?? "";
  }
}
