import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as conn from "../scenarios/_shared/connection";
import type { ConnectionStatus } from "@rtc/domain";

// String-literal stand-ins for the ConnectionStatus const enum. Same trick as
// presenter/vitest-quickpickle-fake-timers/steps/connection.steps.ts — verbatimModuleSyntax +
// isolatedModules forbid accessing ambient const enum values from a different
// package. The members are string-valued so the cast is safe at runtime.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_OFFLINE = "OFFLINE_DISCONNECTED" as unknown as ConnectionStatus;
const CS_DISCONNECTED = "DISCONNECTED" as unknown as ConnectionStatus;
const CS_CONNECTING = "CONNECTING" as unknown as ConnectionStatus;

describe("@presenter Feature: Connection status", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("connected status is shown in the footer", async () => {
    await conn.noopAssertConnectionUiPresent(w);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 3);
  });

  it("connection overlay is hidden when connected", async () => {
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 1);
  });

  it("going offline shows the overlay with an offline message", async () => {
    await conn.browserGoesOffline(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
    await conn.noopAssertConnectionUiPresent(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
  });

  it("coming back online dismisses the overlay", async () => {
    await conn.browserGoesOffline(w);
    await conn.expectStatusEqualsWithin(w, CS_OFFLINE, 3);
    await conn.browserComesBackOnline(w);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 5);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 3);
  });

  it("gateway disconnect transitions through reconnecting back to connected", async () => {
    await conn.gatewayDrops(w);
    await conn.expectStatusEqualsWithin(w, CS_DISCONNECTED, 3);
    await conn.gatewayAttemptsReconnect(w);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTING, 3);
    await conn.gatewayConnectionRestored(w);
    await conn.expectStatusEqualsWithin(w, CS_CONNECTED, 3);
  });
});
