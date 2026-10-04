import type { DevCredentials } from "../simulators/AuthSimulator.js";
import { ROSTER } from "./roster.js";

/** One sign-in a login screen may offer as a hint: a roster account whose
 * credentials the page verifies in the browser. Public by design — the demo
 * roster and its password are committed and ship in every bundle. */
export interface DemoAccount {
  readonly username: string;
  readonly password: string;
  /** The roster profile's role line (e.g. "Senior FX Trader"). */
  readonly role: string;
}

/**
 * The accounts `AuthSimulator` would accept for these credentials, in roster
 * order. A credential for a username outside the roster is left out: the
 * simulator rejects it, so listing it would advertise a login that cannot
 * work.
 */
export function listDemoAccounts(
  credentials: DevCredentials,
): readonly DemoAccount[] {
  return ROSTER.flatMap((entry) => {
    const password = credentials[entry.username];

    if (password === undefined) {
      return [];
    }

    return [{ username: entry.username, password, role: entry.user.role }];
  });
}

/**
 * The one password every listed account shares, or `null` when they differ,
 * none are listed, or the shared password is empty (nothing to print). A login screen prints a shared password once under
 * the list; with differing passwords there is no single line to print, and
 * the hint falls back to click-to-fill alone.
 */
export function sharedDemoPassword(
  accounts: readonly DemoAccount[],
): string | null {
  const first = accounts[0];

  if (first === undefined) {
    return null;
  }

  const shared = accounts.every((account) => {
    return account.password === first.password;
  });

  return shared && first.password !== "" ? first.password : null;
}
