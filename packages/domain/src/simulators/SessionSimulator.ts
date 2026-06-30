import { concat, defer, interval, type Observable, of } from "rxjs";
import { map } from "rxjs/operators";

import type { SessionsPort } from "../ports/sessionsPort.js";
import { mulberry32 } from "../telemetry/prng.js";
import type { SessionInfo } from "../telemetry/session.js";

const USERS: readonly string[] = [
  "alice",
  "bob",
  "carol",
  "dave",
  "eve",
  "frank",
  "grace",
  "hal",
];

const REGIONS: readonly string[] = [
  "us-east",
  "eu-west",
  "ap-south",
  "us-west",
  "eu-central",
];

export class SessionSimulator implements SessionsPort {
  private readonly sessions: readonly SessionInfo[];

  constructor(seed = 5) {
    const rng = mulberry32(seed);
    const sessions: SessionInfo[] = [];

    for (let i = 0; i < 4; i++) {
      const userIdx = Math.floor(rng() * USERS.length);
      const regionIdx = Math.floor(rng() * REGIONS.length);
      const lat = (rng() - 0.5) * 180; // -90 to 90
      const lon = (rng() - 0.5) * 360; // -180 to 180
      const hexSuffix = Math.floor(rng() * 0x10000)
        .toString(16)
        .padStart(4, "0");
      sessions.push({
        id: `sess-${hexSuffix}`,
        user: USERS[userIdx] ?? "unknown",
        region: REGIONS[regionIdx] ?? "us-east",
        lat,
        lon,
      });
    }

    this.sessions = sessions;
  }

  sessions$(): Observable<readonly SessionInfo[]> {
    return defer(() => {
      return concat(
        of(this.sessions),
        interval(5_000).pipe(
          map(() => {
            return this.sessions;
          }),
        ),
      );
    });
  }
}
