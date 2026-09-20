import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeTicketSubmissionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts not submitted; submitPrice(quoteId, price) issues a quote command; on success submitted flips true", async () => {
      const h = makeHarness();
      const m = h.machines.ticketSubmission();

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([{ submitted: false }]);
        m.intents.submitPrice(7, 101.5);
        await settle();
        expect(h.driver.pendingWorkflowCommands()).toEqual([
          { kind: "quote", request: { quoteId: 7, price: 101.5 } },
        ]);
        expect(c.values.at(-1)).toEqual({ submitted: false });
        h.driver.resolveWorkflowCommand();
        await settle();
        expect(c.values.at(-1)).toEqual({ submitted: true });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("pass(quoteId) issues a pass command and flips submitted on success", async () => {
      const h = makeHarness();
      const m = h.machines.ticketSubmission();

      try {
        const c = collect(m.state$);
        m.intents.pass(8);
        await settle();
        expect(h.driver.pendingWorkflowCommands()).toEqual([
          { kind: "pass", quoteId: 8 },
        ]);
        h.driver.resolveWorkflowCommand();
        await settle();
        expect(c.values.at(-1)).toEqual({ submitted: true });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a failed command leaves submitted false (retryable): no true is ever emitted, and a retry can still succeed", async () => {
      const h = makeHarness();
      const m = h.machines.ticketSubmission();

      try {
        const c = collect(m.state$);
        m.intents.submitPrice(7, 101.5);
        await settle();
        h.driver.failWorkflowCommand(new Error("bust"));
        await settle();
        expect(
          c.values.every((state) => {
            return !state.submitted;
          }),
        ).toBe(true);
        m.intents.submitPrice(7, 102);
        await settle();
        h.driver.resolveWorkflowCommand();
        await settle();
        expect(c.values.at(-1)).toEqual({ submitted: true });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("dispose() releases an in-flight command; a fresh subscription afterwards yields the current value synchronously", async () => {
      const h = makeHarness();
      const m = h.machines.ticketSubmission();

      try {
        const c = collect(m.state$);
        m.intents.pass(8);
        await settle();
        c.unsubscribe();
        m.dispose();
        await settle();
        expect(h.driver.pendingWorkflowCommands()).toEqual([]);
        const fresh = collect(m.state$);
        expect(fresh.values).toEqual([{ submitted: false }]);
        fresh.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
