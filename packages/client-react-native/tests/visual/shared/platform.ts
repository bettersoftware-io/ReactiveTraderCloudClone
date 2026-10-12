export type Platform = "ios" | "android";

/** Which platform a capture run drives, from `RTC_VISUAL_PLATFORM`.
 *
 * iOS is the default because it is the platform both tiers were built on; an
 * Android run names itself. An unknown value throws rather than falling back:
 * a typo that quietly ran iOS would compare an iPhone's shots against the
 * goldens the caller did not ask about, and report it as a verdict. */
export function resolvePlatform(value: string | undefined): Platform {
  if (value === undefined || value === "" || value === "ios") {
    return "ios";
  }

  if (value === "android") {
    return "android";
  }

  throw new Error(
    `RTC_VISUAL_PLATFORM must be "ios" or "android", got "${value}".`,
  );
}
