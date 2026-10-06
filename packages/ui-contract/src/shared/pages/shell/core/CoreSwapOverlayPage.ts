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
   * no cover, only its empty status region). */
  isShown(): boolean {
    return this.overlay() !== null;
  }

  /** True when the status region is in the DOM. It is there with or
   * without a swap: a live region must exist before its content arrives for
   * the content to be announced. */
  hasStatusRegion(): boolean {
    return this.statusRegion() !== null;
  }

  /** True when the status region is an element of its own, outside the
   * overlay that comes and goes. */
  statusRegionOutlivesOverlay(): boolean {
    const region = this.statusRegion();
    const overlay = this.overlay();

    return region !== null && (overlay === null || !overlay.contains(region));
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

  /** The status region's content: the full sentence written for assistive
   * technology, or nothing while no swap is under way. */
  sentence(): string {
    return this.statusRegion()?.textContent?.trim() ?? "";
  }

  /** True when the visible lettering is on the page and hidden from
   * assistive technology while the status region is not, which leaves the
   * sentence as the only thing read out. False when either is missing. */
  hidesLetteringFromAssistiveTechnology(): boolean {
    const region = this.statusRegion();
    const lettering = within(this.root).queryByTestId("core-swap-status");

    if (region === null || lettering === null) {
      return false;
    }

    return (
      lettering.closest('[aria-hidden="true"]') !== null &&
      region.closest('[aria-hidden="true"]') === null
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

  private statusRegion(): HTMLElement | null {
    return within(this.root).queryByRole("status");
  }

  private overlay(): HTMLElement | null {
    return within(this.root).queryByTestId("core-swap-overlay");
  }

  private textOf(testId: string): string {
    return within(this.root).queryByTestId(testId)?.textContent?.trim() ?? "";
  }
}
