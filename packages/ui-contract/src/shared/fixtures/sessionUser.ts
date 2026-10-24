import type { AccessLevel, SessionUser } from "@rtc/domain";

/** A signed-in identity with this access, for a spec that seeds `auth.user`
 * to open or hide the Admin tab. */
export function createSessionUser(access: AccessLevel): SessionUser {
  return {
    name: "Ada Admin",
    initials: "AA",
    role: "Operations",
    id: "ADM-0001",
    email: "ada@example.test",
    desk: "Desk",
    clearance: "LEVEL 4",
    access,
  };
}
