import { ROSTER } from "@rtc/domain";

import type { HarnessSeed } from "#/harness/scriptedPorts";

/** Far in the future, so a resumed session never expires under a real clock. */
const FAR_FUTURE_MS = 4_000_000_000_000;

/** A seed whose stored session is a RESUMED administrator: `index` picks the
 * roster identity, whose email keys the account list. */
export function createAdminSeed(index: number): HarnessSeed {
  const entry = ROSTER[index];

  return {
    session: {
      token: `stored-${index}`,
      user: { ...entry.user, access: "admin" },
      username: entry.username,
      exp: FAR_FUTURE_MS,
    },
  };
}
