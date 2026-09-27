import type {
  JarvisAvailability,
  JarvisEntry,
  JarvisState,
} from "@rtc/core-api";
import { Direction, type PriceTick } from "@rtc/domain";

import type { FakeClock } from "#/harness/clock";
import { createTick, EURUSD } from "#/harness/fixtures";
import type { CoreHarness } from "#/harness/harness";
import type { JarvisEvent } from "#/harness/jarvisTypes";
import { settle } from "#/harness/settle";
import { type Pause, readLatest } from "#/suites/workspaceKit";

/* Shared by the slice-7 wave-2 Jarvis suites (`jarvis`, `jarvisDriver`,
 * `jarvisDemo`): reading the transcript, finishing turns, the availability
 * values the harness pushes, and a price series the narrator's detector
 * crosses on. */

export function readJarvis(
  h: CoreHarness,
  pause: Pause = settle,
): Promise<JarvisState> {
  return readLatest(h.app.presenters.jarvis.state$, pause);
}

/** The transcript's texts, greeting included. */
export async function entryTexts(
  h: CoreHarness,
  pause: Pause = settle,
): Promise<string[]> {
  return (await readJarvis(h, pause)).entries.map((entry: JarvisEntry) => {
    return entry.text;
  });
}

export async function lastEntry(
  h: CoreHarness,
  pause: Pause = settle,
): Promise<JarvisEntry> {
  const entry = (await readJarvis(h, pause)).entries.at(-1);

  if (entry === undefined) {
    throw new Error("lastEntry: the transcript is empty");
  }

  return entry;
}

/** Reply to the OLDEST pending ask with `events` and a closing `done`. */
export async function completeTurn(
  h: CoreHarness,
  events: readonly JarvisEvent[] = [],
  pause: Pause = settle,
): Promise<void> {
  h.driver.replyJarvis([...events, { type: "done" }]);
  await pause();
}

/** `send(text)`, then answer it with `events` and a closing `done`. */
export async function sendTurn(
  h: CoreHarness,
  text: string,
  events: readonly JarvisEvent[] = [],
  pause: Pause = settle,
): Promise<void> {
  h.app.presenters.jarvis.intents.send(text);
  await pause();
  await completeTurn(h, events, pause);
}

export function createAvailability(
  overrides: Partial<JarvisAvailability> = {},
): JarvisAvailability {
  return {
    available: true,
    brains: ["scripted", "claude-haiku-4-5"],
    defaultBrain: "scripted",
    gate: null,
    ...overrides,
  };
}

export function createConfirmRequest(confirmationId: string): JarvisEvent {
  return {
    type: "confirmRequest",
    confirmationId,
    symbol: "EURUSD",
    direction: Direction.Buy,
    notional: 5_000_000,
    quotedPrice: 1.1,
    ratePrecision: 5,
  };
}

/** A fake-clock pause: the harness's settle, on fake timers. */
export function clockPause(clock: FakeClock): Pause {
  return () => {
    return clock.settle();
  };
}

/** The narrator's detector under test thresholds (`NARRATOR_TEST_CONFIG`):
 * a window wide enough that every later spike still crosses, and a short
 * fill. */
export const NARRATOR_TEST_CONFIG = { windowSize: 400, minWindowFill: 4 };

/** Baseline ticks between two spikes: enough that a spike with up to four
 * earlier spikes still in the window crosses 3σ (the bound is
 * √(baseline / earlier spikes)). */
export const NARRATOR_BASELINE_TICKS = 60;

/** Publish EURUSD as the only pair, so the narrator subscribes its ticks. */
export async function publishNarratedPair(
  h: CoreHarness,
  pause: Pause = settle,
): Promise<void> {
  h.driver.emitPairs([EURUSD]);
  await pause();
}

/** `count` baseline EURUSD ticks: a constant mid, the spread alternating
 * between two close values (a real, non-zero σ). Also re-arms the spread
 * channel after a spike. */
export function pushBaselineTicks(h: CoreHarness, count: number): void {
  for (let i = 0; i < count; i++) {
    h.driver.tickPrice(createSpreadTick(i % 2 === 0 ? 0.00009 : 0.00011));
  }
}

/** One EURUSD tick whose spread dwarfs the baseline's — an anomaly. */
export function pushSpreadSpike(h: CoreHarness): void {
  h.driver.tickPrice(createSpreadTick(0.025));
}

/** Every narration the core asked the port for, in order. */
export function narrationAsks(h: CoreHarness, prefix: string): string[] {
  return h.driver
    .askLog()
    .map((ask) => {
      return ask.text;
    })
    .filter((text) => {
      return text.startsWith(prefix);
    });
}

function createSpreadTick(halfSpread: number): PriceTick {
  return {
    ...createTick("EURUSD", 1.1),
    bid: 1.1 - halfSpread,
    ask: 1.1 + halfSpread,
  };
}
