import { JARVIS_BRAINS, type JarvisBrain } from "@rtc/domain";

import type { AccountDirectory } from "#/accounts/AccountDirectory.js";
import type { Caller } from "#/services/serviceContainer.js";

/**
 * Which house offer and budget a caller gets (spec §3.1): a `member` is an
 * approved account with role `user`; an `operator` is an administrator or the
 * roster persona — every brain, no personal limit, still under the house cap.
 */
export type JarvisTier = "member" | "operator";

/** Opus, the costliest brain per token, is the one the house key keeps from
 * members (spec §3.1). */
const MEMBER_HOUSE_BRAINS: readonly JarvisBrain[] = [
  "scripted",
  "claude-haiku-4-5",
  "claude-sonnet-5",
];

/** The brains the house key offers a tier, in picker order. */
export function houseBrainsFor(tier: JarvisTier): readonly JarvisBrain[] {
  return tier === "operator" ? JARVIS_BRAINS : MEMBER_HOUSE_BRAINS;
}

/**
 * Resolves a caller's tier from the account directory, at use — `Caller`
 * carries no role, and the token's claim could be up to eight hours stale,
 * so the role is read the way `accountAdminService` reads `access`. Every
 * answer that is not a found administrator, including a directory that
 * cannot be reached, lands on the narrower `member` tier: a lookup failure
 * must never widen what the house key pays for.
 */
export function createTierLookup(
  directory: Pick<AccountDirectory, "findAccount">,
): (caller: Caller) => Promise<JarvisTier> {
  return async (caller: Caller): Promise<JarvisTier> => {
    if (caller.accountId === null) {
      return "operator";
    }

    try {
      const lookup = await directory.findAccount(caller.accountId);

      return lookup.outcome === "found" && lookup.account.access === "admin"
        ? "operator"
        : "member";
    } catch {
      return "member";
    }
  };
}
