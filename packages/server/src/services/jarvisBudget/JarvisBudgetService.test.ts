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

  describe("meterFor — in-flight reservations", () => {
    it("a request in flight on one meter exhausts another meter of the same member it would push past the limit, but not its own", async () => {
      const store = createInMemorySpendStore();
      await store.record("account:a", TODAY, "house", 0.15);
      const service = createService(store);
      await service.stateFor(MEMBER, "member");
      const first = service.meterFor(MEMBER, "member");
      const second = service.meterFor(MEMBER, "member");

      expect(second.exhausted()).toBe(false);

      // Sonnet's worst case: $0.03 input + $0.04096 output.
      first.beginRequest("claude-sonnet-5", SONNET_CEILING);

      expect(second.exhausted()).toBe(true);
      expect(first.exhausted()).toBe(false);
      // A reservation is not spend: the budget the person sees is unchanged.
      expect((await service.stateFor(MEMBER, "member")).spentUsd).toBe(0.15);
    });

    it("booking the request releases its reservation, leaving only what it cost", async () => {
      const store = createInMemorySpendStore();
      await store.record("account:a", TODAY, "house", 0.15);
      const service = createService(store);
      await service.stateFor(MEMBER, "member");
      const first = service.meterFor(MEMBER, "member");
      const second = service.meterFor(MEMBER, "member");

      first.beginRequest("claude-sonnet-5", SONNET_CEILING);
      first.record("claude-haiku-4-5", ONE_CENT_ON_HAIKU);

      expect(second.exhausted()).toBe(false);
    });

    it("endRequest releases a reservation whose request never happened", async () => {
      const store = createInMemorySpendStore();
      await store.record("account:a", TODAY, "house", 0.15);
      const service = createService(store);
      await service.stateFor(MEMBER, "member");
      const first = service.meterFor(MEMBER, "member");
      const second = service.meterFor(MEMBER, "member");

      first.beginRequest("claude-sonnet-5", SONNET_CEILING);
      first.endRequest();

      expect(second.exhausted()).toBe(false);
    });

    it("the house cap counts other owners' in-flight requests", async () => {
      const store = createInMemorySpendStore();
      await store.record("roster:someone-else", TODAY, "house", 0.95);
      const service = createService(store, { houseDailyUsd: 1 });
      await service.stateFor(MEMBER, "member");
      await service.stateFor(OPERATOR, "operator");
      const operatorMeter = service.meterFor(OPERATOR, "operator");
      const memberMeter = service.meterFor(MEMBER, "member");

      expect(memberMeter.exhausted()).toBe(false);

      operatorMeter.beginRequest("claude-sonnet-5", SONNET_CEILING);

      expect(memberMeter.exhausted()).toBe(true);
      expect(operatorMeter.exhausted()).toBe(false);

      operatorMeter.endRequest();

      expect(memberMeter.exhausted()).toBe(false);
    });

    it("a meter holds one reservation at a time: beginning again replaces it", async () => {
      const service = createService(createInMemorySpendStore(), {
        houseDailyUsd: 0.12,
      });
      await service.stateFor(OPERATOR, "operator");
      const first = service.meterFor(OPERATOR, "operator");
      const second = service.meterFor(OPERATOR, "operator");

      first.beginRequest("claude-sonnet-5", SONNET_CEILING);
      first.beginRequest("claude-sonnet-5", SONNET_CEILING);

      // One $0.07096 reservation fits under $0.12; two stacked ($0.14192) would not.
      expect(second.exhausted()).toBe(false);
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

    it("still counts a write the store could not take once a read replaces the copy, and writes it again", async () => {
      const inner = createInMemorySpendStore();
      const switchable = createSwitchableStore(inner);
      const record = vi.spyOn(switchable.store, "record");
      const service = createService(switchable.store);

      await service.stateFor(MEMBER, "member");
      switchable.setDown(true);
      service
        .meterFor(MEMBER, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await settle();
      switchable.setDown(false);

      // The store's figure leaves the failed write out; the copy adds it.
      const recovered = await service.stateFor(MEMBER, "member");

      expect(recovered.spentUsd).toBe(0.1);
      expect(recovered.exhausted).toBeNull();
      expect(service.houseToday().spentUsd).toBe(0.1);

      await settle();

      expect(record).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenLastCalledWith("account:a", TODAY, "house", 0.1);
      await expect(inner.read("account:a", TODAY, "house")).resolves.toEqual({
        ownerUsd: 0.1,
        houseUsd: 0.1,
      });
    });

    it("writes a failed amount again once, and counts it once after it lands", async () => {
      const switchable = createSwitchableStore();
      const record = vi.spyOn(switchable.store, "record");
      const service = createService(switchable.store);

      await service.stateFor(MEMBER, "member");
      switchable.setDown(true);
      service
        .meterFor(MEMBER, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await settle();
      switchable.setDown(false);
      await service.stateFor(MEMBER, "member");
      await settle();

      // A second outage and recovery: nothing is left to write again.
      switchable.setDown(true);
      await service.stateFor(OPERATOR, "operator");
      switchable.setDown(false);
      await service.stateFor(MEMBER, "member");
      await settle();

      expect(record).toHaveBeenCalledTimes(2);
      expect((await service.stateFor(MEMBER, "member")).spentUsd).toBe(0.1);
      expect(service.houseToday().spentUsd).toBe(0.1);
    });

    it("keeps a failed amount counted when its retry fails too, and writes it on the next recovery", async () => {
      // Reads answer throughout; only writes fail while switched down.
      const inner = createInMemorySpendStore();
      const writes = createSwitchableStore(inner);
      const store: SpendStore = { ...writes.store, read: inner.read };
      const service = createService(store);

      await service.stateFor(MEMBER, "member");
      writes.setDown(true);
      service
        .meterFor(MEMBER, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await settle();
      // The read that lifts the outage queues the retry, which fails.
      await service.stateFor(MEMBER, "member");
      await settle();

      // Read without a store call: the failed retry closed the store again,
      // and the amount is still spent.
      expect(service.meterFor(MEMBER, "member").exhausted()).toBe(true);
      expect(service.houseToday().spentUsd).toBe(0.1);

      writes.setDown(false);
      await service.stateFor(MEMBER, "member");
      await settle();

      await expect(inner.read("account:a", TODAY, "house")).resolves.toEqual({
        ownerUsd: 0.1,
        houseUsd: 0.1,
      });
      await expect(service.stateFor(MEMBER, "member")).resolves.toMatchObject({
        spentUsd: 0.1,
        exhausted: null,
      });
    });

    it("writes a failed amount once when the store recovers twice before the retry runs", async () => {
      const inner = createInMemorySpendStore();
      const manual = createManualStore(inner);
      const record = vi.spyOn(manual.store, "record");
      const service = createService(manual.store);
      const other: Caller = { ...MEMBER, accountId: "b" };

      await loadBoth(service, manual, other);
      manual.setDown(true);
      service
        .meterFor(MEMBER, "member")
        .record("claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await manual.release("account:a");
      manual.setDown(false);

      // A's read holds A's queue while B's calls flap the store: up (a retry
      // queued behind the read), down, up again (a second one queued).
      const heldRead = service.stateFor(MEMBER, "member");
      const firstLift = service.stateFor(other, "member");

      await manual.release("account:b");
      await firstLift;
      manual.setDown(true);
      service
        .meterFor(other, "member")
        .record("claude-haiku-4-5", ONE_CENT_ON_HAIKU);
      await manual.release("account:b");
      manual.setDown(false);

      const secondLift = service.stateFor(other, "member");

      await manual.release("account:b");
      await secondLift;
      await manual.release("account:a");
      await heldRead;
      // The first retry writes the amount; the second finds nothing left.
      await manual.release("account:a");

      expect(
        record.mock.calls.filter(([owner]) => {
          return owner === "account:a";
        }),
      ).toHaveLength(2);
      // The house total also holds B's cent, written again on B's recovery.
      await expect(inner.read("account:a", TODAY, "house")).resolves.toEqual({
        ownerUsd: 0.1,
        houseUsd: 0.11,
      });
      expect((await service.stateFor(MEMBER, "member")).spentUsd).toBe(0.1);
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

  describe("own-key spend", () => {
    it("a meter reads the cap each time it is asked, so a lowered cap counts at once", async () => {
      const service = createService(createInMemorySpendStore());
      let capUsd: number | null = 1;
      const meter = service.ownMeterFor(MEMBER, (): number | null => {
        return capUsd;
      });

      await service.ownStateFor(MEMBER, 1);
      meter.record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(meter.exhausted()).toBe(false);

      capUsd = 0.05;

      expect(meter.exhausted()).toBe(true);

      capUsd = null;

      expect(meter.exhausted()).toBe(false);
    });

    it("own spend does not count toward the house total or the person's house budget", async () => {
      const store = createInMemorySpendStore();
      const service = createService(store);

      await service.stateFor(MEMBER, "member");
      await service.ownStateFor(MEMBER, null);
      service
        .ownMeterFor(MEMBER, capOf(null))
        .record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await service.ownStateFor(MEMBER, null);

      const house = await service.stateFor(MEMBER, "member");

      expect(house.spentUsd).toBe(0);
      expect(house.houseSpentUsd).toBe(0);
      expect(house.exhausted).toBeNull();
      expect(service.houseToday().spentUsd).toBe(0);
      expect(await store.read("account:a", TODAY, "own")).toEqual({
        ownerUsd: 0.1,
        houseUsd: 0,
      });
    });

    it("an own spend that comes back with a zero house total leaves the house copy alone", async () => {
      const store = createInMemorySpendStore();

      await store.record("roster:other", TODAY, "house", 1);

      const service = createService(store);

      await service.stateFor(MEMBER, "member");
      await service.ownStateFor(MEMBER, null);
      service
        .ownMeterFor(MEMBER, capOf(null))
        .record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await service.ownStateFor(MEMBER, null);

      expect(service.houseToday().spentUsd).toBe(1);
    });

    it("an own cap of 1 is exhausted at 1, and reserves like a house budget", async () => {
      const service = createService(createInMemorySpendStore());

      await service.ownStateFor(MEMBER, 1);

      const first = service.ownMeterFor(MEMBER, capOf(1));
      const second = service.ownMeterFor(MEMBER, capOf(1));

      // 0.1 on Haiku, ten times: exactly 1.
      for (let i = 0; i < 9; i += 1) {
        first.record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      }

      expect(second.exhausted()).toBe(false);

      // A Sonnet worst case ($0.07096) in flight: 0.9 + 0.07096 < 1 still fits.
      first.beginRequest("own:anthropic:claude-sonnet-5", SONNET_CEILING);

      expect(second.exhausted()).toBe(false);

      second.beginRequest("own:anthropic:claude-opus-5", SONNET_CEILING);

      // The other meter's reservation now pushes this one past the cap.
      expect(first.exhausted()).toBe(true);

      second.endRequest();
      first.endRequest();
      first.record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(second.exhausted()).toBe(true);
      expect(await service.ownStateFor(MEMBER, 1)).toMatchObject({
        spentUsd: 1,
        limitUsd: 1,
        exhausted: "user",
      });
    });

    it("own reservations do not count against the house cap", async () => {
      const service = createService(createInMemorySpendStore(), {
        houseDailyUsd: 0.05,
      });

      await service.stateFor(OPERATOR, "operator");
      await service.ownStateFor(MEMBER, null);

      const houseMeter = service.meterFor(OPERATOR, "operator");

      service
        .ownMeterFor(MEMBER, capOf(null))
        .beginRequest("own:anthropic:claude-sonnet-5", SONNET_CEILING);

      expect(houseMeter.exhausted()).toBe(false);
    });

    it("no limit is never exhausted, and spend is still recorded", async () => {
      const store = createInMemorySpendStore();
      const service = createService(store);

      await service.ownStateFor(MEMBER, null);

      const meter = service.ownMeterFor(MEMBER, capOf(null));

      for (let i = 0; i < 20; i += 1) {
        meter.record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      }

      expect(meter.exhausted()).toBe(false);
      expect(await service.ownStateFor(MEMBER, null)).toEqual({
        spentUsd: 2,
        limitUsd: null,
        exhausted: null,
        resetsAtMs: NEXT_MIDNIGHT,
      });
      // The store holds it too: the figure above could be the in-process
      // copy alone.
      expect(await store.read("account:a", TODAY, "own")).toEqual({
        ownerUsd: 2,
        houseUsd: 0,
      });
    });

    it("forceExhausted does not apply to own keys", async () => {
      const service = createService(createInMemorySpendStore(), {
        forceExhausted: true,
      });

      expect((await service.ownStateFor(MEMBER, 1)).exhausted).toBeNull();
      expect(service.ownMeterFor(MEMBER, capOf(1)).exhausted()).toBe(false);
    });

    it('with a cap, a failing store reads as exhausted "unavailable"; with no limit it does not', async () => {
      const switchable = createSwitchableStore();
      const service = createService(switchable.store);

      switchable.setDown(true);

      expect(await service.ownStateFor(MEMBER, 1)).toMatchObject({
        exhausted: "unavailable",
      });
      expect(service.ownMeterFor(MEMBER, capOf(1)).exhausted()).toBe(true);
      expect(await service.ownStateFor(MEMBER, null)).toMatchObject({
        exhausted: null,
      });
      expect(service.ownMeterFor(MEMBER, capOf(null)).exhausted()).toBe(false);
    });

    it("an own write the store refused is counted and sent again once it answers", async () => {
      const switchable = createSwitchableStore();
      const service = createService(switchable.store);

      await service.ownStateFor(MEMBER, null);
      switchable.setDown(true);
      service
        .ownMeterFor(MEMBER, capOf(null))
        .record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await settle();

      expect((await service.ownStateFor(MEMBER, null)).spentUsd).toBe(0.1);

      switchable.setDown(false);
      await service.ownStateFor(MEMBER, null);
      await settle();

      expect(await switchable.store.read("account:a", TODAY, "own")).toEqual({
        ownerUsd: 0.1,
        houseUsd: 0,
      });
      expect((await service.ownStateFor(MEMBER, null)).spentUsd).toBe(0.1);
    });

    it("own spend resets at 00:00 UTC", async () => {
      const service = createService(createInMemorySpendStore());

      await service.ownStateFor(MEMBER, 0.1);
      service
        .ownMeterFor(MEMBER, capOf(0.1))
        .record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect((await service.ownStateFor(MEMBER, 0.1)).exhausted).toBe("user");

      await vi.advanceTimersByTimeAsync(NEXT_MIDNIGHT - NOON);

      expect(await service.ownStateFor(MEMBER, 0.1)).toEqual({
        spentUsd: 0,
        limitUsd: 0.1,
        exhausted: null,
        resetsAtMs: NEXT_MIDNIGHT + DAY_MS,
      });
    });

    it("a restart reloads own spend from the store", async () => {
      const store = createInMemorySpendStore();

      await store.record("account:a", TODAY, "own", 0.4);

      const state = await createService(store).ownStateFor(MEMBER, 0.4);

      expect(state.spentUsd).toBe(0.4);
      expect(state.exhausted).toBe("user");
    });

    it("an own request in flight is not house spend, before or after the store answers", async () => {
      const store = createDelayedStore([]);
      const service = createService(store);
      const loaded = service.ownStateFor(MEMBER, null);

      await vi.advanceTimersByTimeAsync(STORE_DELAY_MS);
      await loaded;

      service
        .ownMeterFor(MEMBER, capOf(null))
        .record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      expect(service.houseToday().spentUsd).toBe(0);

      await vi.advanceTimersByTimeAsync(STORE_DELAY_MS);

      expect(service.houseToday().spentUsd).toBe(0);
    });

    it("an own write the store refused is not house spend, nor is its resend", async () => {
      const switchable = createSwitchableStore();
      const service = createService(switchable.store);

      await service.ownStateFor(MEMBER, null);
      switchable.setDown(true);
      service
        .ownMeterFor(MEMBER, capOf(null))
        .record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);
      await settle();

      expect(service.houseToday().spentUsd).toBe(0);

      switchable.setDown(false);
      await service.ownStateFor(MEMBER, null);
      await settle();

      expect(service.houseToday().spentUsd).toBe(0);
    });

    it("one person's own request in flight does not count against their house budget, nor the reverse", async () => {
      const service = createService(createInMemorySpendStore(), {
        userDailyUsd: 0.05,
      });

      await service.stateFor(MEMBER, "member");
      await service.ownStateFor(MEMBER, 0.05);

      const houseMeter = service.meterFor(MEMBER, "member");
      const ownMeter = service.ownMeterFor(MEMBER, capOf(0.05));

      // A Sonnet worst case ($0.07096) is over either $0.05 budget.
      ownMeter.beginRequest("own:anthropic:claude-sonnet-5", SONNET_CEILING);

      expect(houseMeter.exhausted()).toBe(false);

      ownMeter.endRequest();
      houseMeter.beginRequest("claude-sonnet-5", SONNET_CEILING);

      expect(ownMeter.exhausted()).toBe(false);
    });

    it("a slow own write does not hold up the same person's house calls", async () => {
      const calls: string[] = [];
      const service = createService(createDelayedStore(calls));
      const loaded = service.ownStateFor(MEMBER, null);

      await vi.advanceTimersByTimeAsync(STORE_DELAY_MS);
      await loaded;

      service
        .ownMeterFor(MEMBER, capOf(null))
        .record("own:anthropic:claude-haiku-4-5", TEN_CENTS_ON_HAIKU);

      const houseState = service.stateFor(MEMBER, "member");

      await vi.advanceTimersByTimeAsync(0);

      // The house read started while the own write was still out.
      expect(calls).toEqual([
        "read start",
        "read end",
        "record start",
        "read start",
      ]);

      await vi.advanceTimersByTimeAsync(STORE_DELAY_MS);
      await houseState;
    });

    it("keeps the house and own copies of one person apart", async () => {
      const store = createInMemorySpendStore();
      const read = vi.spyOn(store, "read");
      const service = createService(store);

      await service.stateFor(MEMBER, "member");
      await service.ownStateFor(MEMBER, 1);

      expect(read).toHaveBeenNthCalledWith(1, "account:a", TODAY, "house");
      expect(read).toHaveBeenNthCalledWith(2, "account:a", TODAY, "own");
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

/** The worst case one request is reserved at (15k input tokens, the
 * per-request output cap); on Sonnet $0.07096. */
const SONNET_CEILING: JarvisTokenUsage = {
  inputTokens: 15_000,
  outputTokens: 4_096,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

const ONE_CENT_ON_HAIKU: JarvisTokenUsage = {
  inputTokens: 10_000,
  outputTokens: 0,
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

/** A store (in-memory unless given) that answers `"unavailable"` while
 * switched down. */
function createSwitchableStore(
  inner: SpendStore = createInMemorySpendStore(),
): SwitchableStore {
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
/** A cap that never moves. */
function capOf(usd: number | null): () => number | null {
  return (): number | null => {
    return usd;
  };
}

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
