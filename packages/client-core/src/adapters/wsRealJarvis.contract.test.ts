import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Direction } from "@rtc/domain";
import { CLIENT_MSG, type JarvisEvent, SERVER_MSG } from "@rtc/shared";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import {
  JARVIS_FIRST_EVENT_TIMEOUT_MS,
  WsJarvisAdapter,
} from "./WsJarvisAdapter";

describe("WsJarvisAdapter (wire-mode JarvisPort)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("(a) registers listeners before sending jarvis.chat — a same-tick reply is not missed", () => {
    const ws = new FakeWsAdapter();
    const originalSend = ws.send.bind(ws);
    vi.spyOn(ws, "send").mockImplementation((type, payload) => {
      originalSend(type, payload);

      if (type === CLIENT_MSG.JARVIS_CHAT) {
        // If listeners weren't attached before this send() call, this
        // synchronous same-tick reply would have nowhere to land.
        ws.emit(SERVER_MSG.JARVIS_DELTA, { text: "hi" });
      }
    });

    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("hello").subscribe((event) => {
      received.push(event);
    });

    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.JARVIS_CHAT, payload: { text: "hello" } },
    ]);
    expect(received).toEqual([{ type: "delta", text: "hi" }]);
  });

  it("(b) surfaces delta/toolEvent/done frames as JarvisEvents and completes on done", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    let completed = false;
    adapter.ask("quote EURUSD").subscribe({
      next: (event: JarvisEvent) => {
        received.push(event);
      },
      complete: () => {
        completed = true;
      },
    });

    ws.emit(SERVER_MSG.JARVIS_DELTA, { text: "EUR" });
    ws.emit(SERVER_MSG.JARVIS_TOOL_EVENT, { tool: "quote", status: "running" });
    ws.emit(SERVER_MSG.JARVIS_DONE, {});

    expect(received).toEqual([
      { type: "delta", text: "EUR" },
      { type: "toolEvent", tool: "quote", status: "running" },
      { type: "done" },
    ]);
    expect(completed).toBe(true);
  });

  it("(b) surfaces an error frame and completes on it", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    let completed = false;
    adapter.ask("quote EURUSD").subscribe({
      next: (event: JarvisEvent) => {
        received.push(event);
      },
      complete: () => {
        completed = true;
      },
    });

    ws.emit(SERVER_MSG.JARVIS_ERROR, { message: "desk unavailable" });

    expect(received).toEqual([{ type: "error", message: "desk unavailable" }]);
    expect(completed).toBe(true);
  });

  it("(c) surfaces confirmRequest with all six fields including ratePrecision", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("buy 1m EURUSD").subscribe((event) => {
      received.push(event);
    });

    ws.emit(SERVER_MSG.JARVIS_CONFIRM_REQUEST, CONFIRM_REQUEST_PAYLOAD);

    expect(received).toEqual([
      { type: "confirmRequest", ...CONFIRM_REQUEST_PAYLOAD },
    ]);
  });

  it("(d) confirm() sends the CLIENT_MSG.JARVIS_CONFIRM frame", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);

    adapter.confirm("conf-1", true);

    expect(ws.sentMessages()).toEqual([
      {
        type: CLIENT_MSG.JARVIS_CONFIRM,
        payload: { confirmationId: "conf-1", approved: true },
      },
    ]);
  });

  it("(e) emits exactly one offline error and completes when no frame arrives within the deadline", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    let completed = false;
    adapter.ask("hello").subscribe({
      next: (event: JarvisEvent) => {
        received.push(event);
      },
      complete: () => {
        completed = true;
      },
    });

    vi.advanceTimersByTime(JARVIS_FIRST_EVENT_TIMEOUT_MS - 1);
    expect(received).toEqual([]);
    expect(completed).toBe(false);

    vi.advanceTimersByTime(1);
    expect(received).toEqual([
      {
        type: "error",
        message: "Jarvis is offline, sir — the desk link is down.",
      },
    ]);
    expect(completed).toBe(true);
  });

  it("(e) never applies an inter-frame timeout once the first frame has arrived", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("hello").subscribe((event) => {
      received.push(event);
    });

    ws.emit(SERVER_MSG.JARVIS_DELTA, { text: "EUR" });
    vi.advanceTimersByTime(JARVIS_FIRST_EVENT_TIMEOUT_MS * 2);
    ws.emit(SERVER_MSG.JARVIS_DONE, {});

    expect(received).toEqual([
      { type: "delta", text: "EUR" },
      { type: "done" },
    ]);
  });

  it("(f) unsubscribe detaches all five handlers; a later injected frame emits nothing", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    const subscription = adapter.ask("hello").subscribe((event) => {
      received.push(event);
    });
    subscription.unsubscribe();

    ws.emit(SERVER_MSG.JARVIS_DELTA, { text: "should not arrive" });
    ws.emit(SERVER_MSG.JARVIS_TOOL_EVENT, { tool: "x", status: "running" });
    ws.emit(SERVER_MSG.JARVIS_CONFIRM_REQUEST, CONFIRM_REQUEST_PAYLOAD);
    ws.emit(SERVER_MSG.JARVIS_DONE, {});
    ws.emit(SERVER_MSG.JARVIS_ERROR, { message: "should not arrive" });

    expect(received).toEqual([]);
  });
});

// A named tag (rather than an inline `{ type: "confirmRequest" }` literal)
// so `Extract<JarvisEvent, ...>` never takes an inline object type argument —
// the repo's `no-restricted-syntax` bans that even inside a type alias (see
// eslint.config.mjs's `restrictedSyntax` comment).
interface ConfirmRequestTag {
  readonly type: "confirmRequest";
}
type ConfirmRequestPayload = Omit<
  Extract<JarvisEvent, ConfirmRequestTag>,
  "type"
>;

const CONFIRM_REQUEST_PAYLOAD: ConfirmRequestPayload = {
  confirmationId: "conf-1",
  symbol: "EURUSD",
  direction: Direction.Buy,
  notional: 1_000_000,
  quotedPrice: 1.0851,
  ratePrecision: 4,
};
