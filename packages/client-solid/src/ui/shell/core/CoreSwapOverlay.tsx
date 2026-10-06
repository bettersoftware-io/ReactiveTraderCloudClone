import { type Accessor, type JSX, Show } from "solid-js";

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
 *
 * `Show` is not keyed: one element lives through every phase of a swap,
 * which the fade-out needs (a transition runs on an element that stays).
 */
export function CoreSwapOverlay(props: CoreSwapOverlayProps): JSX.Element {
  return (
    <Show when={props.swap}>
      {(swap: Accessor<CoreSwap>): JSX.Element => {
        return (
          <div
            class={styles.overlay}
            role="status"
            data-testid="core-swap-overlay"
            data-phase={swap().phase}
            // eslint-disable-next-line no-restricted-syntax -- this swap's fade durations, decided at run time by the core host; static CSS can't express them
            style={{
              "--core-swap-enter": `${props.fade.enterMs}ms`,
              "--core-swap-exit": `${props.fade.exitMs}ms`,
            }}
          >
            <div class={styles.grid} aria-hidden="true" />
            <div class={styles.panel} aria-hidden="true">
              <div class={styles.label}>CORE SWAP</div>
              <div class={styles.cores}>
                <span data-testid="core-swap-from">{swap().from.label}</span>
                <span class={styles.separator}>▸</span>
                <span data-testid="core-swap-to">{swap().to.label}</span>
              </div>
              <div class={styles.status} data-testid="core-swap-status">
                {STATUS_LINES[swap().phase]}
              </div>
            </div>
            <span class={styles.sentence} data-testid="core-swap-sentence">
              {`Swapping application core from ${swap().from.label} to ${swap().to.label}`}
            </span>
          </div>
        );
      }}
    </Show>
  );
}

type CoreSwapPhase = "covering" | "loading" | "handover" | "revealing";

export interface CoreSwapOverlayProps {
  /** null while no swap is under way: the overlay renders nothing. */
  readonly swap: CoreSwap | null;
  /** How long this swap's cover takes to fade in and out. */
  readonly fade: { readonly enterMs: number; readonly exitMs: number };
}

interface CoreSwap {
  readonly from: CoreOption;
  readonly to: CoreOption;
  readonly phase: CoreSwapPhase;
}

/** The new core is not composed until the handover, so both phases before
 * it read "loading". */
const STATUS_LINES: Record<CoreSwapPhase, string> = {
  covering: "loading",
  loading: "loading",
  handover: "handing over",
  revealing: "online",
};
