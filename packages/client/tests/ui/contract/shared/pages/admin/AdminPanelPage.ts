import { within, waitFor, fireEvent } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "../../harness/component";

/**
 * Page object for the AdminPanel throughput control. The panel drives itself
 * from the `useThroughput` hook (which fetches/persists over HTTP); specs stub
 * `fetch` before mounting and use {@link waitUntilLoaded} to settle the initial
 * load.
 */
export class AdminPanelPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** True while the loading placeholder is showing. */
  isLoading(): boolean {
    return within(this.root).queryByText(/loading throughput/i) !== null;
  }

  /** Wait for the initial throughput fetch to settle and the panel to render. */
  async waitUntilLoaded(): Promise<void> {
    await waitFor(() =>
      within(this.root).getByRole("heading", { name: /throughput control/i }),
    );
  }

  /** The panel heading text. */
  heading(): string {
    return within(this.root)
      .getByRole("heading", { name: /throughput control/i })
      .textContent?.trim() ?? "";
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
