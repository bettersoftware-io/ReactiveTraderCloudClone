import { DRIVE_STAGGER_MS } from "@rtc/domain";

/** Fake-timer time that lets any drive batch of up to five commands apply:
 * comfortably above `4 * DRIVE_STAGGER_MS`, the worst case with the first
 * command free. Shared by every spec that drives the shell through Jarvis
 * `command` events. */
export const DRIVE_SETTLE_MS: number = DRIVE_STAGGER_MS * 5 + 500;
