/** How long the boot splash's progress ramp runs, end to end. The suites in
 * `@rtc/core-contract` assert it, and that package may not import
 * `@rtc/client-core` — hence here (pluggable-core slice 6). */
export const BOOT_DURATION_MS: number = 4200;

/** The boot ramp's step: one progress update every `BOOT_TICK_MS`. */
export const BOOT_TICK_MS: number = 90;
