import type { CSSProperties, ReactElement } from "react";

import type { CoreOption } from "@rtc/core-api";

import styles from "./CoreSwapOverlay.module.css";

/**
 * The cover shown while the application core is swapped in place (spec
 * 2026-10-05-core-hot-swap-design.md §4). The app tree is unmounted and
 * mounted again underneath it, so it lives in a root of its own, outside
 * the `ViewModelProvider`: it takes plain props and reads no ViewModel. The
 * theme and the power-saver level reach it through the `<html>` attributes.
 *
 * The scrim is opaque and the only motion is its `opacity` (see
 * `CoreSwapOverlay.module.css`). The two fade durations are the host's own
 * `enterMs` / `exitMs` for this swap, handed to the stylesheet as custom
 * properties, so the fade and the host's waits cannot drift apart.
 *
 * The lettering is hidden from assistive technology; the status region's
 * content there is one full sentence.
 */
export function CoreSwapOverlay({
  swap,
  fade,
}: CoreSwapOverlayProps): ReactElement | null {
  if (swap === null) {
    return null;
  }

  // This swap's fade durations, decided at run time by the core host: custom
  // properties are the one thing static CSS cannot carry.
  const fadeDurations = {
    "--core-swap-enter": `${fade.enterMs}ms`,
    "--core-swap-exit": `${fade.exitMs}ms`,
  } as CSSProperties;

  return (
    <div
      className={styles.overlay}
      role="status"
      data-testid="core-swap-overlay"
      data-phase={swap.phase}
      style={fadeDurations}
    >
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.panel} aria-hidden="true">
        <div className={styles.label}>CORE SWAP</div>
        <div className={styles.cores}>
          <span data-testid="core-swap-from">{swap.from.label}</span>
          <span className={styles.separator}>▸</span>
          <span data-testid="core-swap-to">{swap.to.label}</span>
        </div>
        <div className={styles.status} data-testid="core-swap-status">
          {STATUS_LINES[swap.phase]}
        </div>
      </div>
      <span className={styles.sentence} data-testid="core-swap-sentence">
        {`Swapping application core from ${swap.from.label} to ${swap.to.label}`}
      </span>
    </div>
  );
}

type CoreSwapPhase = "covering" | "loading" | "handover" | "revealing";

export interface CoreSwapOverlayProps {
  /** null while no swap is under way: the overlay renders nothing. */
  readonly swap: {
    readonly from: CoreOption;
    readonly to: CoreOption;
    readonly phase: CoreSwapPhase;
  } | null;
  /** How long this swap's cover takes to fade in and out. */
  readonly fade: { readonly enterMs: number; readonly exitMs: number };
}

/** The new core is not composed until the handover, so both phases before
 * it read "loading". */
const STATUS_LINES: Record<CoreSwapPhase, string> = {
  covering: "loading",
  loading: "loading",
  handover: "handing over",
  revealing: "online",
};
