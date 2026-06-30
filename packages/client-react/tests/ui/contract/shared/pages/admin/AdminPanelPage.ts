import { fireEvent, waitFor, within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { ThroughputView } from "@rtc/client-core";
import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for the AdminPanel throughput control. The panel is dumb: it reads
 * its view from the `useThroughput()` seam and calls `setValue` to persist. The
 * contract harness backs that seam with the World's throughput subject — specs
 * seed the loaded view via `mount(..., { throughput })`, drive edits through the
 * inputs, and assert against the recorded `setValue` values (the old PUT body)
 * and a server-pushed banner ({@link pushView}).
 */
export class AdminPanelPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** True while the loading placeholder is showing. */
  isLoading(): boolean {
    return within(this.root).queryByText(/loading throughput/i) !== null;
  }

  /** Wait for the panel (past its loading placeholder) to render. */
  async waitUntilLoaded(): Promise<void> {
    await waitFor(() => {
      return within(this.root).getByRole("heading", {
        name: /throughput control/i,
      });
    });
  }

  /** The values the panel asked to persist, in order (old PUT-body equivalent). */
  recordedSets(): number[] {
    return this.throughputSets();
  }

  /** Push a new throughput view from the "server" (e.g. a confirmation banner). */
  pushView(patch: Partial<ThroughputView>): void {
    this.setThroughputView(patch);
  }

  /** The panel heading text. */
  heading(): string {
    return (
      within(this.root)
        .getByRole("heading", { name: /throughput control/i })
        .textContent?.trim() ?? ""
    );
  }

  private numberInput(): HTMLInputElement {
    return within(this.root).getByRole("spinbutton") as HTMLInputElement;
  }

  private rangeInput(): HTMLInputElement {
    return within(this.root).getByRole("slider") as HTMLInputElement;
  }

  /** The current throughput value shown in the numeric input. */
  value(): number {
    return Number(this.numberInput().value);
  }

  /** The slider's current value (kept in sync with the numeric input). */
  sliderValue(): number {
    return Number(this.rangeInput().value);
  }

  /** The status-message banner text, or null when no banner is shown. */
  message(): string | null {
    const el = within(this.root).queryByText(
      /throughput has been set|error setting throughput/i,
    );
    return el?.textContent?.trim() ?? null;
  }

  /** Type a new value into the numeric input (fires the debounced PUT). */
  async setValue(next: number): Promise<void> {
    const input = this.numberInput();
    await this.user.clear(input);
    await this.user.type(input, String(next));
  }

  /** Move the slider to a new value (fires the debounced PUT). */
  dragSlider(next: number): void {
    fireEvent.change(this.rangeInput(), { target: { value: String(next) } });
  }
}
