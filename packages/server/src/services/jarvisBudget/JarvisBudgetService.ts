import { type Observable, Subject } from "rxjs";

import type { JarvisBrain } from "@rtc/domain";

import type { Caller } from "#/services/serviceContainer.js";
import {
  estimateUsageCostUsd,
  type JarvisTokenUsage,
} from "#/services/UsageMeter.js";

import type { JarvisBudgetConfig } from "./jarvisBudgetConfig.js";
import type { JarvisTier } from "./jarvisTier.js";
import type { SpendOwner, SpendStore, SpendTotals } from "./SpendStore.js";
import { nextUtcMidnightMs, utcDayOf } from "./utcDay.js";

/** Why house turns are off: the caller's own daily limit, the house-wide
 * cap, a store that cannot be read or written (fail closed), or
 * `RTC_JARVIS_FORCE_GATE=exhausted`. */
export type BudgetExhaustion = "user" | "house" | "unavailable" | "forced";

export interface BudgetState {
  /** The caller's house-key spend today, USD. */
  readonly spentUsd: number;
  /** The caller's daily limit; null for an operator, who has none. */
  readonly limitUsd: number | null;
  readonly houseSpentUsd: number;
  readonly houseLimitUsd: number;
  readonly exhausted: BudgetExhaustion | null;
  /** The next 00:00 UTC, when the day's spend starts over. */
  readonly resetsAtMs: number;
}

/**
 * One turn's view of the budget. `record` books a model request's cost;
 * `exhausted` is checked before every request, so it is synchronous over the
 * service's in-process copy and sees a record the instant it is made.
 */
export interface TurnMeter {
  record(
    brain: Exclude<JarvisBrain, "scripted">,
    usage: JarvisTokenUsage,
  ): void;
  exhausted(): boolean;
}

export interface HouseSpendToday {
  readonly spentUsd: number;
  readonly limitUsd: number;
}

export interface JarvisBudgetServiceDeps {
  readonly store: SpendStore;
  readonly config: JarvisBudgetConfig;
  readonly now?: () => number;
}

/** A store answer with the sequence number its call started under. */
interface StoreReply {
  readonly answer: SpendTotals | "unavailable";
  readonly seq: number;
}

/** One owner's house-key spend for the copy's day. */
interface OwnerCopy {
  /** The store's latest answer for the owner's day total. */
  confirmedUsd: number;
  /** Booked here, not yet answered by the store. Counting it at once is what
   * lets a second request in the same turn see the first one's cost. */
  pendingUsd: number;
  /** A read or write answer for this owner has landed today. */
  loaded: boolean;
}

/**
 * Per-person daily Jarvis spend on the house key (spec §3), over a durable
 * `SpendStore` so a restart never resets a budget.
 *
 * Reads go to the store once per owner per day — at `stateFor`, which every
 * turn calls first — and after that an in-process copy answers, kept current
 * by every record and replaced by every answer the store gives. Fly runs one
 * machine, so the copy and the table agree. Each owner's store calls run one
 * at a time in order, so the last write's totals are the ones that stand and
 * a `stateFor` sees every write booked before it.
 *
 * Fails closed: once any read or write answers `"unavailable"`, every caller
 * is exhausted with that reason until a later read succeeds.
 */
export class JarvisBudgetService {
  readonly changes$: Observable<void>;

  private readonly store: SpendStore;

  private readonly config: JarvisBudgetConfig;

  private readonly now: () => number;

  private readonly changes = new Subject<void>();

  /** The UTC day every copy below belongs to. */
  private copyDay: string;

  private readonly owners = new Map<SpendOwner, OwnerCopy>();

  /** The house total only ever rises within a day, so the highest answer
   * wins: two owners' writes can come back out of order. */
  private houseConfirmedUsd = 0;

  private housePendingUsd = 0;

  private storeAvailable = true;

  /** Numbers each store call as it starts. Answers arrive in any order, so
   * only a success that STARTED after the latest failure proves the store is
   * back; a write sent before an outage may answer well after it began. */
  private storeCallSeq = 0;

  private latestFailedCallSeq = 0;

  private readonly ownerQueues = new Map<SpendOwner, Promise<void>>();

  private midnightTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(deps: JarvisBudgetServiceDeps) {
    this.store = deps.store;
    this.config = deps.config;
    this.now = deps.now ?? Date.now;
    this.changes$ = this.changes.asObservable();
    this.copyDay = utcDayOf(this.now());
    this.armMidnightTimer(nextUtcMidnightMs(this.now()));
  }

  /** The caller's budget now. Reads the store when this owner has no copy
   * for today yet, or while the store is failing, so a recovered store
   * lifts the fail-closed state. */
  stateFor(caller: Caller, tier: JarvisTier): Promise<BudgetState> {
    const owner = spendOwnerOf(caller);

    return this.enqueueStoreCall(owner, async (): Promise<BudgetState> => {
      const day = this.rollCopyToToday();

      if (!this.storeAvailable || !this.copyFor(owner).loaded) {
        await this.loadOwnerCopy(owner, day);
      }

      return this.stateOf(owner, tier);
    });
  }

  /** A meter for one turn. Precondition: `stateFor` was awaited for this
   * caller today, so the copy is loaded; before that the copy counts the
   * owner's spend as zero. */
  meterFor(caller: Caller, tier: JarvisTier): TurnMeter {
    const owner = spendOwnerOf(caller);

    return {
      record: (
        brain: Exclude<JarvisBrain, "scripted">,
        usage: JarvisTokenUsage,
      ): void => {
        this.recordSpend(owner, brain, usage);
      },
      exhausted: (): boolean => {
        this.rollCopyToToday();

        return this.stateOf(owner, tier).exhausted !== null;
      },
    };
  }

  /** Today's house-wide spend against the cap, for the Ops card. */
  houseToday(): HouseSpendToday {
    this.rollCopyToToday();

    return {
      spentUsd: this.houseSpentUsd(),
      limitUsd: this.config.houseDailyUsd,
    };
  }

  dispose(): void {
    clearTimeout(this.midnightTimer);
    this.changes.complete();
  }

  private stateOf(owner: SpendOwner, tier: JarvisTier): BudgetState {
    const copy = this.copyFor(owner);
    const spentUsd = roundUsd(copy.confirmedUsd + copy.pendingUsd);
    const limitUsd = tier === "member" ? this.config.userDailyUsd : null;
    const houseSpentUsd = this.houseSpentUsd();

    return {
      spentUsd,
      limitUsd,
      houseSpentUsd,
      houseLimitUsd: this.config.houseDailyUsd,
      exhausted: this.exhaustionOf(spentUsd, limitUsd, houseSpentUsd),
      resetsAtMs: nextUtcMidnightMs(this.now()),
    };
  }

  private exhaustionOf(
    spentUsd: number,
    limitUsd: number | null,
    houseSpentUsd: number,
  ): BudgetExhaustion | null {
    if (this.config.forceExhausted) {
      return "forced";
    }

    // Fail closed: numbers the store could not confirm are not trusted.
    if (!this.storeAvailable) {
      return "unavailable";
    }

    // At the limit counts as spent, so a `0` limit turns the key off.
    if (limitUsd !== null && spentUsd >= limitUsd) {
      return "user";
    }

    if (houseSpentUsd >= this.config.houseDailyUsd) {
      return "house";
    }

    return null;
  }

  private houseSpentUsd(): number {
    return roundUsd(this.houseConfirmedUsd + this.housePendingUsd);
  }

  private recordSpend(
    owner: SpendOwner,
    brain: Exclude<JarvisBrain, "scripted">,
    usage: JarvisTokenUsage,
  ): void {
    const usd = estimateUsageCostUsd(brain, usage);

    // Neither the store nor `record_jarvis_spend` guards the amount, so a
    // malformed usage report must not lower a budget or poison a total.
    if (!Number.isFinite(usd) || usd < 0) {
      console.error(
        `jarvis-budget: skipped recording a cost of ${String(usd)} USD for ${brain}`,
      );

      return;
    }

    const day = this.rollCopyToToday();

    this.copyFor(owner).pendingUsd += usd;
    this.housePendingUsd += usd;
    this.changes.next();

    void this.enqueueStoreCall(owner, () => {
      return this.writeHouseSpend(owner, day, usd);
    });
  }

  private async writeHouseSpend(
    owner: SpendOwner,
    day: string,
    usd: number,
  ): Promise<void> {
    const { answer, seq } = await this.callStore(() => {
      return this.store.record(owner, day, "house", usd);
    });

    // Midnight dropped the copy this amount was booked in; today's copy
    // never counted it. (A stale `copyDay` here is harmless: every reader
    // rolls the copy before reading it.)
    if (day === this.copyDay) {
      const copy = this.copyFor(owner);

      copy.pendingUsd -= usd;
      this.housePendingUsd -= usd;

      if (answer === "unavailable") {
        // Spent all the same: keep counting it until a read replaces it.
        copy.confirmedUsd += usd;
        this.houseConfirmedUsd += usd;
      } else {
        // Only a house-key answer may set the house copy: for own-key spend
        // `record_jarvis_spend` answers house_usd 0. This service records
        // house-key spend only.
        this.applyTotals(copy, answer);
      }
    }

    this.noteStoreAnswer(answer, seq);
  }

  private async loadOwnerCopy(owner: SpendOwner, day: string): Promise<void> {
    const { answer, seq } = await this.callStore(() => {
      return this.store.read(owner, day, "house");
    });

    // Rolled again after the wait, so a read of yesterday that answers after
    // midnight, before the timer's callback, never fills today's copy.
    if (answer !== "unavailable" && day === this.rollCopyToToday()) {
      this.applyTotals(this.copyFor(owner), answer);
    }

    this.noteStoreAnswer(answer, seq);
  }

  private applyTotals(copy: OwnerCopy, totals: SpendTotals): void {
    copy.confirmedUsd = totals.ownerUsd;
    copy.loaded = true;
    this.houseConfirmedUsd = Math.max(this.houseConfirmedUsd, totals.houseUsd);
  }

  /** A store that throws is treated as one that answered `"unavailable"`:
   * the caller fails closed either way. */
  private async callStore(
    call: () => Promise<SpendTotals | "unavailable">,
  ): Promise<StoreReply> {
    this.storeCallSeq += 1;

    const seq = this.storeCallSeq;

    try {
      return { answer: await call(), seq };
    } catch (error) {
      console.error(
        `jarvis-budget: spend store call failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return { answer: "unavailable", seq };
    }
  }

  /** Tracks whether the store is answering, announcing each flip so live
   * connections re-push their availability. Any failure closes; a success
   * reopens only if its call started after the latest failure. */
  private noteStoreAnswer(
    answer: SpendTotals | "unavailable",
    seq: number,
  ): void {
    if (answer === "unavailable") {
      this.latestFailedCallSeq = Math.max(this.latestFailedCallSeq, seq);
    }

    const available =
      answer !== "unavailable" && seq > this.latestFailedCallSeq;

    if (available !== this.storeAvailable) {
      this.storeAvailable = available;
      this.changes.next();
    }
  }

  /** Runs the call after every earlier store call for the owner settles. */
  private enqueueStoreCall<T>(
    owner: SpendOwner,
    call: () => Promise<T>,
  ): Promise<T> {
    const previous = this.ownerQueues.get(owner) ?? Promise.resolve();
    const result = previous.then(call);
    // The queue waits on the call settling either way, never on its value.
    const tail = result.then(settleQuietly, settleQuietly);

    this.ownerQueues.set(owner, tail);
    void tail.then(() => {
      // The last call out drops the queue, so an owner seen once a day does
      // not keep an entry for the life of the server.
      if (this.ownerQueues.get(owner) === tail) {
        this.ownerQueues.delete(owner);
      }
    });

    return result;
  }

  private copyFor(owner: SpendOwner): OwnerCopy {
    let copy = this.owners.get(owner);

    if (copy === undefined) {
      copy = { confirmedUsd: 0, pendingUsd: 0, loaded: false };
      this.owners.set(owner, copy);
    }

    return copy;
  }

  /** Drops every copy once the UTC day has changed, so the new day is read
   * from the store. Called by the midnight timer and by every access — a
   * timer can fire a little late, and the day must not. */
  private rollCopyToToday(): string {
    const today = utcDayOf(this.now());

    if (today !== this.copyDay) {
      this.copyDay = today;
      this.owners.clear();
      this.houseConfirmedUsd = 0;
      this.housePendingUsd = 0;
    }

    return today;
  }

  /** One timer, re-armed for the following midnight each time it fires:
   * the day changing is what lifts a spent budget, and live connections
   * must hear it without sending a frame. */
  private armMidnightTimer(midnightMs: number): void {
    this.midnightTimer = setTimeout(
      () => {
        this.rollCopyToToday();
        this.changes.next();
        // From the clock, not from `midnightMs`: a timer that fires early
        // (a clock step) re-arms for the real midnight instead of skipping
        // a day.
        this.armMidnightTimer(nextUtcMidnightMs(this.now()));
      },
      Math.max(0, midnightMs - this.now()),
    );
    // A pending midnight must not keep the process alive on shutdown.
    this.midnightTimer.unref();
  }
}

function spendOwnerOf(caller: Caller): SpendOwner {
  return caller.accountId !== null
    ? `account:${caller.accountId}`
    : `roster:${caller.username}`;
}

/** Keeps float residue from adding pending amounts out of a total (the store
 * rounds the same way). */
function roundUsd(usd: number): number {
  return Math.round(usd * 1e9) / 1e9;
}

function settleQuietly(): undefined {
  return undefined;
}
