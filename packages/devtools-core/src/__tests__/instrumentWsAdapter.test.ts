import { describe, expect, it, vi } from "vitest";

import { DevtoolsHub } from "../DevtoolsHub";
import { instrumentWsAdapter } from "../instrument/wsAdapter";
import { FakeWsAdapter } from "./FakeWsAdapter.testHelpers";

describe("instrumentWsAdapter", () => {
  it("delegates send and reports wire:out", () => {
    const hub = new DevtoolsHub();
    const wireOut = vi.spyOn(hub, "wireOut");
    const adapter = new FakeWsAdapter();

    const wrapped = instrumentWsAdapter(adapter, hub);
    wrapped.send("PRICE_SUB", { symbol: "EURUSD" });

    expect(wireOut).toHaveBeenCalledWith("PRICE_SUB", { symbol: "EURUSD" });
    expect(adapter.sent).toEqual([
      { type: "PRICE_SUB", payload: { symbol: "EURUSD" } },
    ]);
  });

  it("delegates on and reports wire:in when the handler fires", () => {
    const hub = new DevtoolsHub();
    const wireIn = vi.spyOn(hub, "wireIn");
    const adapter = new FakeWsAdapter();
    const handler = vi.fn();

    const wrapped = instrumentWsAdapter(adapter, hub);
    const unsubscribe = wrapped.on("PRICE", handler);
    adapter.handlers.get("PRICE")?.({ mid: 1.1 });

    expect(wireIn).toHaveBeenCalledWith("PRICE", { mid: 1.1 });
    expect(handler).toHaveBeenCalledWith({ mid: 1.1 });

    unsubscribe();
    expect(adapter.handlers.has("PRICE")).toBe(false);
  });

  it("delegates rpc, reports wire:out on call and wire:in on reply", async () => {
    const hub = new DevtoolsHub();
    const wireOut = vi.spyOn(hub, "wireOut");
    const wireIn = vi.spyOn(hub, "wireIn");
    const adapter = new FakeWsAdapter();

    const wrapped = instrumentWsAdapter(adapter, hub);
    const result = await wrapped.rpc("EXECUTE_TRADE", { qty: 1 });

    expect(wireOut).toHaveBeenCalledWith("EXECUTE_TRADE", { qty: 1 });
    expect(wireIn).toHaveBeenCalledWith("EXECUTE_TRADE:reply", {
      type: "EXECUTE_TRADE",
      payload: { qty: 1 },
      ok: true,
    });
    expect(result).toEqual({
      type: "EXECUTE_TRADE",
      payload: { qty: 1 },
      ok: true,
    });
  });

  it("never blocks send/on/rpc when the hub throws", async () => {
    const hub = new DevtoolsHub();
    vi.spyOn(hub, "wireOut").mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(hub, "wireIn").mockImplementation(() => {
      throw new Error("boom");
    });
    const adapter = new FakeWsAdapter();
    const wrapped = instrumentWsAdapter(adapter, hub);
    const handler = vi.fn();

    expect(() => {
      wrapped.send("X", 1);
    }).not.toThrow();
    expect(adapter.sent).toEqual([{ type: "X", payload: 1 }]);

    expect(() => {
      wrapped.on("Y", handler);
      adapter.handlers.get("Y")?.(2);
    }).not.toThrow();
    expect(handler).toHaveBeenCalledWith(2);

    await expect(wrapped.rpc("Z", 3)).resolves.toEqual({
      type: "Z",
      payload: 3,
      ok: true,
    });
  });

  it("delegates all other members untouched, bound to the target", () => {
    const hub = new DevtoolsHub();
    const adapter = new FakeWsAdapter();
    const wrapped = instrumentWsAdapter(adapter, hub);

    expect(wrapped.connectionEvents()).toBe("connected");
  });

  describe("redactOut", () => {
    it("the hub sees a redacted jarvis.key frame, and the socket sees the real one", () => {
      const hub = new DevtoolsHub();
      const wireOut = vi.spyOn(hub, "wireOut");
      const adapter = new FakeWsAdapter();
      const wrapped = instrumentWsAdapter(adapter, hub, {
        redactOut: redactKey,
      });

      wrapped.sendIfOpen("jarvis.key", secretFrame);
      wrapped.send("jarvis.key", secretFrame);

      expect(wireOut).toHaveBeenCalledTimes(2);
      expect(wireOut).toHaveBeenNthCalledWith(1, "jarvis.key", {
        action: "set",
        redacted: true,
      });
      expect(wireOut).toHaveBeenNthCalledWith(2, "jarvis.key", {
        action: "set",
        redacted: true,
      });
      expect(JSON.stringify(wireOut.mock.calls)).not.toContain("SECRET");
      expect(adapter.sent).toEqual([
        { type: "jarvis.key", payload: secretFrame },
        { type: "jarvis.key", payload: secretFrame },
      ]);
    });

    it("redacts an rpc frame the same way", async () => {
      const hub = new DevtoolsHub();
      const wireOut = vi.spyOn(hub, "wireOut");
      const wrapped = instrumentWsAdapter(new FakeWsAdapter(), hub, {
        redactOut: redactKey,
      });

      await wrapped.rpc("jarvis.key", secretFrame);

      expect(wireOut).toHaveBeenCalledWith("jarvis.key", {
        action: "set",
        redacted: true,
      });
    });

    it("sendIfOpen reports the wire frame and returns the adapter's answer", () => {
      const hub = new DevtoolsHub();
      const wireOut = vi.spyOn(hub, "wireOut");
      const wrapped = instrumentWsAdapter(new FakeWsAdapter(), hub);

      expect(wrapped.sendIfOpen("PING", { n: 1 })).toBe(true);
      expect(wireOut).toHaveBeenCalledWith("PING", { n: 1 });
    });

    it("a redactOut that throws never blocks the real send, and nothing unredacted reaches the hub", () => {
      const hub = new DevtoolsHub();
      const wireOut = vi.spyOn(hub, "wireOut");
      const adapter = new FakeWsAdapter();
      const wrapped = instrumentWsAdapter(adapter, hub, {
        redactOut: () => {
          throw new Error("boom");
        },
      });

      wrapped.sendIfOpen("jarvis.key", secretFrame);

      expect(adapter.sent).toHaveLength(1);
      expect(wireOut).not.toHaveBeenCalled();
    });

    function redactKey(type: string, payload: unknown): unknown {
      return type === "jarvis.key"
        ? { action: (payload as ActionOnly).action, redacted: true }
        : payload;
    }

    const secretFrame = {
      action: "set",
      provider: "anthropic",
      key: "sk-ant-SECRET",
      capUsd: 1,
    };
  });
});

interface ActionOnly {
  readonly action: string;
}
