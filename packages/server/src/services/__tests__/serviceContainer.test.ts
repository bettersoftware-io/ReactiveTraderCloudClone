import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { createServices } from "../serviceContainer.js";

describe("createServices", () => {
  it("wires the existing FX and admin services", () => {
    const services = createServices();

    expect(services.referenceData).toBeDefined();
    expect(services.pricing).toBeDefined();
    expect(services.execution).toBeDefined();
    expect(services.blotter).toBeDefined();
    expect(services.analytics).toBeDefined();
    expect(services.instruments).toBeDefined();
    expect(services.dealers).toBeDefined();
    expect(services.workflow).toBeDefined();
    expect(services.throughput).toBeDefined();
  });

  it("wires equity marketData, orders, and positions ports", () => {
    const services = createServices();

    expect(services.marketData).toBeDefined();
    expect(services.orders).toBeDefined();
    expect(services.positions).toBeDefined();
  });

  it("subscribes to orders() and receives an emission", async () => {
    const services = createServices();

    const orders = await firstValueFrom(services.orders.orders());

    expect(Array.isArray(orders)).toBe(true);
  });

  it("subscribes to positions() and receives an emission", async () => {
    const services = createServices();

    const positions = await firstValueFrom(services.positions.positions());

    expect(Array.isArray(positions)).toBe(true);
  });
});
