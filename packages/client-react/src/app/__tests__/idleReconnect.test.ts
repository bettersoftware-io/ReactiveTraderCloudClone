import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type App, createApp } from "@rtc/client-core";
import { ConnectionStatus, IDLE_TIMEOUT_MS } from "@rtc/domain";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";

// Executable promotion of specs/features/shared/connection.feature:40-44
// ("Reconnect from idle disconnection"). Lives here as a plain vitest
// fake-timers test rather than in tests/presenter: that tier's World
// hard-fakes connectionEvents (tests/presenter/scenarios/_buildApp.ts) and
// runs in Node without a DOM, while the scenario under test is precisely the
// REAL browser composition — buildBrowserPorts()'s merged idle-timer +
// reconnect$ wiring — which needs jsdom and import.meta.env.
describe("idle disconnection → Reconnect button (simulator branch)", () => {
  let app: App;
  let statuses: ConnectionStatus[];
  let unsubscribe: () => void;

  beforeEach(() => {
    // Fake timers BEFORE building ports so the idle countdown uses the
    // patched clock (same ordering as tests/presenter/vitest-fake-timers).
    vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
    app = createApp(buildBrowserPorts());
    statuses = [];
    const sub = app.presenters.connection.status$.subscribe((s) => {
      statuses.push(s);
    });

    unsubscribe = (): void => {
      sub.unsubscribe();
    };
  });

  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
  });

  it("goes IDLE_DISCONNECTED after the 15-minute idle timeout", async () => {
    expect(statuses.at(-1)).toBe(ConnectionStatus.CONNECTED);
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
    expect(statuses.at(-1)).toBe(ConnectionStatus.IDLE_DISCONNECTED);
  });

  it("commands.reconnect() transitions CONNECTING then CONNECTED", async () => {
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
    expect(statuses.at(-1)).toBe(ConnectionStatus.IDLE_DISCONNECTED);

    const before = statuses.length;
    app.commands.reconnect();

    const after = statuses.slice(before);
    expect(after).toEqual([
      ConnectionStatus.CONNECTING,
      ConnectionStatus.CONNECTED,
    ]);
  });
});
