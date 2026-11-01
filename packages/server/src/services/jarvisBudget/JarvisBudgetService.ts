import { type Observable, Subject } from "rxjs";

import type { JarvisLiveBrain } from "@rtc/domain";

import type { Caller } from "#/services/serviceContainer.js";
import {
  estimateUsageCostUsd,
  type JarvisTokenUsage,
} from "#/services/UsageMeter.js";

import type { JarvisBudgetConfig } from "./jarvisBudgetConfig.js";
import type { JarvisTier } from "./jarvisTier.js";
import type {
  KeyKind,
  SpendOwner,
  SpendStore,
  SpendTotals,
} from "./SpendStore.js";
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
 * One turn's view of the budget, used request by request:
 *
 * 1. `exhausted()` before the request — synchronous over the service's
 *    in-process copy, so it sees a record or a reservation the instant it is
 *    made. It counts every OTHER in-flight request's reservation, so turns
 *    running at once (several tabs of one person, many people at the house
 *    cap) see each other; this meter's own reservation is not counted, so
 *    one request always fits.
 * 2. `beginRequest(brain, ceiling)` reserves the request's worst-case cost
 *    (the `ceiling` usage, priced on `brain`) until the request is booked.
 * 3. `record(brain, usage)` books what the request cost and releases its
 *    reservation — also for a request cut short, with what it had used.
 *    `endRequest()` releases a reservation whose request never happened or
 *    reported no usage. Both are safe to call with nothing reserved.
 */
export interface TurnMeter {
  beginRequest(brain: JarvisLiveBrain, ceiling: JarvisTokenUsage): void;
  record(brain: JarvisLiveBrain, usage: JarvisTokenUsage): void;
  endRequest(): void;
  exhausted(): boolean;
}

/** The caller's spend on a key they brought, against the cap they set. */
export interface OwnBudgetState {
  /** The caller's own-key spend today, USD. */
  readonly spentUsd: number;
  /** The cap the caller set; null for "no limit". */
  readonly limitUsd: number | null;
  /** `"user"`: the cap is spent. `"unavailable"`: a cap is set and the
   * spend store cannot be read or written (fail closed). With no limit a
   * turn runs regardless. */
  readonly exhausted: "user" | "unavailable" | null;
  readonly resetsAtMs: number;
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

/** One owner's spend on one kind of key. Every per-owner map below is keyed
 * by `key`, so an owner's house turns and own-key turns never share a copy,
 * a store queue or a reservation. */
interface Slot {
  readonly owner: SpendOwner;
  readonly keyKind: KeyKind;
  readonly key: string;
}

function slotOf(owner: SpendOwner, keyKind: KeyKind): Slot {
  return { owner, keyKind, key: `${keyKind}:${owner}` };
}

/** One slot's spend for the copy's day. */
interface OwnerCopy {
  readonly slot: Slot;
  /** The store's latest answer for the owner's day total. */
  confirmedUsd: number;
  /** Booked here, not yet answered by the store. Counting it at once is what
   * lets a second request in the same turn see the first one's cost. */
  pendingUsd: number;
  /** Spent, but its write failed, so the store's total leaves it out. Kept
   * apart from `confirmedUsd`, which every store answer replaces, and sent
   * again once the store answers again. */
  unrecordedUsd: number;
  /** A read or write answer for this owner has landed today. */
  loaded: boolean;
}

/**
 * Per-person daily Jarvis spend (spec §3), over a durable
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
 * is exhausted with that reason until a later read succeeds. A write that
 * failed is not lost: its amount stays counted on top of the store's figure
 * and is written again once the store answers again.
 *
 * Spend on a key the person brought is tracked the same way, in its own slot
 * per owner (copy, store queue, reservations), and never counts toward the
 * house total. A cap on it fails closed like the house key; with no limit
 * the turn runs regardless and its spend is recorded best effort.
 */
export class JarvisBudgetService {
  readonly changes$: Observable<void>;

  private readonly store: SpendStore;

  private readonly config: JarvisBudgetConfig;

  private readonly now: () => number;

  private readonly changes = new Subject<void>();

  /** The UTC day every copy below belongs to. */
  private copyDay: string;

  private readonly owners = new Map<string, OwnerCopy>();

  /** The house total only ever rises within a day, so the highest answer
   * wins: two owners' writes can come back out of order. */
  private houseConfirmedUsd = 0;

  private housePendingUsd = 0;

  /** Every owner's `unrecordedUsd`: the store's house total leaves it out
   * too. */
  private houseUnrecordedUsd = 0;

  /** In-flight requests' worst-case cost, per owner and house-wide. Not part
   * of the day's copy: a request in flight across midnight still holds its
   * reservation until it is booked or released. */
  private readonly ownerReservedUsd = new Map<string, number>();

  private houseReservedUsd = 0;

  private storeAvailable = true;

  /** Numbers each store call as it starts. Answers arrive in any order, so
   * only a success that STARTED after the latest failure proves the store is
   * back; a write sent before an outage may answer well after it began. */
  private storeCallSeq = 0;

  private latestFailedCallSeq = 0;

  private readonly ownerQueues = new Map<string, Promise<void>>();

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
    const slot = slotOf(spendOwnerOf(caller), "house");

    return this.enqueueStoreCall(slot, async (): Promise<BudgetState> => {
      const day = this.rollCopyToToday();

      if (!this.storeAvailable || !this.copyFor(slot).loaded) {
        await this.loadOwnerCopy(slot, day);
      }

      return this.stateOf(slot, tier);
    });
  }

  /** The caller's own-key budget now, against the cap they set (null: no
   * limit). Loads the own-key copy like `stateFor` loads the house one. */
  ownStateFor(caller: Caller, capUsd: number | null): Promise<OwnBudgetState> {
    const slot = slotOf(spendOwnerOf(caller), "own");

    return this.enqueueStoreCall(slot, async (): Promise<OwnBudgetState> => {
      const day = this.rollCopyToToday();

      if (!this.storeAvailable || !this.copyFor(slot).loaded) {
        await this.loadOwnerCopy(slot, day);
      }

      return this.ownStateOf(slot, capUsd);
    });
  }

  /** A meter for one turn. Precondition: `stateFor` was awaited for this
   * caller today, so the copy is loaded; before that the copy counts the
   * owner's spend as zero. */
  meterFor(caller: Caller, tier: JarvisTier): TurnMeter {
    const slot = slotOf(spendOwnerOf(caller), "house");

    return this.meterOver(slot, (reservedUsd: number): boolean => {
      const limitUsd = tier === "member" ? this.config.userDailyUsd : null;
      const othersOfOwnerUsd =
        (this.ownerReservedUsd.get(slot.key) ?? 0) - reservedUsd;
      const othersOfHouseUsd = this.houseReservedUsd - reservedUsd;

      return (
        this.exhaustionOf(
          roundUsd(ownerSpentUsd(this.copyFor(slot)) + othersOfOwnerUsd),
          limitUsd,
          roundUsd(this.houseSpentUsd() + othersOfHouseUsd),
        ) !== null
      );
    });
  }

  /** A meter for one own-key turn, under the caller's cap (null: no limit).
   * Same precondition as `meterFor`: `ownStateFor` was awaited today.
   * Reservations are the owner's own-key ones alone; nothing here touches
   * the house total or its reservations, and `forceExhausted` does not
   * apply. */
  ownMeterFor(caller: Caller, capUsd: number | null): TurnMeter {
    const slot = slotOf(spendOwnerOf(caller), "own");

    return this.meterOver(slot, (reservedUsd: number): boolean => {
      const othersUsd =
        (this.ownerReservedUsd.get(slot.key) ?? 0) - reservedUsd;

      return (
        this.ownExhaustionOf(
          roundUsd(ownerSpentUsd(this.copyFor(slot)) + othersUsd),
          capUsd,
        ) !== null
      );
    });
  }

  /** The reserve / book / release lifecycle every meter shares, over one
   * slot. `isExhausted` gets this meter's own open reservation, which it
   * must leave out of what it counts against the caller. */
  private meterOver(
    slot: Slot,
    isExhausted: (reservedUsd: number) => boolean,
  ): TurnMeter {
    // This meter's open reservation; 0 when none.
    let reservedUsd = 0;

    const releaseReservation = (): void => {
      if (reservedUsd > 0) {
        this.adjustReservation(slot, -reservedUsd);
        reservedUsd = 0;
      }
    };

    return {
      beginRequest: (
        brain: JarvisLiveBrain,
        ceiling: JarvisTokenUsage,
      ): void => {
        releaseReservation();

        const usd = estimateUsageCostUsd(brain, ceiling);

        // The same guard as a record: a reservation that is not a finite,
        // positive amount would loosen the check, so it is not taken.
        if (Number.isFinite(usd) && usd > 0) {
          reservedUsd = usd;
          this.adjustReservation(slot, usd);
        }
      },
      record: (brain: JarvisLiveBrain, usage: JarvisTokenUsage): void => {
        releaseReservation();
        this.recordSpend(slot, brain, usage);
      },
      endRequest: releaseReservation,
      exhausted: (): boolean => {
        this.rollCopyToToday();

        return isExhausted(reservedUsd);
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

  private ownStateOf(slot: Slot, capUsd: number | null): OwnBudgetState {
    const spentUsd = roundUsd(ownerSpentUsd(this.copyFor(slot)));

    return {
      spentUsd,
      limitUsd: capUsd,
      exhausted: this.ownExhaustionOf(spentUsd, capUsd),
      resetsAtMs: nextUtcMidnightMs(this.now()),
    };
  }

  private ownExhaustionOf(
    spentUsd: number,
    capUsd: number | null,
  ): "user" | "unavailable" | null {
    // No limit: the turn runs whatever the store says (D15).
    if (capUsd === null) {
      return null;
    }

    if (!this.storeAvailable) {
      return "unavailable";
    }

    return spentUsd >= capUsd ? "user" : null;
  }

  private stateOf(slot: Slot, tier: JarvisTier): BudgetState {
    const copy = this.copyFor(slot);
    const spentUsd = roundUsd(ownerSpentUsd(copy));
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

  private adjustReservation(slot: Slot, usd: number): void {
    const ownerUsd = roundUsd((this.ownerReservedUsd.get(slot.key) ?? 0) + usd);

    // The last release drops the entry, so the map holds in-flight owners only.
    if (ownerUsd > 0) {
      this.ownerReservedUsd.set(slot.key, ownerUsd);
    } else {
      this.ownerReservedUsd.delete(slot.key);
    }

    // Own-key reservations never count against the house cap.
    if (slot.keyKind === "house") {
      this.houseReservedUsd = Math.max(
        0,
        roundUsd(this.houseReservedUsd + usd),
      );
    }
  }

  private houseSpentUsd(): number {
    return roundUsd(
      this.houseConfirmedUsd + this.housePendingUsd + this.houseUnrecordedUsd,
    );
  }

  private recordSpend(
    slot: Slot,
    brain: JarvisLiveBrain,
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

    this.copyFor(slot).pendingUsd += usd;

    if (slot.keyKind === "house") {
      this.housePendingUsd += usd;
    }

    this.changes.next();

    void this.enqueueStoreCall(slot, () => {
      return this.writeSpend(slot, day, usd);
    });
  }

  private async writeSpend(
    slot: Slot,
    day: string,
    usd: number,
  ): Promise<void> {
    const { answer, seq } = await this.callStore(() => {
      return this.store.record(slot.owner, day, slot.keyKind, usd);
    });

    // Midnight dropped the copy this amount was booked in; today's copy
    // never counted it. (A stale `copyDay` here is harmless: every reader
    // rolls the copy before reading it.)
    if (day === this.copyDay) {
      const copy = this.copyFor(slot);

      copy.pendingUsd -= usd;

      if (slot.keyKind === "house") {
        this.housePendingUsd -= usd;
      }

      if (answer === "unavailable") {
        // Spent all the same: keep counting it, apart from the store's
        // figure, until a write of it lands.
        copy.unrecordedUsd += usd;

        if (slot.keyKind === "house") {
          this.houseUnrecordedUsd += usd;
        }
      } else {
        this.applyTotals(copy, answer);
      }
    }

    this.noteStoreAnswer(answer, seq);
  }

  /** Sends again what failed writes left out of the store, owner by owner,
   * each in its owner's queue like any write. Called when the store answers
   * again after failing; a retry that fails waits for the next recovery. */
  private retryUnrecordedSpend(): void {
    for (const copy of this.owners.values()) {
      if (copy.unrecordedUsd > 0) {
        const { slot } = copy;

        void this.enqueueStoreCall(slot, () => {
          return this.rewriteUnrecordedSpend(slot);
        });
      }
    }
  }

  private async rewriteUnrecordedSpend(slot: Slot): Promise<void> {
    const day = this.rollCopyToToday();
    const copy = this.copyFor(slot);
    // Read when the write starts, not when it was queued: the owner's calls
    // run one at a time, so an earlier retry (a store that flapped) has
    // landed by now, and what it moved into the store is not sent twice.
    const usd = copy.unrecordedUsd;

    if (usd <= 0) {
      return;
    }

    const { answer, seq } = await this.callStore(() => {
      return this.store.record(slot.owner, day, slot.keyKind, usd);
    });

    // A success that answers after midnight is not applied: midnight dropped
    // the copy the amount was kept in, and the new day's never counted it.
    if (answer !== "unavailable" && day === this.rollCopyToToday()) {
      // The store's totals now include it: it moves from here into them.
      copy.unrecordedUsd = roundUsd(copy.unrecordedUsd - usd);

      if (slot.keyKind === "house") {
        this.houseUnrecordedUsd = roundUsd(this.houseUnrecordedUsd - usd);
      }

      this.applyTotals(copy, answer);
    }

    this.noteStoreAnswer(answer, seq);
  }

  private async loadOwnerCopy(slot: Slot, day: string): Promise<void> {
    const { answer, seq } = await this.callStore(() => {
      return this.store.read(slot.owner, day, slot.keyKind);
    });

    // Rolled again after the wait, so a read of yesterday that answers after
    // midnight, before the timer's callback, never fills today's copy.
    if (answer !== "unavailable" && day === this.rollCopyToToday()) {
      this.applyTotals(this.copyFor(slot), answer);
    }

    this.noteStoreAnswer(answer, seq);
  }

  private applyTotals(copy: OwnerCopy, totals: SpendTotals): void {
    copy.confirmedUsd = totals.ownerUsd;
    copy.loaded = true;

    // Only a house-key answer may set the house copy: for own-key spend
    // `record_jarvis_spend` answers house_usd 0.
    if (copy.slot.keyKind === "house") {
      this.houseConfirmedUsd = Math.max(
        this.houseConfirmedUsd,
        totals.houseUsd,
      );
    }
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

      if (available) {
        this.retryUnrecordedSpend();
      }

      this.changes.next();
    }
  }

  /** Runs the call after every earlier store call for the owner settles. */
  private enqueueStoreCall<T>(slot: Slot, call: () => Promise<T>): Promise<T> {
    const previous = this.ownerQueues.get(slot.key) ?? Promise.resolve();
    const result = previous.then(call);
    // The queue waits on the call settling either way, never on its value.
    const tail = result.then(settleQuietly, settleQuietly);

    this.ownerQueues.set(slot.key, tail);
    void tail.then(() => {
      // The last call out drops the queue, so an owner seen once a day does
      // not keep an entry for the life of the server.
      if (this.ownerQueues.get(slot.key) === tail) {
        this.ownerQueues.delete(slot.key);
      }
    });

    return result;
  }

  private copyFor(slot: Slot): OwnerCopy {
    let copy = this.owners.get(slot.key);

    if (copy === undefined) {
      copy = {
        slot,
        confirmedUsd: 0,
        pendingUsd: 0,
        unrecordedUsd: 0,
        loaded: false,
      };
      this.owners.set(slot.key, copy);
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
      this.houseUnrecordedUsd = 0;
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

/** The owner's spend today as this copy knows it: the store's figure, what
 * is on its way there, and what a failed write left out of it. */
function ownerSpentUsd(copy: OwnerCopy): number {
  return copy.confirmedUsd + copy.pendingUsd + copy.unrecordedUsd;
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
