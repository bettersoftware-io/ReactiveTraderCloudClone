import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export class BootSequencePage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** The wordmark text — should contain "REACTIVE". */
  wordmark(): string {
    return (
      within(this.root).getByTestId("boot-wordmark").textContent?.trim() ?? ""
    );
  }

  /** True when the SKIP button is present. */
  hasSkip(): boolean {
    return within(this.root).queryByTestId("boot-skip") !== null;
  }

  /** The progress percentage label, e.g. "0%". */
  progressLabel(): string {
    return within(this.root).getByTestId("boot-pct").textContent?.trim() ?? "";
  }

  /** Click the SKIP button and wait for the resulting re-render. */
  async skip(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("boot-skip"));
  }

  /** True when the boot-sequence root element is present. */
  hasRoot(): boolean {
    return within(this.root).queryByTestId("boot-sequence") !== null;
  }

  /** True when the progress bar container is present. */
  hasProgressBar(): boolean {
    return within(this.root).queryByTestId("boot-progress") !== null;
  }

  /**
   * Proxy for "onDone was called at least once": returns 1 when the component
   * transitions to done state (data-done="true"), 0 otherwise. The machine
   * calls onDone() synchronously on the same tick that emits done:true, so
   * this is a faithful witness for the onDone invocation without requiring a spy.
   */
  onDoneCount(): number {
    const el = within(this.root).queryByTestId("boot-sequence");
    return el?.getAttribute("data-done") === "true" ? 1 : 0;
  }
}
