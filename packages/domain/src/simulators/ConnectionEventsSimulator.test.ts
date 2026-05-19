// packages/domain/src/simulators/ConnectionEventsSimulator.test.ts
import { describe, it, expect } from "vitest";
import { toArray, lastValueFrom } from "rxjs";
import type { ConnectionEvent } from "../connection/connectionStatus.js";
import { ConnectionEventsSimulator } from "./ConnectionEventsSimulator.js";

describe("ConnectionEventsSimulator", () => {
  it("emits exactly one gatewayConnected event then completes", async () => {
    const sim = new ConnectionEventsSimulator();
    const all = await lastValueFrom(sim.events().pipe(toArray()));
    expect(all).toEqual<ConnectionEvent[]>([{ type: "gatewayConnected" }]);
  });

  it("is replayable across multiple subscriptions", async () => {
    const sim = new ConnectionEventsSimulator();
    const a = await lastValueFrom(sim.events().pipe(toArray()));
    const b = await lastValueFrom(sim.events().pipe(toArray()));
    expect(a).toEqual(b);
  });
});
