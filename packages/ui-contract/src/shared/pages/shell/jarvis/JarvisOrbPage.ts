import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type { JarvisEvent } from "@rtc/client-core";

/**
 * Page object for the header J.A.R.V.I.S orb (`JarvisOrb`, Task 7). Hook-
 * driven: reads `useJarvis()`'s `state`/`toggle` off the REAL JarvisMachine
 * (built by `viewModelFromWorld` over `world.jarvis`, Task 9), so `emit()`
 * below drives the SAME machine a co-mounted `JarvisOverlayPage` would (mount
 * both with `mountWith(world, …)` on one shared World to exercise scenarios
 * that need `send()`, since only the overlay's UI can trigger it).
 */
export class JarvisOrbPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  private orb(): HTMLElement {
    return within(this.root).getByTestId("jarvis-orb");
  }

  /** `data-jarvis-state`: "idle" | "speaking" | "attention". */
  state(): string {
    return this.orb().getAttribute("data-jarvis-state") ?? "";
  }

  /** `data-skin`: the active JarvisSkin. */
  skin(): string {
    return this.orb().getAttribute("data-skin") ?? "";
  }

  /** True while the overlay this orb toggles is open (`data-active`). */
  isActive(): boolean {
    return this.orb().getAttribute("data-active") === "true";
  }

  /** The unread badge's count, or null when no badge is rendered (unread === 0). */
  badge(): number | null {
    const el = within(this.root).queryByTestId("jarvis-orb-badge");
    return el ? Number(el.textContent) : null;
  }

  /** Click the orb — toggles the shared JarvisMachine's `open` state. */
  async click(): Promise<void> {
    await this.user.click(this.orb());
  }

  /** Push reply events onto the Jarvis fake's in-flight `ask()` turn — see
   * {@link MountedComponent.emitJarvis}. */
  emitEvents(events: readonly JarvisEvent[]): void {
    this.emitJarvis(events);
  }
}
