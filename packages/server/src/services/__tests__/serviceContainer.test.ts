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
    expect(services.serviceHealth).toBeDefined();
    expect(services.instruments).toBeDefined();
    expect(services.dealers).toBeDefined();
    expect(services.workflow).toBeDefined();
    expect(services.throughput).toBeDefined();
    expect(services.usageMeter).toBeDefined();
    expect(services.jarvisGate).toBeDefined();
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

  it("subscribes to serviceHealth.topology$() and receives an emission", async () => {
    const services = createServices();

    const topology = await firstValueFrom(services.serviceHealth.topology$());

    expect(topology).toBeDefined();
  });
});

describe("createServices — env plumbing", () => {
  it("threads an explicitly-passed env through to jarvisGate's config: RTC_JARVIS_FORCE_GATE is honored", () => {
    const services = createServices({ RTC_JARVIS_FORCE_GATE: "hard" });

    expect(services.jarvisGate.current().level).toBe("hard");
  });

  it("an explicit {} never picks up ambient process.env, regardless of what's actually set there", () => {
    const services = createServices({});

    expect(services.jarvisGate.current().level).toBe("none");
  });
});
