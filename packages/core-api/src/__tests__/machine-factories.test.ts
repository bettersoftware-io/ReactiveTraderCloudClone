import { describe, expectTypeOf, it } from "vitest";

import type {
  JarvisMachineHandle,
  MachineFactories,
  TileExecutionState,
} from "#/index";

describe("MachineFactories contract", () => {
  it("has exactly the fourteen factory members", () => {
    expectTypeOf<keyof MachineFactories>().toEqualTypeOf<
      | "tileExecution"
      | "rfqTile"
      | "staleFlag"
      | "analyticsStaleFlag"
      | "rowHighlight"
      | "notional"
      | "rfqSubmission"
      | "ticketSubmission"
      | "rfqCountdown"
      | "layout"
      | "boot"
      | "orderTicket"
      | "accountAccess"
      | "accountAction"
    >();
  });

  it("machine state unions are closed", () => {
    expectTypeOf<TileExecutionState["status"]>().toEqualTypeOf<
      "ready" | "started" | "tooLong" | "finished" | "timeout"
    >();
    expectTypeOf<JarvisMachineHandle>().toHaveProperty("events$");
  });
});
