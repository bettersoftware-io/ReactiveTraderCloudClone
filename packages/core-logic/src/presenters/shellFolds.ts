import {
  BOOT_DURATION_MS,
  BOOT_TICK_MS,
  BOOT_VARIANTS,
  type BootVariant,
  LOGIN_WAIT_VARIANTS,
  type LoginWaitVariant,
} from "@rtc/domain";

const BOOT_TICKS: number = Math.ceil(BOOT_DURATION_MS / BOOT_TICK_MS);

/** The boot ramp's progress (0–100) at `tick` — the fold behind every core's
 * boot machine. Imported by the sibling cores, never copied. */
export function bootProgress(tick: number): number {
  return Math.min(100, Math.round((tick / BOOT_TICKS) * 100));
}

/** The boot variant the NEXT boot plays: the cyclic successor. */
export function nextBootVariant(variant: BootVariant): BootVariant {
  return BOOT_VARIANTS[
    (BOOT_VARIANTS.indexOf(variant) + 1) % BOOT_VARIANTS.length
  ];
}

/** The login-wait treatment the NEXT attempt shows: the cyclic successor. */
export function nextLoginWaitVariant(
  variant: LoginWaitVariant,
): LoginWaitVariant {
  return LOGIN_WAIT_VARIANTS[
    (LOGIN_WAIT_VARIANTS.indexOf(variant) + 1) % LOGIN_WAIT_VARIANTS.length
  ];
}

/** The error line a failed login or unlock shows. */
export function describeAuthFailure(reason: "invalid" | "unavailable"): string {
  return reason === "invalid" ? "Invalid credentials" : "Service unavailable";
}
