import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Direction } from "@rtc/domain";
import {
  CLIENT_MSG,
  type JarvisEvent,
  type JarvisHistoryEntry,
  SERVER_MSG,
} from "@rtc/shared";

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
        const { turnId } = payload as ChatFramePayload;
        ws.emit(SERVER_MSG.JARVIS_DELTA, { turnId, text: "hi" });
      }
    });

    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("hello").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    // A real UUID — crypto.randomUUID(), not a placeholder.
    expect(turnId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.JARVIS_CHAT, payload: { text: "hello", turnId } },
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

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_DELTA, { turnId, text: "EUR" });
    ws.emit(SERVER_MSG.JARVIS_TOOL_EVENT, {
      turnId,
      tool: "quote",
      status: "running",
    });
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId });

    expect(received).toEqual([
      { type: "delta", text: "EUR" },
      { type: "toolEvent", tool: "quote", status: "running" },
      { type: "done" },
    ]);
    expect(completed).toBe(true);
    // A normally-completed turn also fires a trailing cancel — harmless
    // server-side no-op (the server ignores a cancel whose turnId isn't
    // in-flight), and NOT something this adapter waits on: it always
    // completes the turn locally first. See createJarvisTurnStream's doc.
    expect(ws.sentMessages()).toEqual([
      {
        type: CLIENT_MSG.JARVIS_CHAT,
        payload: { text: "quote EURUSD", turnId },
      },
      { type: CLIENT_MSG.JARVIS_CANCEL, payload: { turnId } },
    ]);
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

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_ERROR, { turnId, message: "desk unavailable" });

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

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_CONFIRM_REQUEST, {
      turnId,
      ...CONFIRM_REQUEST_PAYLOAD,
    });

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

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_DELTA, { turnId, text: "EUR" });
    vi.advanceTimersByTime(JARVIS_FIRST_EVENT_TIMEOUT_MS * 2);
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId });

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
    const turnId = sentTurnId(ws);
    subscription.unsubscribe();

    ws.emit(SERVER_MSG.JARVIS_DELTA, { turnId, text: "should not arrive" });
    ws.emit(SERVER_MSG.JARVIS_TOOL_EVENT, {
      turnId,
      tool: "x",
      status: "running",
    });
    ws.emit(SERVER_MSG.JARVIS_CONFIRM_REQUEST, {
      turnId,
      ...CONFIRM_REQUEST_PAYLOAD,
    });
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId });
    ws.emit(SERVER_MSG.JARVIS_ERROR, { turnId, message: "should not arrive" });

    expect(received).toEqual([]);
  });

  it("(g) cancel frame: unsubscribing before completion sends JARVIS_CANCEL for the in-flight turn", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const subscription = adapter.ask("hello").subscribe();
    const turnId = sentTurnId(ws);

    subscription.unsubscribe();

    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.JARVIS_CHAT, payload: { text: "hello", turnId } },
      { type: CLIENT_MSG.JARVIS_CANCEL, payload: { turnId } },
    ]);
  });

  it("(g) cancel frame: the offline-timeout path also sends JARVIS_CANCEL for the turn it gave up on", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    adapter.ask("hello").subscribe();
    const turnId = sentTurnId(ws);

    vi.advanceTimersByTime(JARVIS_FIRST_EVENT_TIMEOUT_MS);

    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.JARVIS_CHAT, payload: { text: "hello", turnId } },
      { type: CLIENT_MSG.JARVIS_CANCEL, payload: { turnId } },
    ]);
  });

  it("(h) STRAGGLER REGRESSION: a frame carrying a different (stale) turnId is ignored, even by a brand-new turn's listeners", () => {
    // The P2 limitation this closes: the wire carried no correlation id, so
    // once turn A's listeners tore down (timeout, no cancel ever sent), a
    // server still streaming turn A had its stragglers land on whichever
    // turn subscribed NEXT — because listener dispatch was keyed only by
    // message TYPE, not by turn. Now every turn-scoped payload carries
    // turnId, and a mismatch is silently ignored regardless of which turn's
    // listeners happen to be the ones currently registered for that type.
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);

    const turnAReceived: JarvisEvent[] = [];
    adapter.ask("first").subscribe((event) => {
      turnAReceived.push(event);
    });
    const turnAId = sentTurnId(ws, 0);

    // Turn A times out — its listeners tear down (no cancel-side effect on
    // the fake server, so it could still be "streaming" turn A for real).
    vi.advanceTimersByTime(JARVIS_FIRST_EVENT_TIMEOUT_MS);
    expect(turnAReceived).toEqual([
      {
        type: "error",
        message: "Jarvis is offline, sir — the desk link is down.",
      },
    ]);

    const turnBReceived: JarvisEvent[] = [];
    adapter.ask("second").subscribe((event) => {
      turnBReceived.push(event);
    });
    const turnBId = sentTurnId(ws, 1);
    expect(turnBId).not.toBe(turnAId);

    // Turn A's straggler delta arrives late, carrying turn A's turnId — it
    // reaches turn B's (the only currently-registered) delta handler, but is
    // filtered out by the turnId mismatch.
    ws.emit(SERVER_MSG.JARVIS_DELTA, {
      turnId: turnAId,
      text: "late straggler",
    });
    expect(turnBReceived).toEqual([]);

    // Turn B's own, correctly-correlated frame lands normally.
    ws.emit(SERVER_MSG.JARVIS_DELTA, { turnId: turnBId, text: "hi" });
    expect(turnBReceived).toEqual([{ type: "delta", text: "hi" }]);
  });

  it("(i) history: ask() sends the injected source's entries, capped at 20 (25 supplied)", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const entries: readonly JarvisHistoryEntry[] = Array.from(
      { length: 25 },
      (_, i): JarvisHistoryEntry => {
        return { role: i % 2 === 0 ? "user" : "jarvis", text: `entry-${i}` };
      },
    );
    adapter.setHistorySource(() => {
      return entries;
    });

    adapter.ask("hello").subscribe();

    const turnId = sentTurnId(ws);
    const payload = ws.sentMessages()[0]?.payload as ChatFramePayload;

    expect(payload.text).toBe("hello");
    expect(payload.turnId).toBe(turnId);
    expect(payload.history).toEqual(entries.slice(-20));
    expect(payload.history).toHaveLength(20);
  });

  it("(i) history: no history field is sent when the source is left at its default (())=>[])", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);

    adapter.ask("hello").subscribe();

    const turnId = sentTurnId(ws);
    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.JARVIS_CHAT, payload: { text: "hello", turnId } },
    ]);
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

    const turn1Id = sentTurnId(ws, 0);
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId: turn1Id });

    expect(turn1Completed).toBe(true);
    // Turn 2 must still be open — not killed by turn 1's frame.
    expect(turn2Completed).toBe(false);
    expect(turn2Received).toEqual([]);

    // Turn 2's own reply reaches it normally.
    const turn2Id = sentTurnId(ws, 1);
    ws.emit(SERVER_MSG.JARVIS_DELTA, { turnId: turn2Id, text: "hi" });
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId: turn2Id });

    expect(turn2Received).toEqual([
      { type: "delta", text: "hi" },
      { type: "done" },
    ]);
    expect(turn2Completed).toBe(true);
  });
});

describe("WsJarvisAdapter.availability$()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers the handler and sends jarvis.subscribe before emitting anything", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: boolean[] = [];
    adapter.availability$().subscribe((available) => {
      received.push(available);
    });

    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: undefined },
    ]);
    expect(received).toEqual([]);
  });

  it("emits true when the server reports available", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: boolean[] = [];
    adapter.availability$().subscribe((available) => {
      received.push(available);
    });

    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: true });
    expect(received).toEqual([true]);
  });

  it("emits false when the server reports unavailable", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: boolean[] = [];
    adapter.availability$().subscribe((available) => {
      received.push(available);
    });

    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: false });
    expect(received).toEqual([false]);
  });

  it("emits false and completes when the server never answers within the first-event timeout", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: boolean[] = [];
    let completed = false;
    adapter.availability$().subscribe({
      next: (available: boolean) => {
        received.push(available);
      },
      complete: () => {
        completed = true;
      },
    });

    vi.advanceTimersByTime(JARVIS_FIRST_EVENT_TIMEOUT_MS - 1);
    expect(received).toEqual([]);
    expect(completed).toBe(false);

    vi.advanceTimersByTime(1);
    expect(received).toEqual([false]);
    expect(completed).toBe(true);
  });

  it("re-queries the server with a fresh jarvis.subscribe on every (re)subscribe", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const availability$ = adapter.availability$();

    const first: boolean[] = [];
    const sub1 = availability$.subscribe((available) => {
      first.push(available);
    });
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: true });
    sub1.unsubscribe();

    const second: boolean[] = [];
    availability$.subscribe((available) => {
      second.push(available);
    });
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: false });

    expect(
      ws.sentMessages().filter((m) => {
        return m.type === CLIENT_MSG.JARVIS_SUBSCRIBE;
      }),
    ).toHaveLength(2);
    expect(first).toEqual([true]);
    expect(second).toEqual([false]);
  });

  it("unsubscribing tears down the JARVIS_AVAILABILITY handler", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: boolean[] = [];
    const subscription = adapter.availability$().subscribe((available) => {
      received.push(available);
    });
    subscription.unsubscribe();

    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: true });
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

/** The shape of a sent `CLIENT_MSG.JARVIS_CHAT` frame's payload — named
 * rather than an inline cast (`no-restricted-syntax`, same rationale as
 * `ConfirmRequestPayload` above). */
interface ChatFramePayload {
  readonly text: string;
  readonly turnId: string;
  readonly history?: readonly JarvisHistoryEntry[];
}

/** Every `ask()` call generates a fresh `crypto.randomUUID()` turnId, so
 * these tests read it back off the wire rather than asserting a fixed value
 * — `index` selects which `jarvis.chat` frame (0 = first turn, 1 = second, …)
 * for tests that drive more than one turn. */
function sentTurnId(ws: FakeWsAdapter, index = 0): string {
  const chatFrames = ws.sentMessages().filter((m) => {
    return m.type === CLIENT_MSG.JARVIS_CHAT;
  });
  const frame = chatFrames[index];

  if (!frame) {
    throw new Error(`no jarvis.chat frame at index ${index}`);
  }

  return (frame.payload as ChatFramePayload).turnId;
}
