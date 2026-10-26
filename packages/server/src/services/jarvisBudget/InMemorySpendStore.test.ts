import { describe, expect, it } from "vitest";

import { createInMemorySpendStore } from "./InMemorySpendStore.js";

describe("createInMemorySpendStore", () => {
  it("accumulates an owner's house spend into owner and house totals", async () => {
    const store = createInMemorySpendStore();

    await store.record("account:a", DAY, "house", 0.05);

    expect(await store.record("account:a", DAY, "house", 0.07)).toEqual({
      ownerUsd: 0.12,
      houseUsd: 0.12,
    });
  });

  it("counts a second owner's house spend toward the same house total", async () => {
    const store = createInMemorySpendStore();

    await store.record("account:a", DAY, "house", 0.12);

    expect(await store.record("roster:b", DAY, "house", 0.01)).toEqual({
      ownerUsd: 0.01,
      houseUsd: 0.13,
    });
  });

  it("leaves the house total untouched by own-key spend", async () => {
    const store = createInMemorySpendStore();

    await store.record("account:a", DAY, "house", 0.1);

    expect(await store.record("account:a", DAY, "own", 0.5)).toEqual({
      ownerUsd: 0.5,
      houseUsd: 0,
    });
    expect(await store.read("account:a", DAY, "house")).toEqual({
      ownerUsd: 0.1,
      houseUsd: 0.1,
    });
  });

  it("starts a different day from zero", async () => {
    const store = createInMemorySpendStore();

    await store.record("account:a", DAY, "house", 0.1);

    expect(await store.read("account:a", "2026-10-26", "house")).toEqual({
      ownerUsd: 0,
      houseUsd: 0,
    });
  });

  it("reads an unknown owner as zero", async () => {
    const store = createInMemorySpendStore();

    expect(await store.read("roster:nobody", DAY, "house")).toEqual({
      ownerUsd: 0,
      houseUsd: 0,
    });
  });

  it("names itself in-memory", () => {
    expect(createInMemorySpendStore().kind).toBe("in-memory");
  });
});

const DAY = "2026-10-25";
