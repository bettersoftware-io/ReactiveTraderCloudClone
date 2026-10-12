import { initialsOf } from "@rtc/domain";
import type { SessionUserDto } from "@rtc/shared";

import type { AccountRecord } from "./AccountDirectory.js";

const BADGE_LENGTH = 4;

/** The profile card of a registered user (spec §5.5). The roster's cards
 * are hand-written; a registered user's is derived from the account. */
export function sessionUserFor(account: AccountRecord): SessionUserDto {
  const admin = account.access === "admin";
  const badge = account.id
    .replaceAll("-", "")
    .slice(0, BADGE_LENGTH)
    .toUpperCase();

  return {
    name: account.displayName,
    initials: initialsOf(account.displayName),
    role: admin ? "Desk Administrator" : "Guest Trader",
    id: `USR-${badge}`,
    email: account.email,
    desk: "Guest · Cloud",
    clearance: admin ? "LEVEL 5 · ADMIN" : "LEVEL 2 · DESK",
  };
}
