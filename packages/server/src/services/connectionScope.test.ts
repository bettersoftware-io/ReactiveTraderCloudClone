import { describe, expect, it } from "vitest";

import { scopeServicesToConnection } from "#/services/connectionScope";
import { type Caller, createServices } from "#/services/serviceContainer";

describe("scopeServicesToConnection", () => {
  it("gives each connection its own throughput while sharing every simulator (S10)", () => {
    const shared = createServices({});
    const a = scopeServicesToConnection(shared, ANN);
    const b = scopeServicesToConnection(shared, ANN);

    a.throughput.setThroughput(900);

    expect(b.throughput.getThroughput()).toBe(100);
    expect(shared.throughput.getThroughput()).toBe(100);
    expect(a.pricing).toBe(shared.pricing);
    expect(a.blotter).toBe(shared.blotter);
    expect(a.usageMeter).toBe(shared.usageMeter);
  });

  it("hands the connection its caller, and leaves the shared container without one", () => {
    const shared = createServices({});
    const scoped = scopeServicesToConnection(shared, ANN);

    expect(shared.caller).toBeNull();
    expect(scoped.caller).toBe(ANN);
  });
});

const ANN: Caller = { username: "ann", accountId: "acc-1", issuedAt: 5 };
