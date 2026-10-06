import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

import type { CoreOption } from "@rtc/core-api";

export type CoreSwapPhase = "covering" | "loading" | "handover" | "revealing";

export interface CoreSwapOverlayProps {
  /** null while no swap is under way: the overlay renders nothing. */
  swap: {
    readonly from: CoreOption;
    readonly to: CoreOption;
    readonly phase: CoreSwapPhase;
  } | null;
  /** How long this swap's cover takes to fade in and out. */
  fade: { readonly enterMs: number; readonly exitMs: number };
}

/** The two custom-property values, as written (`"160ms"`). */
interface FadeDurations {
  readonly enter: string;
  readonly exit: string;
}

/**
 * Page object for CoreSwapOverlay, the cover shown while the application
 * core is swapped in place. Props-driven: it reads no ViewModel, because
 * none exists in the middle of a swap.
 */
export class CoreSwapOverlayPage extends MountedComponent<CoreSwapOverlayProps> {
  /** True when the overlay is in the DOM (false → the component rendered
   * nothing). */
  isShown(): boolean {
    return this.overlay() !== null;
  }

  /** The overlay's ARIA role; null when it is not shown. */
  role(): string | null {
    return this.overlay()?.getAttribute("role") ?? null;
  }

  /** The phase the stylesheet keys on (`data-phase`); null when not shown. */
  phase(): string | null {
    return this.overlay()?.dataset.phase ?? null;
  }

  /** True when the "CORE SWAP" label is on screen. */
  showsLabel(): boolean {
    return within(this.root).queryByText("CORE SWAP") !== null;
  }

  /** The two core names as shown, outgoing first. */
  coreNames(): readonly [string, string] {
    return [this.textOf("core-swap-from"), this.textOf("core-swap-to")];
  }

  /** The status line under the core names. */
  statusLine(): string {
    return this.textOf("core-swap-status");
  }

  /** The full sentence written for assistive technology. */
  sentence(): string {
    return this.textOf("core-swap-sentence");
  }

  /** True when the visible lettering is hidden from assistive technology,
   * which leaves the sentence as the status region's only content. */
  hidesLetteringFromAssistiveTechnology(): boolean {
    const sentence = within(this.root).queryByTestId("core-swap-sentence");
    const status = within(this.root).queryByTestId("core-swap-status");

    return (
      status?.closest('[aria-hidden="true"]') !== null &&
      sentence?.closest('[aria-hidden="true"]') === null
    );
  }

  /** The fade-in and fade-out durations handed to the stylesheet (the
   * `--core-swap-enter` / `--core-swap-exit` custom properties). */
  fadeDurations(): FadeDurations {
    const style = this.overlay()?.style;

    return {
      enter: style?.getPropertyValue("--core-swap-enter") ?? "",
      exit: style?.getPropertyValue("--core-swap-exit") ?? "",
    };
  }

  private overlay(): HTMLElement | null {
    return within(this.root).queryByTestId("core-swap-overlay");
  }

  private textOf(testId: string): string {
    return within(this.root).queryByTestId(testId)?.textContent?.trim() ?? "";
  }
}
