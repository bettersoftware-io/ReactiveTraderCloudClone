import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Caller } from "#/services/serviceContainer.js";
import type { JarvisTokenUsage } from "#/services/UsageMeter.js";

import { createInMemorySpendStore } from "./InMemorySpendStore.js";
import { JarvisBudgetService } from "./JarvisBudgetService.js";
import type { JarvisBudgetConfig } from "./jarvisBudgetConfig.js";
import type { SpendOwner, SpendStore, SpendTotals } from "./SpendStore.js";

describe("JarvisBudgetService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("stateFor", () => {
    it("gives a fresh member the personal limit and today's reset", async () => {
      const service = createService(createInMemorySpendStore());

      await expect(service.stateFor(MEMBER, "member")).resolves.toEqual({
        spentUsd: 0,
        limitUsd: 0.2,
        houseSpentUsd: 0,
        houseLimitUsd: 3,
        exhausted: null,
        resetsAtMs: NEXT_MIDNIGHT,
      });
    });

    it("gives an operator no personal limit", async () => {
      const service = createService(createInMemorySpendStore());

      const state = await service.stateFor(OPERATOR, "operator");

      expect(state.limitUsd).toBeNull();
      expect(state.exhausted).toBeNull();
    });

    it("starts a member exhausted after a restart in the middle of a spent day", async () => {
      const store = createInMemorySpendStore();

      await store.record("account:a", TODAY, "house", 0.2);

      const state = await createService(store).stateFor(MEMBER, "member");

      expect(state.spentUsd).toBe(0.2);
      expect(state.exhausted).toBe("user");
    });

    it("exhausts member and operator alike once the house spend reaches the cap", async () => {
      const store = createInMemorySpendStore();

      await store.record("roster:someone-else", TODAY, "house", 3);

      const service = createService(store);

      expect((await service.stateFor(MEMBER, "member")).exhausted).toBe(
        "house",
      );
      expect((await service.stateFor(OPERATOR, "operator")).exhausted).toBe(
        "house",
      );
    });

    it("exhausts a member but not an operator when the personal limit is zero", async () => {
      const service = createService(createInMemorySpendStore(), {
        userDailyUsd: 0,
      });

      const member = await service.stateFor(MEMBER, "member");

      expect(member.spentUsd).toBe(0);
      expect(member.exhausted).toBe("user");
      expect((await service.stateFor(OPERATOR, "operator")).exhausted).toBe(
        null,
      );
    });

    it("forces both tiers exhausted when the gate is forced", async () => {
      const service = createService(createInMemorySpendStore(), {
        forceExhausted: true,
      });

      expect((await service.stateFor(MEMBER, "member")).exhausted).toBe(
        "forced",
      );
      expect((await service.stateFor(OPERATOR, "operator")).exhausted).toBe(
        "forced",
      );
    });

    it("fails closed when the first read cannot reach the store", async () => {
      const switchable = createSwitchableStore();

      switchable.setDown(true);

      const state = await createService(switchable.store).stateFor(
        MEMBER,
        "member",
      );

      expect(state.exhausted).toBe("unavailable");
    });

    it("fails closed when the store throws instead of answering", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {
        return undefined;
      });

      const store = createInMemorySpendStore();

      vi.spyOn(store, "read").mockRejectedValue(new Error("socket hang up"));

      const state = await createService(store).stateFor(MEMBER, "member");

      expect(state.exhausted).toBe("unavailable");
    });

    it("keys an account by its id and a roster persona by its name", async () => {
      const store = createInMemorySpendStore();
      const read = vi.spyOn(store, "read");
      const service = createService(store);

      await service.stateFor(MEMBER, "member");
      await service.stateFor(OPERATOR, "operator");

      expect(read).toHaveBeenNthCalledWith(1, "account:a", TODAY, "house");
      expect(read).toHaveBeenNthCalledWith(2, "roster:ops", TODAY, "house");
    });

    it("names the personal limit, not the house cap, when both are spent", async () => {
      const store = createInMemorySpendStore();

      await store.record("roster:someone-else", TODAY, "house", 2.8);
      await store.record("account:a", TODAY, "house", 0.2);

      const state = await createService(store).stateFor(MEMBER, "member");

      expect(state.houseSpentUsd).toBe(3);
      expect(state.exhausted).toBe("user");
    });

    it("never fills the new day's copy from a read of yesterday that answers after midnight, before the timer runs", async () => {
      vi.setSystemTime(NEXT_MIDNIGHT - 1_000);

      const inner = createInMemorySpendStore();

      await inner.record("account:a", TODAY, "house", 0.15);

      const manual = createManualStore(inner);
      const service = createService(manual.store);
      const state = service.stateFor(MEMBER, "member");

      await settle();
      // The clock passes midnight; fake timers keep the midnight timer's
      // delay, so its callback has not run.
      vi.setSystemTime(NEXT_MIDNIGHT + 10);
      await manual.release("account:a");

      await expect(state).resolves.toMatchObject({
        spentUsd: 0,
        houseSpentUsd: 0,
        resetsAtMs: NEXT_MIDNIGHT + DAY_MS,
      });
    });
  });

  describe("meterFor", () => {
    it("flips exhausted the moment a record crosses the limit, before the write lands", async () => {
      const store = createInMemorySpendStore();
      const record = vi.spyOn(store, "record");
      const service = createService(store);

      await service.stateFor(MEMBER, "member");

      const meter = service.meterFor(MEMBER, "member");

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(meter.exhausted()).toBe(false);

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(meter.exhausted()).toBe(true);
      expect(record).not.toHaveBeenCalled();

      await service.stateFor(MEMBER, "member");

      expect(record).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenCalledWith("account:a", TODAY, "house", 0.1);
      expect(await store.read("account:a", TODAY, "house")).toEqual({
        ownerUsd: 0.2,
        houseUsd: 0.2,
      });
    });

    it("replaces its copy with the totals the store answers", async () => {
      const store = createInMemorySpendStore();
      const service = createService(store);

      await service.stateFor(MEMBER, "member");

      vi.spyOn(store, "record").mockResolvedValue({
        ownerUsd: 0.5,
        houseUsd: 1.5,
      });

      service
        .meterFor(MEMBER, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      const state = await service.stateFor(MEMBER, "member");

      expect(state.spentUsd).toBe(0.5);
      expect(state.houseSpentUsd).toBe(1.5);
    });

    it("shares one total between two tabs of the same caller", async () => {
      const service = createService(createInMemorySpendStore());

      await service.stateFor(MEMBER, "member");

      const firstTab = service.meterFor(MEMBER, "member");
      const secondTab = service.meterFor(MEMBER, "member");

      firstTab.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      firstTab.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(secondTab.exhausted()).toBe(true);
    });

    it("keeps two callers' budgets apart", async () => {
      const service = createService(createInMemorySpendStore());
      const other: Caller = { ...MEMBER, accountId: "b" };

      await service.stateFor(MEMBER, "member");
      await service.stateFor(other, "member");

      const meter = service.meterFor(MEMBER, "member");

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(service.meterFor(other, "member").exhausted()).toBe(false);
      expect((await service.stateFor(other, "member")).spentUsd).toBe(0);
    });

    it("counts an operator's spend toward the house cap with no personal limit", async () => {
      const service = createService(createInMemorySpendStore(), {
        houseDailyUsd: 0.2,
      });

      await service.stateFor(OPERATOR, "operator");

      const meter = service.meterFor(OPERATOR, "operator");

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(meter.exhausted()).toBe(false);

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(meter.exhausted()).toBe(true);
      expect((await service.stateFor(OPERATOR, "operator")).exhausted).toBe(
        "house",
      );
      expect(service.houseToday()).toEqual({ spentUsd: 0.2, limitUsd: 0.2 });
    });

    it("fails closed after a write the store could not take, until a read succeeds", async () => {
      const switchable = createSwitchableStore();
      const service = createService(switchable.store);

      await service.stateFor(MEMBER, "member");
      switchable.setDown(true);

      const meter = service.meterFor(MEMBER, "member");

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      const down = await service.stateFor(MEMBER, "member");

      expect(down.exhausted).toBe("unavailable");
      // Spent all the same: the copy keeps counting what the store missed.
      expect(down.spentUsd).toBe(0.1);
      expect(service.houseToday().spentUsd).toBe(0.1);
      expect(meter.exhausted()).toBe(true);

      switchable.setDown(false);

      expect((await service.stateFor(MEMBER, "member")).exhausted).toBeNull();
      expect(meter.exhausted()).toBe(false);
    });

    it("stays closed when a write sent before an outage answers after it", async () => {
      const manual = createManualStore();
      const service = createService(manual.store);
      const other: Caller = { ...MEMBER, accountId: "b" };

      await loadBoth(service, manual, other);

      // B's write reaches the store while it is up…
      service
        .meterFor(other, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await settle();
      manual.setDown(true);
      // …then A's write fails.
      service
        .meterFor(MEMBER, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await manual.release("account:a");

      expect(service.meterFor(MEMBER, "member").exhausted()).toBe(true);

      // B's success answers late; it proves nothing about the store now.
      await manual.release("account:b");

      expect(service.meterFor(other, "member").exhausted()).toBe(true);

      manual.setDown(false);

      const lifted = service.stateFor(other, "member");

      await manual.release("account:b");

      expect((await lifted).exhausted).toBeNull();
    });

    it("keeps the highest house total when two owners' answers return out of order", async () => {
      const manual = createManualStore();
      const service = createService(manual.store);
      const other: Caller = { ...MEMBER, accountId: "b" };

      await loadBoth(service, manual, other);

      // The store takes A's write, then B's: house 0.1, then 0.2.
      service
        .meterFor(MEMBER, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      service
        .meterFor(other, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await settle();
      // B's answer (house 0.2) arrives before A's (house 0.1).
      await manual.release("account:b");
      await manual.release("account:a");

      expect(service.houseToday().spentUsd).toBe(0.2);
    });

    it("never records a negative or non-finite cost", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {
        return undefined;
      });
      const store = createInMemorySpendStore();
      const record = vi.spyOn(store, "record");
      const service = createService(store);

      await service.stateFor(MEMBER, "member");

      const meter = service.meterFor(MEMBER, "member");

      meter.record("claude-haiku-4-5", {
        ...TEN_CENTS_ON_HAIKU,
        outputTokens: Number.NaN,
      });
      meter.record("claude-haiku-4-5", {
        ...TEN_CENTS_ON_HAIKU,
        outputTokens: -1_000_000,
      });

      expect(record).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(2);
      expect((await service.stateFor(MEMBER, "member")).spentUsd).toBe(0);
    });

    it("serializes one owner's writes so they land in order and sum", async () => {
      const calls: string[] = [];
      const store = createDelayedStore(calls);
      const service = createService(store);
      const loaded = service.stateFor(MEMBER, "member");

      await vi.advanceTimersByTimeAsync(STORE_DELAY_MS);
      await loaded;

      const meter = service.meterFor(MEMBER, "member");

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      const settled = service.stateFor(MEMBER, "member");

      await vi.advanceTimersByTimeAsync(2 * STORE_DELAY_MS);

      expect(calls).toEqual([
        "read start",
        "read end",
        "record start",
        "record end",
        "record start",
        "record end",
      ]);
      expect((await settled).spentUsd).toBe(0.2);
    });

    it("drops a write that lands after midnight from the new day's copy", async () => {
      vi.setSystemTime(NEXT_MIDNIGHT - STORE_DELAY_MS / 2);

      // Yesterday's earlier spend makes the late answer's totals differ from
      // the amount booked, so applying it to the new day would show.
      const inner = createInMemorySpendStore();

      await inner.record("account:a", TODAY, "house", 0.05);

      const service = createService(createDelayedStore([], inner));
      const loaded = service.stateFor(MEMBER, "member");

      await vi.advanceTimersByTimeAsync(1);

      service
        .meterFor(MEMBER, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await vi.advanceTimersByTimeAsync(2 * STORE_DELAY_MS);
      await loaded;

      const state = service.stateFor(MEMBER, "member");

      await vi.advanceTimersByTimeAsync(STORE_DELAY_MS);

      expect((await state).spentUsd).toBe(0);
      expect(service.houseToday().spentUsd).toBe(0);
    });
  });

  describe("changes$", () => {
    it("emits on every record", async () => {
      const service = createService(createInMemorySpendStore());
      const emissions = countEmissions(service);

      await service.stateFor(MEMBER, "member");

      const meter = service.meterFor(MEMBER, "member");

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(emissions.count).toBe(1);

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(emissions.count).toBe(2);
    });

    it("emits when the store goes down and again when it comes back", async () => {
      const switchable = createSwitchableStore();
      const service = createService(switchable.store);
      const emissions = countEmissions(service);

      await service.stateFor(MEMBER, "member");

      expect(emissions.count).toBe(0);

      switchable.setDown(true);
      await service.stateFor(OPERATOR, "operator");

      expect(emissions.count).toBe(1);

      await service.stateFor(OPERATOR, "operator");

      expect(emissions.count).toBe(1);

      switchable.setDown(false);
      await service.stateFor(OPERATOR, "operator");

      expect(emissions.count).toBe(2);
    });

    it("emits once at each UTC midnight and starts the new day from the store", async () => {
      const service = createService(createInMemorySpendStore());

      await service.stateFor(MEMBER, "member");

      const meter = service.meterFor(MEMBER, "member");

      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      meter.record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      expect((await service.stateFor(MEMBER, "member")).exhausted).toBe("user");

      const emissions = countEmissions(service);

      await vi.advanceTimersByTimeAsync(NEXT_MIDNIGHT - NOON - 1);

      expect(emissions.count).toBe(0);

      await vi.advanceTimersByTimeAsync(1);

      expect(emissions.count).toBe(1);
      expect(service.houseToday().spentUsd).toBe(0);
      await expect(service.stateFor(MEMBER, "member")).resolves.toMatchObject({
        spentUsd: 0,
        exhausted: null,
        resetsAtMs: NEXT_MIDNIGHT + DAY_MS,
      });

      await vi.advanceTimersByTimeAsync(DAY_MS);

      expect(emissions.count).toBe(2);
    });

    it("re-arms for the real midnight when the timer fires early", async () => {
      const service = createService(createInMemorySpendStore());
      const emissions = countEmissions(service);

      // A clock step back: the timer keeps its delay, so it now fires one
      // second before midnight.
      vi.setSystemTime(NOON - 1_000);
      await vi.advanceTimersByTimeAsync(NEXT_MIDNIGHT - NOON);

      expect(Date.now()).toBe(NEXT_MIDNIGHT - 1_000);
      expect(emissions.count).toBe(1);

      await vi.advanceTimersByTimeAsync(1_000);

      expect(emissions.count).toBe(2);
      expect(service.houseToday().spentUsd).toBe(0);
    });

    it("stops the midnight timer and completes on dispose", async () => {
      const service = createService(createInMemorySpendStore());
      const emissions = countEmissions(service);

      service.dispose();
      await vi.advanceTimersByTimeAsync(NEXT_MIDNIGHT - NOON);

      expect(emissions.count).toBe(0);
      expect(emissions.completed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

const NOON = Date.UTC(2026, 9, 25, 12);
const NEXT_MIDNIGHT = Date.UTC(2026, 9, 26);
const DAY_MS = 86_400_000;
const TODAY = "2026-10-25";
const STORE_DELAY_MS = 100;

const MEMBER: Caller = { username: "ada", accountId: "a", issuedAt: null };
const OPERATOR: Caller = { username: "ops", accountId: null, issuedAt: null };

/** 20k output tokens on Haiku at $5/Mtok: exactly $0.10. */
const TEN_CENTS_ON_HAIKU: JarvisTokenUsage = {
  inputTokens: 0,
  outputTokens: 20_000,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

function createService(
  store: SpendStore,
  config: Partial<JarvisBudgetConfig> = {},
): JarvisBudgetService {
  return new JarvisBudgetService({
    store,
    config: {
      userDailyUsd: 0.2,
      houseDailyUsd: 3,
      forceExhausted: false,
      ...config,
    },
  });
}

interface EmissionCount {
  readonly count: number;
  readonly completed: boolean;
}

function countEmissions(service: JarvisBudgetService): EmissionCount {
  const tally = { count: 0, completed: false };

  service.changes$.subscribe({
    next: () => {
      tally.count += 1;
    },
    complete: () => {
      tally.completed = true;
    },
  });

  return tally;
}

interface SwitchableStore {
  readonly store: SpendStore;
  setDown(down: boolean): void;
}

/** An in-memory store that answers `"unavailable"` while switched down. */
function createSwitchableStore(): SwitchableStore {
  const inner = createInMemorySpendStore();
  let down = false;

  return {
    store: {
      kind: "in-memory",
      read: (...args: Parameters<SpendStore["read"]>): SpendAnswer => {
        return down ? Promise.resolve("unavailable") : inner.read(...args);
      },
      record: (...args: Parameters<SpendStore["record"]>): SpendAnswer => {
        return down ? Promise.resolve("unavailable") : inner.record(...args);
      },
    },
    setDown: (value: boolean): void => {
      down = value;
    },
  };
}

/** A store (in-memory unless given) whose every answer takes
 * `STORE_DELAY_MS` of fake time, logging when each call starts and ends. */
function createDelayedStore(
  calls: string[],
  inner: SpendStore = createInMemorySpendStore(),
): SpendStore {
  function delay(name: string, answer: () => SpendAnswer): SpendAnswer {
    calls.push(`${name} start`);

    return new Promise((resolve) => {
      setTimeout(() => {
        calls.push(`${name} end`);
        resolve(answer());
      }, STORE_DELAY_MS);
    });
  }

  return {
    kind: "in-memory",
    read: (...args: Parameters<SpendStore["read"]>): SpendAnswer => {
      return delay("read", () => {
        return inner.read(...args);
      });
    },
    record: (...args: Parameters<SpendStore["record"]>): SpendAnswer => {
      return delay("record", () => {
        return inner.record(...args);
      });
    },
  };
}

type SpendAnswer = Promise<SpendTotals | "unavailable">;

interface HeldAnswer {
  readonly owner: SpendOwner;
  readonly deliver: () => void;
}

interface ManualStore {
  readonly store: SpendStore;
  setDown(down: boolean): void;
  /** Delivers the owner's oldest held answer and lets the service take it. */
  release(owner: SpendOwner): Promise<void>;
}

/** A store that does each call at once, so its totals follow call order
 * (`"unavailable"` while switched down), but holds every answer until the
 * test releases it — the way to stage answers arriving out of order. */
function createManualStore(
  inner: SpendStore = createInMemorySpendStore(),
): ManualStore {
  const held: HeldAnswer[] = [];
  let down = false;

  function hold(owner: SpendOwner, answer: SpendAnswer): SpendAnswer {
    return new Promise((resolve) => {
      held.push({
        owner,
        deliver: () => {
          resolve(answer);
        },
      });
    });
  }

  return {
    store: {
      kind: "in-memory",
      read: (...args: Parameters<SpendStore["read"]>): SpendAnswer => {
        return hold(
          args[0],
          down ? Promise.resolve("unavailable") : inner.read(...args),
        );
      },
      record: (...args: Parameters<SpendStore["record"]>): SpendAnswer => {
        return hold(
          args[0],
          down ? Promise.resolve("unavailable") : inner.record(...args),
        );
      },
    },
    setDown: (value: boolean): void => {
      down = value;
    },
    release: async (owner: SpendOwner): Promise<void> => {
      await settle();

      const index = held.findIndex((call) => {
        return call.owner === owner;
      });

      if (index === -1) {
        throw new Error(`no held store call for ${owner}`);
      }

      held.splice(index, 1)[0]?.deliver();
      await settle();
    },
  };
}

/** Lets queued promise work run without moving the fake clock. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

async function loadBoth(
  service: JarvisBudgetService,
  manual: ManualStore,
  other: Caller,
): Promise<void> {
  const loadedA = service.stateFor(MEMBER, "member");
  const loadedB = service.stateFor(other, "member");

  await manual.release("account:a");
  await manual.release("account:b");
  await Promise.all([loadedA, loadedB]);
}
