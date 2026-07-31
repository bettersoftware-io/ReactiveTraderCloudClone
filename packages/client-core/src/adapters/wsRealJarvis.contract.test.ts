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

  it("REGRESSION: a turn started synchronously from a prior turn's complete() is not killed by that turn's own done frame", () => {
    // WsAdapter (and this fake, mirroring it) dispatch a server frame with
    // `for (const handler of [...handlers])` — a SNAPSHOT of the per-type
    // handler Set. Without the snapshot, this reproduces a real bug: turn
    // 1's JARVIS_DONE handler calls subscriber.complete() synchronously,
    // which (via JarvisMachine's concatMap) can synchronously start turn 2
    // — and turn 2's ask() registers a NEW JARVIS_DONE handler on the SAME
    // Set that dispatch is still mid-iteration over for THIS frame. ES Set
    // iterators visit mid-iteration insertions, so the live-Set version
    // would run turn 2's brand-new handler against turn 1's stale done
    // payload and instantly (and wrongly) complete turn 2 before its own
    // chat reply ever arrives — the reply then lands on turn 2's already
    // torn-down handlers and is silently lost.
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);

    let turn1Completed = false;
    const turn2Received: JarvisEvent[] = [];
    let turn2Completed = false;

    adapter.ask("first").subscribe({
      next: () => {},
      complete: () => {
        turn1Completed = true;
        // Simulates JarvisMachine's concatMap advancing synchronously to
        // the next queued send() once the prior turn completes.
        adapter.ask("second").subscribe({
          next: (event: JarvisEvent) => {
            turn2Received.push(event);
          },
          complete: () => {
            turn2Completed = true;
          },
        });
      },
    });

    ws.emit(SERVER_MSG.JARVIS_DONE, {});

    expect(turn1Completed).toBe(true);
    // Turn 2 must still be open — not killed by turn 1's frame.
    expect(turn2Completed).toBe(false);
    expect(turn2Received).toEqual([]);

    // Turn 2's own reply reaches it normally.
    ws.emit(SERVER_MSG.JARVIS_DELTA, { text: "hi" });
    ws.emit(SERVER_MSG.JARVIS_DONE, {});

    expect(turn2Received).toEqual([
      { type: "delta", text: "hi" },
      { type: "done" },
    ]);
    expect(turn2Completed).toBe(true);
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
