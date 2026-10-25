export const DEFAULT_JARVIS_USER_DAILY_USD = 0.2;
export const DEFAULT_JARVIS_HOUSE_DAILY_USD = 3;

export interface JarvisBudgetConfig {
  readonly userDailyUsd: number;
  readonly houseDailyUsd: number;
  readonly forceExhausted: boolean;
}

/** A non-negative USD amount; `0` is a valid limit. An unset variable takes
 * the default silently, a malformed one warns and takes the default. */
function parseDailyUsdSetting(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name];

  if (raw === undefined) {
    return fallback;
  }

  // `Number` reads a blank string as 0, which would silently turn the key
  // off; padding around a number is harmless and kept.
  const parsed = raw.trim() === "" ? Number.NaN : Number(raw);

  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  console.warn(`jarvis-budget: malformed ${name} "${raw}", using default`);

  return fallback;
}

/** `exhausted` forces every caller to the exhausted state. The retired
 * `soft` / `hard` values warn and are ignored; anything else is malformed. */
function parseForceExhausted(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") {
    return false;
  }

  if (raw === "exhausted") {
    return true;
  }

  if (raw === "soft" || raw === "hard") {
    console.warn(
      `jarvis-budget: RTC_JARVIS_FORCE_GATE "${raw}" is retired, ignoring`,
    );

    return false;
  }

  console.warn(
    `jarvis-budget: malformed RTC_JARVIS_FORCE_GATE "${raw}", using default`,
  );

  return false;
}

export function parseJarvisBudgetConfig(
  env: NodeJS.ProcessEnv,
): JarvisBudgetConfig {
  return {
    userDailyUsd: parseDailyUsdSetting(
      env,
      "RTC_JARVIS_USER_DAILY_USD",
      DEFAULT_JARVIS_USER_DAILY_USD,
    ),
    houseDailyUsd: parseDailyUsdSetting(
      env,
      "RTC_JARVIS_HOUSE_DAILY_USD",
      DEFAULT_JARVIS_HOUSE_DAILY_USD,
    ),
    forceExhausted: parseForceExhausted(env.RTC_JARVIS_FORCE_GATE),
  };
}
