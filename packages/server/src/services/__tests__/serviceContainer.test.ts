import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { createInMemorySpendStore } from "../jarvisBudget/InMemorySpendStore.js";
import type { JarvisTier } from "../jarvisBudget/jarvisTier.js";
import { utcDayOf } from "../jarvisBudget/utcDay.js";
import { type Caller, createServices } from "../serviceContainer.js";

describe("createServices", () => {
  it("wires the existing FX and ops services", () => {
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
    expect(services.jarvisBudget).toBeDefined();
    expect(services.jarvisTier).toBeDefined();
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
  it("threads an explicitly-passed env through to the budget's config: RTC_JARVIS_FORCE_GATE=exhausted is honored", async () => {
    const services = createServices({ RTC_JARVIS_FORCE_GATE: "exhausted" });

    const state = await services.jarvisBudget.stateFor(ROSTER, "operator");

    expect(state.exhausted).toBe("forced");
  });

  it("an explicit {} never picks up ambient process.env, regardless of what's actually set there", async () => {
    const services = createServices({});

    const state = await services.jarvisBudget.stateFor(MEMBER, "member");

    expect(state.exhausted).toBeNull();
    expect(state.limitUsd).toBe(0.2);
    expect(state.houseLimitUsd).toBe(3);
  });

  it("records into the spend store it is given", async () => {
    const spendStore = createInMemorySpendStore();
    const services = createServices({}, { spendStore });

    await services.jarvisBudget.stateFor(MEMBER, "member");
    services.jarvisBudget
      .meterFor(MEMBER, "member")
      .record("claude-haiku-4-5", {
        inputTokens: 100_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
    await services.jarvisBudget.stateFor(MEMBER, "member");

    await expect(
      spendStore.read("account:acc-ann", utcDayOf(Date.now()), "house"),
    ).resolves.toEqual({ ownerUsd: 0.1, houseUsd: 0.1 });
  });
});

describe("createServices — default tier lookup", () => {
  it("reads the roster persona (no account) as an operator", async () => {
    await expect(createServices({}).jarvisTier(ROSTER)).resolves.toBe(
      "operator",
    );
  });

  it("reads any account as a member until the directory-backed lookup is wired", async () => {
    await expect(createServices({}).jarvisTier(MEMBER)).resolves.toBe("member");
  });

  it("uses the tier lookup it is given", async () => {
    const services = createServices(
      {},
      {
        jarvisTier: (): Promise<JarvisTier> => {
          return Promise.resolve("operator");
        },
      },
    );

    await expect(services.jarvisTier(MEMBER)).resolves.toBe("operator");
  });
});

const MEMBER: Caller = {
  username: "ann",
  accountId: "acc-ann",
  issuedAt: null,
};

const ROSTER: Caller = { username: "demo", accountId: null, issuedAt: null };
