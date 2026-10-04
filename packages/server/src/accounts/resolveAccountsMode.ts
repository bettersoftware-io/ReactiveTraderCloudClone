import { AUTH_SECRET_MIN_LENGTH } from "../config/limits.js";
import type { AccountDirectory } from "./AccountDirectory.js";
import { createDisabledAccountDirectory } from "./DisabledAccountDirectory.js";
import { DEV_ACCOUNT_SEEDS } from "./devAccounts.js";
import { createInMemoryAccountDirectory } from "./InMemoryAccountDirectory.js";
import { createSupabaseAccountDirectory } from "./SupabaseAccountDirectory.js";

export type AccountsMode =
  | {
      readonly kind: "supabase";
      readonly url: string;
      readonly secretKey: string;
    }
  | { readonly kind: "in-memory" }
  | { readonly kind: "disabled" };

interface AccountDirectoryDeps {
  readonly now: () => number;
  readonly timeoutMs: number;
}

/**
 * Which account store this process uses. Three modes, and the dev one is
 * NEVER a default: it accepts a fixed code and seeds an admin with a
 * committed password, so it must be asked for by name and is refused on a
 * deployed machine (Fly sets `FLY_APP_NAME` on every one). Throws at startup
 * on a half-configured or ambiguous environment, the way `AuthService`
 * refuses `AUTH_USERS` without `AUTH_SECRET` — and on an empty or short
 * `AUTH_SECRET` in either account mode, since an account token signed with
 * a guessable key is forgeable by anyone.
 */
export function resolveAccountsMode(env: NodeJS.ProcessEnv): AccountsMode {
  const url = env.SUPABASE_URL ?? "";
  const secretKey = env.SUPABASE_SECRET_KEY ?? "";
  const devAccounts = env.RTC_DEV_ACCOUNTS === "1";

  if (url !== "" && devAccounts) {
    throw new Error("RTC_DEV_ACCOUNTS and SUPABASE_URL cannot both be set");
  }

  if (url === "" && secretKey !== "") {
    throw new Error(
      "SUPABASE_URL must be set when SUPABASE_SECRET_KEY is configured",
    );
  }

  if (url === "" && !devAccounts) {
    return { kind: "disabled" };
  }

  if (!env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET must be set when accounts are enabled");
  }

  // Never echo the secret: a startup error lands in the deploy log.
  if (env.AUTH_SECRET.trim().length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(
      `AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters when accounts are enabled`,
    );
  }

  if (devAccounts) {
    if (env.FLY_APP_NAME) {
      throw new Error("RTC_DEV_ACCOUNTS is refused on a deployed machine");
    }

    return { kind: "in-memory" };
  }

  if (!url.startsWith("https://")) {
    throw new Error("SUPABASE_URL must be an https URL");
  }

  if (secretKey === "") {
    throw new Error(
      "SUPABASE_SECRET_KEY must be set when SUPABASE_URL is configured",
    );
  }

  return { kind: "supabase", url, secretKey };
}

/** The directory `mode` names, built once at startup. */
export function createAccountDirectory(
  mode: AccountsMode,
  deps: AccountDirectoryDeps,
): AccountDirectory {
  if (mode.kind === "supabase") {
    return createSupabaseAccountDirectory({
      url: mode.url,
      secretKey: mode.secretKey,
      timeoutMs: deps.timeoutMs,
    });
  }

  if (mode.kind === "in-memory") {
    return createInMemoryAccountDirectory({
      now: deps.now,
      seeds: DEV_ACCOUNT_SEEDS,
    });
  }

  return createDisabledAccountDirectory();
}

/**
 * The no-deploy switch for sign-up: unset or `true` is open, `false` closes
 * it. Anything else stops the server at startup — an operator closing
 * sign-up during abuse with `0` or `FALSE` must not leave it silently open.
 * The refusal never echoes the value.
 */
export function isRegistrationOpen(env: NodeJS.ProcessEnv): boolean {
  const raw = env.REGISTRATION_OPEN;

  if (raw === undefined) {
    return true;
  }

  const value = raw.trim();

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error('REGISTRATION_OPEN must be "true" or "false"');
}
