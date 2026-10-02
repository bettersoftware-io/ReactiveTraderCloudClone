import { describe, expect, it } from "vitest";

import { scopeServicesToConnection } from "#/services/connectionScope";
import { createServices } from "#/services/serviceContainer";

describe("scopeServicesToConnection", () => {
  it("gives each connection its own throughput while sharing every simulator (S10)", () => {
    const shared = createServices({});
    const a = scopeServicesToConnection(shared);
    const b = scopeServicesToConnection(shared);

    a.throughput.setThroughput(900);

    expect(b.throughput.getThroughput()).toBe(100);
    expect(shared.throughput.getThroughput()).toBe(100);
    expect(a.pricing).toBe(shared.pricing);
    expect(a.blotter).toBe(shared.blotter);
    expect(a.usageMeter).toBe(shared.usageMeter);
  });
});
