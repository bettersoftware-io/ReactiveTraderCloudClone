import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeConnectionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("status$ carries CONNECTING synchronously on subscribe", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.connection.status$);
        expect(c.values).toEqual([ConnectionStatus.CONNECTING]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("folds gateway events: connected → disconnected → reconnect attempt", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        h.driver.emitConnection({ type: "gatewayDisconnected" });
        h.driver.emitConnection({ type: "reconnectAttempt" });
        expect(c.values).toEqual([
          ConnectionStatus.CONNECTING,
          ConnectionStatus.CONNECTED,
          ConnectionStatus.DISCONNECTED,
          ConnectionStatus.CONNECTING,
        ]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber replays the current status, not the history", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        const late = collect(h.app.presenters.connection.status$);
        expect(late.values).toEqual([ConnectionStatus.CONNECTED]);
        first.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("tears down on the last unsubscribe: a fresh subscriber restarts from CONNECTING", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.connection.status$);
        h.driver.emitConnection({ type: "gatewayConnected" });
        first.unsubscribe();
        const again = collect(h.app.presenters.connection.status$);
        expect(again.values).toEqual([ConnectionStatus.CONNECTING]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
