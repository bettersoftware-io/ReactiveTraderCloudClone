import type { AccessLevel } from "./accessLevel.js";

export interface SessionUser {
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly id: string;
  readonly email: string;
  readonly desk: string;
  readonly clearance: string;
  /** What this identity may do; distinct from the display `role`. */
  readonly access: AccessLevel;
}
