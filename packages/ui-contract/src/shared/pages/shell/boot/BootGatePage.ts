import { fireEvent, within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for BootGate. The gate renders its app content immediately and
 * overlays the boot splash on top until the sequence completes; the splash's
 * own CSS fades it out, and BootGate unmounts it once that opacity transition
 * ends. The harness mounts BootGate around a sentinel child (data-testid
 * "boot-gate-child") so a spec can assert the content stays mounted throughout.
 */
export class BootGatePage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** True while the boot splash overlay is mounted. */
  hasSplash(): boolean {
    return within(this.root).queryByTestId("boot-sequence") !== null;
  }

  /** True when the gated app content is mounted (always, splash or not). */
  hasContent(): boolean {
    return within(this.root).queryByTestId("boot-gate-child") !== null;
  }

  /** True once the splash has entered its done (fading) state. */
  splashDone(): boolean {
    return (
      within(this.root).queryByTestId("boot-sequence")?.dataset.done === "true"
    );
  }

  /** Click the splash's SKIP control → completes the boot sequence. */
  async skip(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("boot-skip"));
  }

  /** Simulate the splash's opacity fade finishing → BootGate unmounts it. */
  endFade(): void {
    fireEvent.transitionEnd(within(this.root).getByTestId("boot-sequence"), {
      propertyName: "opacity",
    });
  }

  /** A non-opacity transitionend (e.g. progress bar) must NOT unmount the splash. */
  endUnrelatedTransition(): void {
    fireEvent.transitionEnd(within(this.root).getByTestId("boot-sequence"), {
      propertyName: "width",
    });
  }

  /** Re-raise the splash through the boot-gate seam (⟳ Reboot HUD equivalent). */
  reboot(): void {
    this.setBootGateVisible(true);
  }

  /** Seed the splash hidden through the seam (webdriver/nosplash equivalent). */
  hideThroughSeam(): void {
    this.setBootGateVisible(false);
  }
}
