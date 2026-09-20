import { describe, expect, it, vi } from "vitest";

import type { RfqSubmissionState } from "@rtc/core-api";
import {
  CREDIT_QUANTITY_MULTIPLIER,
  type CreateRfqInput,
  Direction,
  RFQ_REDIRECT_DELAY_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

const INPUT: CreateRfqInput = {
  instrumentId: 1,
  dealerIds: [1],
  quantity: 1,
  direction: Direction.Buy,
};

function statuses(values: readonly RfqSubmissionState[]): string[] {
  return values.map((state) => {
    return state.status;
  });
}

export function describeRfqSubmissionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts editing; submit() → submitting with one pending createRfq; the id → confirmed{rfqId}; onRedirect(rfqId) fires at exactly RFQ_REDIRECT_DELAY_MS and the machine returns to editing", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([{ status: "editing" }]);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          expect(statuses(c.values)).toEqual(["editing", "submitting"]);
          expect(
            h.driver.pendingWorkflowCommands().map((command) => {
              return command.kind;
            }),
          ).toEqual(["createRfq"]);
          h.driver.resolveWorkflowCommand(42);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "confirmed", rfqId: 42 });
          await clock.advance(RFQ_REDIRECT_DELAY_MS - 1);
          await clock.settle();
          expect(onRedirect).not.toHaveBeenCalled();
          await clock.advance(1);
          await clock.settle();
          expect(onRedirect).toHaveBeenCalledWith(42);
          expect(onRedirect).toHaveBeenCalledTimes(1);
          expect(c.values.at(-1)).toEqual({ status: "editing" });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a second round trip works after the redirect returned it to editing", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          h.driver.resolveWorkflowCommand(1);
          await clock.settle();
          await clock.advance(RFQ_REDIRECT_DELAY_MS);
          await clock.settle();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          h.driver.resolveWorkflowCommand(2);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "confirmed", rfqId: 2 });
          await clock.advance(RFQ_REDIRECT_DELAY_MS);
          await clock.settle();
          expect(onRedirect.mock.calls).toEqual([[1], [2]]);
          expect(c.values.at(-1)).toEqual({ status: "editing" });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a failed create returns to editing with no confirmation and no redirect", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          h.driver.failWorkflowCommand(new Error("bust"));
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "editing" });
          expect(statuses(c.values)).not.toContain("confirmed");
          await clock.advance(RFQ_REDIRECT_DELAY_MS);
          await clock.settle();
          expect(onRedirect).not.toHaveBeenCalled();
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a second submit() while one is in flight supersedes it: the first request is withdrawn, the second's id confirms", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          m.intents.submit({ ...INPUT, quantity: 2 }, onRedirect);
          await clock.settle();
          const pending = h.driver.pendingWorkflowCommands();
          expect(pending).toHaveLength(1);
          expect(
            pending[0]?.kind === "createRfq" && pending[0].request.quantity,
          ).toBe(2 * CREDIT_QUANTITY_MULTIPLIER);
          h.driver.resolveWorkflowCommand(9);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "confirmed", rfqId: 9 });
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dispose() before the redirect delay cancels the redirect: onRedirect never fires", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqSubmission();

        try {
          const c = collect(m.state$);
          const onRedirect = vi.fn();
          m.intents.submit(INPUT, onRedirect);
          await clock.settle();
          h.driver.resolveWorkflowCommand(5);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({ status: "confirmed", rfqId: 5 });
          c.unsubscribe();
          m.dispose();
          await clock.advance(RFQ_REDIRECT_DELAY_MS);
          await clock.settle();
          expect(onRedirect).not.toHaveBeenCalled();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
