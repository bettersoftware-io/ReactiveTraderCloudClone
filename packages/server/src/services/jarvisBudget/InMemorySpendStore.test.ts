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

  describe("deleteOwner", () => {
    it("removes every day and both key kinds of that owner", async () => {
      const store = createInMemorySpendStore();

      await store.record("account:a", DAY, "house", 0.1);
      await store.record("account:a", "2026-10-26", "house", 0.2);
      await store.record("account:a", DAY, "own", 0.3);

      expect(await store.deleteOwner("account:a")).toBe("deleted");

      for (const day of [DAY, "2026-10-26"]) {
        for (const kind of ["house", "own"] as const) {
          expect(await store.read("account:a", day, kind)).toMatchObject({
            ownerUsd: 0,
          });
        }
      }
    });

    it("leaves other owners and the house total alone", async () => {
      const store = createInMemorySpendStore();

      await store.record("account:a", DAY, "house", 0.1);
      await store.record("account:b", DAY, "house", 0.2);
      await store.record("roster:a", DAY, "house", 0.4);
      await store.deleteOwner("account:a");

      expect(await store.read("account:b", DAY, "house")).toEqual({
        ownerUsd: 0.2,
        houseUsd: 0.7,
      });
      expect(await store.read("roster:a", DAY, "house")).toMatchObject({
        ownerUsd: 0.4,
      });
    });

    it("deletes nothing and answers deleted for an owner with no rows", async () => {
      const store = createInMemorySpendStore();

      expect(await store.deleteOwner("account:none")).toBe("deleted");
    });

    it("does not delete an owner whose key merely starts the same", async () => {
      const store = createInMemorySpendStore();

      await store.record("account:ab", DAY, "own", 0.1);
      await store.deleteOwner("account:a");

      expect(await store.read("account:ab", DAY, "own")).toMatchObject({
        ownerUsd: 0.1,
      });
    });
  });
});

const DAY = "2026-10-25";
