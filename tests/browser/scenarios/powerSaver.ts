import type { PowerSaverPO } from "../page-objects/contracts/PowerSaver";
import type { TestContext } from "../testContext";
import { assertEquals, assertTrue } from "./assert";

// The Freeze catch-all sets `animation-duration: 0.01ms !important` (1e-5s).
// getComputedStyle always resolves to seconds and browsers are free to
// normalise the notation (observed in Chromium: "1e-05s", not "0.01ms" or
// "0s"), so parse the numeric value and threshold it well below any real
// decorative-motion duration (all >= tens of ms) instead of string-matching.
const FROZEN_DURATION_SECONDS_THRESHOLD = 0.001;

function parseCssSeconds(duration: string): number {
  const match = /^([\d.e+-]+)s$/i.exec(duration.trim());

  if (!match) {
    throw new Error(`unrecognised CSS duration format: "${duration}"`);
  }

  return Number.parseFloat(match[1]);
}

function isFrozenDuration(duration: string): boolean {
  return parseCssSeconds(duration) < FROZEN_DURATION_SECONDS_THRESHOLD;
}

function powerSaverPO(ctx: TestContext): PowerSaverPO {
  const po = ctx.po.powerSaver;

  if (po === undefined) {
    throw new Error(
      "power-saver page object not available on this driver (Playwright-only)",
    );
  }

  return po;
}

export async function clickQuickToggle(ctx: TestContext): Promise<void> {
  await powerSaverPO(ctx).click();
}

export async function expectDocumentFlag(
  ctx: TestContext,
  value: "off" | "calm" | "freeze",
): Promise<void> {
  const flag = await powerSaverPO(ctx).documentFlag();
  assertEquals(
    flag,
    value,
    `expected html[data-power-saver="${value}"], got "${flag}"`,
  );
}

/**
 * Asserts the connection-status dot's real, un-neutralised animation is
 * running (the pre-freeze baseline the "frozen" assertion below is a delta
 * against).
 */
export async function expectConnectionDotAnimating(
  ctx: TestContext,
): Promise<void> {
  const duration = await powerSaverPO(ctx).connectionDotAnimationDuration();
  assertTrue(
    !isFrozenDuration(duration),
    `expected the connection dot's real animation-duration (not neutralised), got "${duration}"`,
  );
}

/**
 * Asserts the Freeze tier's CSS catch-all has collapsed the connection-status
 * dot's `animation-duration` to ~0 — the real-browser proof that the
 * catch-all fires (jsdom never loads index.css, so this cannot be verified
 * in the contract tier).
 */
export async function expectConnectionDotFrozen(
  ctx: TestContext,
): Promise<void> {
  const duration = await powerSaverPO(ctx).connectionDotAnimationDuration();
  assertTrue(
    isFrozenDuration(duration),
    `expected freeze's CSS catch-all to collapse animation-duration to ~0, got "${duration}"`,
  );
}

/**
 * Asserts freeze leaves NO live motion machinery while quotes stream: zero
 * non-`finished` animations across repeated `document.getAnimations()`
 * snapshots, and zero non-diagnostic `requestAnimationFrame` registrations —
 * the FPS meter's marked sampling loop is exempt (diagnostic instrumentation,
 * see `useLiveMetrics`) and asserted PRESENT below, so the exemption cannot
 * silently paper over the meter being gone. This is the
 * churn gate: the original catch-all's global 0.01ms `transition-duration`
 * manufactured a CSSTransition per data-driven style change and the flash
 * keyframes respawned a 0.01ms Animation per quote — visually frozen, but
 * per-tick style-recalc/Animation churn on exactly the GPU-less boxes freeze
 * exists to spare. Only a live streaming app can witness this; the visual
 * harness's fixtures are static.
 */
export async function expectNoLiveMotionMachinery(
  ctx: TestContext,
): Promise<void> {
  // ~1.5s across 6 snapshots: the sim quotes tick every ~500ms per stream, so
  // any per-tick churn appears well within the window.
  const sample = await powerSaverPO(ctx).sampleMotion({
    samples: 6,
    intervalMs: 250,
  });

  assertEquals(
    sample.liveAnimations.join("\n"),
    "",
    `expected no live (running/paused) animations under freeze, got:\n${sample.liveAnimations.join("\n")}`,
  );
  assertEquals(
    sample.rafCallbacks,
    0,
    `expected no non-diagnostic requestAnimationFrame activity under freeze, got ${sample.rafCallbacks} registrations in ${Math.round(sample.elapsedMs)}ms`,
  );
  assertTrue(
    sample.diagnosticRafCallbacks > 0,
    `expected the FPS meter's diagnostic rAF loop to keep sampling under freeze, got 0 marked registrations in ${Math.round(sample.elapsedMs)}ms`,
  );
}
