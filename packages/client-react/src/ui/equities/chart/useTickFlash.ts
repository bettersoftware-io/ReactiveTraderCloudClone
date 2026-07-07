import { useState } from "react";

type TickDirection = "up" | "down";

export interface TickFlash {
  readonly flashOn: boolean;
  readonly dir: TickDirection;
}

const IDLE: TickFlash = { flashOn: false, dir: "up" };

/**
 * True only for the render where `value` first differs from the previous
 * render's value — no timers, no decay. Uses the React-documented "adjust
 * state during rendering" recipe (comparing against a stored previous value
 * in state, not a ref — `react-hooks/refs` bans reading `ref.current` during
 * render): when `value` has changed, this both schedules the state update
 * for the NEXT render and returns the freshly-computed flash for THIS one,
 * so the transition is visible on the same render that changed it.
 *
 * Mirrors the prototype's tick flash without its clock-based FLASH_MS window
 * (`flashOn = fl && now - fl.ts < 650`): with live streaming quotes this
 * fires on effectively every tick, and the consuming CSS `transition` gives
 * it the same settle feel with no scheduled-timer call of any kind.
 */
export function useTickFlash(value: number | null): TickFlash {
  const [prevValue, setPrevValue] = useState<number | null>(value);
  const [flash, setFlash] = useState<TickFlash>(IDLE);

  if (value !== prevValue) {
    const next: TickFlash =
      value !== null && prevValue !== null
        ? { flashOn: true, dir: value < prevValue ? "down" : "up" }
        : IDLE;

    setPrevValue(value);
    setFlash(next);

    return next;
  }

  return flash;
}
