import { type Accessor, createMemo } from "solid-js";

type TickDirection = "up" | "down";

export interface TickFlash {
  readonly flashOn: boolean;
  readonly dir: TickDirection;
}

const IDLE: TickFlash = { flashOn: false, dir: "up" };

/**
 * True only on the run where `value()` first differs from the previous run's
 * value — no timers, no decay.
 *
 * SOLID PORT NOTE: the React original uses the React-documented "adjust
 * state during rendering" recipe (two `useState`s, comparing against a
 * stored previous value read during render). Solid has no render phase to
 * hook that trick into, so this instead closes over two plain variables
 * (the previous value and the previous flash) inside a `createMemo` — the
 * memo body re-runs exactly when `value()` changes (mirroring the React
 * version re-rendering exactly when its `value` prop changes), updates both
 * closed-over variables, and returns the freshly-computed flash; an
 * unchanged `value()` (the memo re-running for an unrelated reason never
 * happens here, since `value()` is its only dependency) falls through to the
 * `else` branch and returns the SAME previous flash object, mirroring the
 * "keeps the previous flash object across a render where the value is
 * unchanged" behaviour.
 *
 * Mirrors the prototype's tick flash without its clock-based FLASH_MS window
 * (`flashOn = fl && now - fl.ts < 650`): with live streaming quotes this
 * fires on effectively every tick, and the consuming CSS `transition` gives
 * it the same settle feel with no scheduled-timer call of any kind.
 */
export function useTickFlash(
  value: Accessor<number | null>,
): Accessor<TickFlash> {
  let prevValue: number | null = value();
  let prevFlash: TickFlash = IDLE;

  return createMemo((): TickFlash => {
    const current = value();

    if (current === prevValue) {
      return prevFlash;
    }

    const next: TickFlash =
      current !== null && prevValue !== null
        ? { flashOn: true, dir: current < prevValue ? "down" : "up" }
        : IDLE;

    prevValue = current;
    prevFlash = next;

    return next;
  });
}
