import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { EventLogSimulator } from "./EventLogSimulator.js";

describe("EventLogSimulator", () => {
  it("emits the six PROTO seed events before live events, oldest first", async () => {
    const sim = new EventLogSimulator();
    const first6 = await firstValueFrom(sim.events$().pipe(take(6), toArray()));
    expect(
      first6.map((e) => {
        return [e.severity, e.service, e.message];
      }),
    ).toEqual([
      ["info", "kernel", "Secure enclave mounted · AES-256"],
      ["info", "execution", "Gateway handshake complete"],
      ["info", "pricing", "Subscribed 8 instruments"],
      ["error", "refdata", "Upstream timeout · retry 1/3 scheduled"],
      ["warn", "refdata", "Latency 48ms exceeds 40ms SLO"],
      ["info", "analytics", "Snapshot recomputed in 38ms"],
    ]);

    for (let i = 1; i < first6.length; i++) {
      expect(first6[i].t).toBeGreaterThanOrEqual(first6[i - 1].t);
    }

    expect(first6[0].t).toBeLessThan(Date.now());
  });
});
