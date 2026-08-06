/**
 * Rare, bounded "market event" episodes layered onto `PricingSimulator`'s
 * live tick stream — the ONLY trigger source `detectAnomalies`
 * (`../jarvis/anomalyDetector.ts`) can ever fire against. Without this, the
 * simulator's spread is bit-identical forever (`halfSpread` is set once in
 * `initPair` and never touched again) and its uniform-step random walk caps
 * return z-scores at √3≈1.73, so neither detector channel can ever cross a
 * 3σ threshold — measured at 0 crossings over 2M simulated ticks.
 *
 * Two kinds, both bounded and self-terminating (`advanceEpisode` decays
 * back to `NO_EPISODE` on its own — no external cancellation needed):
 *
 * - `spreadWidening`: `halfSpread` is scaled by a factor that RAMPS from 1x
 *   up to a peak (2-4x, `spreadPeakRange`) and back down to 1x over the
 *   episode (`spreadFactor`), rather than jumping straight to the peak. A
 *   jump would land on a CONSTANT baseline — zero-variance-guarded, so
 *   `evaluateCrossing` never even attempts the division — and the very
 *   first widened tick would be judged against a window of nothing but
 *   identical values. The ramp instead creates variance from its own
 *   second active tick onward (the trailing window starts holding a mix of
 *   baseline + early-ramp values), so the *continued* rise crosses 3σ
 *   against a small, freshly non-zero σ.
 * - `volBurst`: the ordinary random-walk step is scaled by a constant
 *   factor (4-8x, `burstPeakRange`) for the whole episode
 *   (`burstStepMultiplier`) — no ramp needed, because the vol channel's
 *   trailing-RETURN window already has non-zero baseline variance
 *   (ordinary steps vary tick to tick), so a single amplified tick is
 *   already enough to cross 3σ against it. Roughly half of `volBurst`
 *   episodes additionally pin the step to a persistent sign
 *   (`burstSignBias`) for their whole duration, so a run of ticks drifts in
 *   one direction instead of each amplified step being independently
 *   likely to be partly cancelled by the next.
 *
 * Determinism: `advanceEpisode` is a pure function over an injected
 * `random: () => number` — this module never calls `Math.random()` itself.
 * With `startProbability` forced to 0, it draws ZERO extra values from
 * `random` — the `startProbability <= 0 ||` short-circuit skips the call
 * entirely rather than drawing-and-discarding — so `PricingSimulator`'s
 * per-tick RNG consumption, and therefore its tick VALUES for the same
 * underlying `Math.random()` sequence, stay byte-identical to before this
 * module existed. See `pricingAnomalyEpisode.test.ts`'s
 * "byte-compatible steady state" case (the only place that specific claim
 * is proven — it is a draw-COUNT test, which needs `startProbability: 0` to
 * hold count independent of value).
 *
 * PRODUCTION IS NOT THAT CASE: the shipped `DEFAULT_EPISODE_CONFIG` uses
 * `startProbability: 1/1500`, not 0. Every steady-state tick still costs
 * one "start roll" draw from `advanceEpisode` (`random()` is called even
 * when it returns `false`) — measured, this raises `PricingSimulator`'s
 * per-live-tick `Math.random()` consumption from 2 draws (`tickInterval` +
 * `applyRandomWalk`'s step) to 3 (+ the start roll), a 50% increase. This
 * is deliberate and harmless, not an oversight: nothing in this repo pins a
 * live (non-`pinAtMs`) tick's numeric VALUE against a specific
 * `Math.random()` sequence — grepped and confirmed against every
 * `PricingSimulator` test and every visual/golden harness (goldens use
 * `pinAtMs`, which skips the random walk entirely; live-mode tests assert
 * structure — bounds, precision, monotonic timestamps — never exact
 * numbers). A shifted draw sequence changes which arbitrary-looking prices
 * a live desk displays, not whether any assertion passes.
 */

type EpisodeKind = "spreadWidening" | "volBurst";

export interface EpisodeState {
  readonly kind: EpisodeKind | "none";
  /** Ticks left in the episode, including the one about to be produced. 0 in "none". */
  readonly ticksRemaining: number;
  /** Total episode length in ticks, fixed at episode start. 0 in "none". */
  readonly duration: number;
  /** Target peak multiplier — the spread ramp's peak, or the vol burst's constant step multiplier. 1 in "none". */
  readonly peakFactor: number;
  /**
   * `volBurst` only: -1/1 pins the random-walk step's sign for the whole
   * episode (a persistent-direction run); 0 leaves each tick's sign to its
   * own random draw, same as steady state.
   */
  readonly signBias: -1 | 0 | 1;
}

/** The resting state: no episode in progress, every multiplier neutral. */
export const NO_EPISODE: EpisodeState = {
  kind: "none",
  ticksRemaining: 0,
  duration: 0,
  peakFactor: 1,
  signBias: 0,
};

export interface EpisodeConfig {
  /** Probability in [0, 1) that an episode starts on any given steady-state tick. 0 disables episodes entirely (and skips the RNG draw — see the module doc). */
  readonly startProbability: number;
  readonly minDurationTicks: number;
  readonly maxDurationTicks: number;
  /** [min, max) peak halfSpread multiplier for a spreadWidening episode. */
  readonly spreadPeakRange: readonly [number, number];
  /** [min, max) constant step-size multiplier for a volBurst episode. */
  readonly burstPeakRange: readonly [number, number];
  /** Probability a volBurst episode pins a persistent step sign for its whole duration, rather than leaving each tick's sign to its own random draw. */
  readonly signPersistProbability: number;
}

/**
 * Calibrated so a single symbol's expected episode interval sits in the
 * minutes range at the simulator's 150-1000ms live tick cadence (the
 * plan's product target: an episode every few minutes per symbol — well
 * inside the narrator's own 5-minute cooldown / 4-per-session cap, so this
 * config is the rare trigger, not the spam bound). At the ~575ms average
 * tick interval, 1/1500 per tick is one episode roughly every 14 minutes
 * per symbol in expectation.
 *
 * Verified (not merely assumed) to actually cross the detector's DEFAULT
 * 3σ thresholds at these exact peak/duration bounds — see
 * `pricingAnomalyEpisode.test.ts`'s "detector integration" cases, which run
 * `detectAnomalies` with `DEFAULT_ANOMALY_CONFIG` (unmodified) over a
 * simulated episode built from these ranges.
 */
export const DEFAULT_EPISODE_CONFIG: EpisodeConfig = {
  startProbability: 1 / 1500,
  minDurationTicks: 20,
  maxDurationTicks: 60,
  spreadPeakRange: [2, 4],
  burstPeakRange: [4, 8],
  signPersistProbability: 0.5,
};

/** Symmetric ramp in [0, 1]: 0 at both ends of `[0, duration - 1]`, 1 at the episode's midpoint. */
function ramp01(elapsedTicks: number, duration: number): number {
  if (duration <= 1) {
    return 0;
  }

  return Math.sin((Math.PI * elapsedTicks) / (duration - 1));
}

/**
 * Advance one pair's episode state by exactly one tick.
 *
 * In "none", rolls to (maybe) start a new episode — this is the ONLY
 * branch that ever calls `random`, and only when `startProbability > 0`
 * (see the module doc's byte-compat guarantee). A roll that starts an
 * episode draws the duration, kind, peak factor, and (for `volBurst`) the
 * sign-persistence decision, in that fixed order — scripted-RNG tests pin
 * this order.
 *
 * Outside "none", no randomness is needed: the state just decrements its
 * remaining tick count, returning to `NO_EPISODE` once exhausted.
 */
export function advanceEpisode(
  state: EpisodeState,
  random: () => number,
  config: EpisodeConfig = DEFAULT_EPISODE_CONFIG,
): EpisodeState {
  if (state.kind === "none") {
    if (config.startProbability <= 0 || random() >= config.startProbability) {
      return state;
    }

    const duration = Math.round(
      config.minDurationTicks +
        random() * (config.maxDurationTicks - config.minDurationTicks),
    );
    const kind: EpisodeKind = random() < 0.5 ? "spreadWidening" : "volBurst";
    const [minPeak, maxPeak] =
      kind === "spreadWidening"
        ? config.spreadPeakRange
        : config.burstPeakRange;
    const peakFactor = minPeak + random() * (maxPeak - minPeak);
    const signBias: -1 | 0 | 1 =
      kind === "volBurst" && random() < config.signPersistProbability
        ? random() < 0.5
          ? -1
          : 1
        : 0;

    return { kind, ticksRemaining: duration, duration, peakFactor, signBias };
  }

  const ticksRemaining = state.ticksRemaining - 1;
  return ticksRemaining <= 0 ? NO_EPISODE : { ...state, ticksRemaining };
}

/**
 * `halfSpread` multiplier for the tick about to be produced: 1 outside a
 * `spreadWidening` episode, ramping 1 → `peakFactor` → 1 across one (see
 * the module doc for why a ramp, not a jump).
 */
export function spreadFactor(state: EpisodeState): number {
  if (state.kind !== "spreadWidening") {
    return 1;
  }

  const elapsedTicks = state.duration - state.ticksRemaining;
  return 1 + (state.peakFactor - 1) * ramp01(elapsedTicks, state.duration);
}

/**
 * Random-walk step-size multiplier for the tick about to be produced: 1
 * outside a `volBurst` episode, else the episode's fixed peak factor
 * (constant for the whole burst — see the module doc for why no ramp).
 */
export function burstStepMultiplier(state: EpisodeState): number {
  return state.kind === "volBurst" ? state.peakFactor : 1;
}

/**
 * The persistent step-sign pin for the tick about to be produced: 0 (no
 * pin — the tick keeps its own random sign) outside a `volBurst` episode,
 * or when one didn't roll sign persistence.
 */
export function burstSignBias(state: EpisodeState): -1 | 0 | 1 {
  return state.kind === "volBurst" ? state.signBias : 0;
}
