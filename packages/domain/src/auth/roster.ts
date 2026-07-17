import type { SessionUser } from "./sessionUser.js";

export interface RosterEntry {
  readonly username: string;
  readonly user: SessionUser;
}

// PUBLIC profiles only. Passwords live in the AUTH_USERS secret (server) or a
// gitignored dev .env (simulator) — never here.
export const ROSTER: readonly RosterEntry[] = [
  {
    username: "astark",
    user: {
      name: "Anthony Stark",
      initials: "AS",
      role: "Senior FX Trader",
      id: "TRD-0042",
      email: "a.stark@reactivetrader.io",
      desk: "G10 Spot · London",
      clearance: "LEVEL 4 · FULL",
    },
  },
  {
    username: "nromanoff",
    user: {
      name: "Natasha Romanoff",
      initials: "NR",
      role: "Credit Trader",
      id: "TRD-0071",
      email: "n.romanoff@reactivetrader.io",
      desk: "Credit · London",
      clearance: "LEVEL 3 · DESK",
    },
  },
  {
    username: "tchalla",
    user: {
      name: "T'Challa",
      initials: "TC",
      role: "Head of Equities",
      id: "TRD-0007",
      email: "t.challa@reactivetrader.io",
      desk: "Equities · New York",
      clearance: "LEVEL 5 · FULL",
    },
  },
  {
    username: "demo",
    user: {
      name: "Demo Operator",
      initials: "DO",
      role: "Read-Only Guest",
      id: "TRD-0000",
      email: "demo@reactivetrader.io",
      desk: "Demo · Cloud",
      clearance: "LEVEL 1 · VIEW",
    },
  },
];

export function findRosterUser(username: string): RosterEntry | undefined {
  return ROSTER.find((entry) => {
    return entry.username === username;
  });
}
