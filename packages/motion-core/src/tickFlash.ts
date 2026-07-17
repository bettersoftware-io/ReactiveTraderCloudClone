export type TickDirection = "up" | "down" | "flat";

export const TICK_FLASH_EPSILON = 1e-9;
export const TICK_FLASH_DURATION_MS = 320;

export function tickDirection(
  prev: number | null | undefined,
  next: number,
): TickDirection {
  if (prev == null || Math.abs(next - prev) <= TICK_FLASH_EPSILON) {
    return "flat";
  }
  return next > prev ? "up" : "down";
}

export interface TickFlashState {
  value: number | null;
  nonce: number;
}

export function nextTickFlash(
  state: TickFlashState,
  next: number,
): { dir: TickDirection; state: TickFlashState } {
  const dir = tickDirection(state.value, next);
  const nonce = dir === "flat" ? state.nonce : state.nonce + 1;
  return { dir, state: { value: next, nonce } };
}
