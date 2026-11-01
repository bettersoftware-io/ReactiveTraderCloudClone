import { BehaviorSubject, type Observable } from "rxjs";

import {
  JARVIS_BRAINS,
  type JarvisBrainUsageRow,
  type JarvisHouseBrain,
  type JarvisLiveBrain,
  type JarvisUsageSnapshot,
  ownModelOf,
} from "@rtc/domain";

import { nextUtcMidnightMs } from "./jarvisBudget/utcDay.js";

const DAY_MS = 86_400_000;

/**
 * Display-only price table for estimating live-Claude Jarvis usage cost.
 * $/Mtok input, output. Cache reads bill at 10% of input; cache writes at
 * 125% of input (Anthropic's standard prompt-caching multipliers). The
 * `"scripted"` brain never calls out to a model, so it has no entry — its
 * rows always report `estimatedCostUsd: 0`.
 */
export interface JarvisBrainPrice {
  readonly inputUsdPerMtok: number;
  readonly outputUsdPerMtok: number;
}

export const JARVIS_PRICE_TABLE: Record<
  Exclude<JarvisHouseBrain, "scripted">,
  JarvisBrainPrice
> = {
  "claude-haiku-4-5": { inputUsdPerMtok: 1, outputUsdPerMtok: 5 },
  "claude-sonnet-5": { inputUsdPerMtok: 2, outputUsdPerMtok: 10 },
  "claude-opus-5": { inputUsdPerMtok: 5, outputUsdPerMtok: 25 },
};

/** One Anthropic session iteration's token counts, as reported by the SDK. */
export interface JarvisTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

/** Mutable per-brain running totals; `JarvisBrainUsageRow` minus the
 * derived `estimatedCostUsd`, computed fresh whenever a snapshot is built. */
interface BrainAccumulator {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

function createAccumulator(): BrainAccumulator {
  return {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

/**
 * The estimated USD cost of some token usage on a brain — one request's for
 * the daily budget, a window's running totals for the Ops rows. Both price
 * through this one function so the budget is enforced against exactly the
 * figure the Ops card shows.
 */
export function estimateUsageCostUsd(
  brain: JarvisLiveBrain | "scripted",
  usage: JarvisTokenUsage,
): number {
  if (brain === "scripted") {
    return 0;
  }

  // An own-key brain is priced from its curated model; any other from the
  // house table.
  const housePrices: Readonly<Record<string, JarvisBrainPrice | undefined>> =
    JARVIS_PRICE_TABLE;
  const price = ownModelOf(brain) ?? housePrices[brain];

  // A brain with no price is not guessed at: a NaN cost is refused by the
  // budget's recording guard.
  if (price === undefined) {
    return Number.NaN;
  }

  return (
    (usage.inputTokens * price.inputUsdPerMtok +
      usage.outputTokens * price.outputUsdPerMtok +
      usage.cacheReadTokens * price.inputUsdPerMtok * 0.1 +
      usage.cacheCreationTokens * price.inputUsdPerMtok * 1.25) /
    1e6
  );
}

function toRow(
  brain: JarvisHouseBrain,
  acc: BrainAccumulator,
): JarvisBrainUsageRow {
  return {
    brain,
    turns: acc.turns,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheReadTokens: acc.cacheReadTokens,
    cacheCreationTokens: acc.cacheCreationTokens,
    estimatedCostUsd: estimateUsageCostUsd(brain, acc),
  };
}

function toRows(
  accumulators: ReadonlyMap<JarvisHouseBrain, BrainAccumulator>,
): readonly JarvisBrainUsageRow[] {
  const rows: JarvisBrainUsageRow[] = [];

  for (const brain of JARVIS_BRAINS) {
    const acc = accumulators.get(brain);

    if (acc !== undefined) {
      rows.push(toRow(brain, acc));
    }
  }

  return rows;
}

/**
 * In-memory Jarvis usage meter for the Ops card: per-brain turn counts and
 * house-key token accounting for today (the UTC day, the same day the
 * budgets reset on) plus a cumulative since-boot total. Display only — the
 * budgets are enforced by `JarvisBudgetService` over the durable spend store,
 * never by this meter. Server-process lifetime only — no persistence, no
 * cross-instance aggregation.
 *
 * Window semantics: the window is the UTC day of the latest record. It
 * rolls lazily, when a record arrives on a later day (`windowEndMs` starts at
 * `0`, so the first record always anchors it); until then a snapshot can
 * still show a past day, which its `windowEndMs` gives away. `sinceBoot`
 * never resets.
 */
export class UsageMeter {
  private readonly now: () => number;

  private readonly currentWindow = new Map<
    JarvisHouseBrain,
    BrainAccumulator
  >();

  private readonly sinceBoot = new Map<JarvisHouseBrain, BrainAccumulator>();

  private windowStartMs = 0;

  private windowEndMs = 0;

  private readonly snapshotSubject: BehaviorSubject<JarvisUsageSnapshot>;

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.snapshotSubject = new BehaviorSubject<JarvisUsageSnapshot>(
      this.buildSnapshot(),
    );
  }

  get snapshot$(): Observable<JarvisUsageSnapshot> {
    return this.snapshotSubject.asObservable();
  }

  recordTurn(brain: JarvisHouseBrain): void {
    this.rollWindowIfElapsed();
    this.accumulatorFor(this.currentWindow, brain).turns += 1;
    this.accumulatorFor(this.sinceBoot, brain).turns += 1;
    this.publishSnapshot();
  }

  recordTokens(brain: JarvisHouseBrain, usage: JarvisTokenUsage): void {
    this.rollWindowIfElapsed();
    this.accumulateTokens(
      this.accumulatorFor(this.currentWindow, brain),
      usage,
    );
    this.accumulateTokens(this.accumulatorFor(this.sinceBoot, brain), usage);
    this.publishSnapshot();
  }

  private accumulatorFor(
    accumulators: Map<JarvisHouseBrain, BrainAccumulator>,
    brain: JarvisHouseBrain,
  ): BrainAccumulator {
    let acc = accumulators.get(brain);

    if (acc === undefined) {
      acc = createAccumulator();
      accumulators.set(brain, acc);
    }

    return acc;
  }

  private accumulateTokens(
    acc: BrainAccumulator,
    usage: JarvisTokenUsage,
  ): void {
    acc.inputTokens += usage.inputTokens;
    acc.outputTokens += usage.outputTokens;
    acc.cacheReadTokens += usage.cacheReadTokens;
    acc.cacheCreationTokens += usage.cacheCreationTokens;
  }

  private rollWindowIfElapsed(): void {
    const t = this.now();

    if (t >= this.windowEndMs) {
      this.windowEndMs = nextUtcMidnightMs(t);
      this.windowStartMs = this.windowEndMs - DAY_MS;
      this.currentWindow.clear();
    }
  }

  private buildSnapshot(): JarvisUsageSnapshot {
    return {
      windowStartMs: this.windowStartMs,
      windowEndMs: this.windowEndMs,
      currentWindow: toRows(this.currentWindow),
      sinceBoot: toRows(this.sinceBoot),
    };
  }

  private publishSnapshot(): void {
    this.snapshotSubject.next(this.buildSnapshot());
  }
}
