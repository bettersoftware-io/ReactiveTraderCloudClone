import { describe, expect, it } from "vitest";

import { Direction, JARVIS_CONFIRM_TIMEOUT_MS } from "@rtc/domain";

import { type FakeClock, withFakeClock } from "#/harness/clock";
import type { CoreHarness, MakeHarness } from "#/harness/harness";
import {
  clockPause,
  createConfirmRequest,
  readJarvis,
} from "#/suites/jarvisKit";

/** `presenters.jarvis`'s confirmation card: the countdown, its expiry, the
 * two resolutions, and a newer card superseding an older one. */
export function describeJarvisConfirmationCases(
  makeHarness: MakeHarness,
): void {
  describe("confirmation", () => {
    it("a confirmRequest shows the card at full time, and it counts down once per second", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          await openCard(h, clock, "c-1");
          expect(
            (await readJarvis(h, clockPause(clock))).pendingConfirmation,
          ).toEqual({
            confirmationId: "c-1",
            symbol: "EURUSD",
            direction: Direction.Buy,
            notional: 5_000_000,
            quotedPrice: 1.1,
            ratePrecision: 5,
            remainingFraction: 1,
          });
          await clock.advance(1000);
          await clock.settle();
          expect(
            (await readJarvis(h, clockPause(clock))).pendingConfirmation
              ?.remainingFraction,
          ).toBeCloseTo(1 - 1000 / JARVIS_CONFIRM_TIMEOUT_MS, 10);
        } finally {
          await h.teardown();
        }
      });
    });

    it("the card expires at JARVIS_CONFIRM_TIMEOUT_MS: the port is told no, and the card clears", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          await openCard(h, clock, "c-1");
          await clock.advance(JARVIS_CONFIRM_TIMEOUT_MS - 1000);
          await clock.settle();
          expect(h.driver.confirmations()).toEqual([]);
          await clock.advance(1000);
          await clock.settle();
          expect(h.driver.confirmations()).toEqual([
            { id: "c-1", approved: false },
          ]);
          expect(
            (await readJarvis(h, clockPause(clock))).pendingConfirmation,
          ).toBe(null);
        } finally {
          await h.teardown();
        }
      });
    });

    it("approve tells the port yes, clears the card, and stops the countdown", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          await openCard(h, clock, "c-1");
          h.app.presenters.jarvis.intents.approveConfirmation();
          await clock.settle();
          await clock.advance(JARVIS_CONFIRM_TIMEOUT_MS);
          await clock.settle();
          expect(h.driver.confirmations()).toEqual([
            { id: "c-1", approved: true },
          ]);
          expect(
            (await readJarvis(h, clockPause(clock))).pendingConfirmation,
          ).toBe(null);
        } finally {
          await h.teardown();
        }
      });
    });

    it("decline tells the port no once, clears the card, and stops the countdown", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          await openCard(h, clock, "c-1");
          h.app.presenters.jarvis.intents.declineConfirmation();
          await clock.settle();
          await clock.advance(JARVIS_CONFIRM_TIMEOUT_MS);
          await clock.settle();
          expect(h.driver.confirmations()).toEqual([
            { id: "c-1", approved: false },
          ]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("approve and decline with no card pending tell the port nothing", async () => {
      const h = makeHarness();

      try {
        h.app.presenters.jarvis.intents.approveConfirmation();
        h.app.presenters.jarvis.intents.declineConfirmation();
        await readJarvis(h);
        expect(h.driver.confirmations()).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("a newer card supersedes the older countdown: only the newer one ever expires", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          await openCard(h, clock, "c-1");
          await clock.advance(10_000);
          await clock.settle();
          h.driver.replyJarvis([createConfirmRequest("c-2")]);
          await clock.settle();
          expect(
            (await readJarvis(h, clockPause(clock))).pendingConfirmation
              ?.confirmationId,
          ).toBe("c-2");
          await clock.advance(JARVIS_CONFIRM_TIMEOUT_MS);
          await clock.settle();
          expect(h.driver.confirmations()).toEqual([
            { id: "c-2", approved: false },
          ]);
        } finally {
          await h.teardown();
        }
      });
    });

    it("dispose mid-countdown: the port is never told no afterwards", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          await openCard(h, clock, "c-1");
          h.app.presenters.jarvis.dispose();
          await clock.advance(JARVIS_CONFIRM_TIMEOUT_MS);
          await clock.settle();
          expect(h.driver.confirmations()).toEqual([]);
        } finally {
          await h.teardown();
        }
      });
    });
  });
}

/** Start a turn and answer it with a confirmRequest, leaving it open. */
async function openCard(
  h: CoreHarness,
  clock: FakeClock,
  confirmationId: string,
): Promise<void> {
  h.app.presenters.jarvis.intents.send("buy 5m eurusd");
  await clock.settle();
  h.driver.replyJarvis([createConfirmRequest(confirmationId)]);
  await clock.settle();
}
