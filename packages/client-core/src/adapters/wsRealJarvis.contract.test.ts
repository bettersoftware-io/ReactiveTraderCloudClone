import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_JARVIS_BRAIN, Direction, JARVIS_BRAINS } from "@rtc/domain";
import {
  CLIENT_MSG,
  type DriveBatchV1,
  type JarvisEvent,
  type JarvisHistoryEntry,
  type PanelSpecV1,
  SERVER_MSG,
} from "@rtc/shared";

import { UNSUPPORTED_SENTINEL_SPEC } from "#/presenters/JarvisPanelsMachine";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import type { JarvisAvailability } from "./jarvisPort";
import {
  JARVIS_AVAILABILITY_TIMEOUT_MS,
  JARVIS_TURN_FIRST_EVENT_TIMEOUT_MS,
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

    vi.advanceTimersByTime(JARVIS_TURN_FIRST_EVENT_TIMEOUT_MS - 1);
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
    vi.advanceTimersByTime(JARVIS_TURN_FIRST_EVENT_TIMEOUT_MS * 2);
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId });

    expect(received).toEqual([
      { type: "delta", text: "EUR" },
      { type: "done" },
    ]);
  });

  it("(f) unsubscribe detaches all six handlers; a later injected frame emits nothing", () => {
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
    ws.emit(SERVER_MSG.JARVIS_PANEL, {
      turnId,
      panelId: "p1",
      spec: VALID_PANEL_SPEC,
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

    vi.advanceTimersByTime(JARVIS_TURN_FIRST_EVENT_TIMEOUT_MS);

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
    vi.advanceTimersByTime(JARVIS_TURN_FIRST_EVENT_TIMEOUT_MS);
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

  it("(j) ask(text, options) forwards brain/effort onto the CLIENT_MSG.JARVIS_CHAT payload", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);

    adapter
      .ask("hello", { brain: "claude-opus-5", effort: "high" })
      .subscribe();

    const turnId = sentTurnId(ws);
    expect(ws.sentMessages()).toEqual([
      {
        type: CLIENT_MSG.JARVIS_CHAT,
        payload: {
          text: "hello",
          turnId,
          brain: "claude-opus-5",
          effort: "high",
        },
      },
    ]);
  });

  it("(j) ask(text) with no options omits brain/effort entirely, not as undefined-valued keys", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);

    adapter.ask("hello").subscribe();

    const turnId = sentTurnId(ws);
    const payload = ws.sentMessages()[0]?.payload as Record<string, unknown>;
    expect(payload).toEqual({ text: "hello", turnId });
    expect("brain" in payload).toBe(false);
    expect("effort" in payload).toBe(false);
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

describe("WsJarvisAdapter panel events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a VALID panel payload is parsed and re-emitted with the normalized spec", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("show me GBP volatility").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_PANEL, {
      turnId,
      panelId: "panel-1",
      spec: VALID_PANEL_SPEC,
    });

    expect(received).toEqual([
      { type: "panel", panelId: "panel-1", spec: VALID_PANEL_SPEC },
    ]);
  });

  it("REGRESSION: the emitted spec is parsePanelSpec's NORMALIZED result, not the raw wire payload re-emitted verbatim", () => {
    // Pins the seam a mutation (`spec: spec as never` on the happy path in
    // `buildPanelEvent`) can silently pass: a payload spec that already
    // matches VALID_PANEL_SPEC field-for-field can't distinguish "emitted the
    // raw payload" from "emitted parsePanelSpec's rebuilt object" under
    // structural equality. An UNKNOWN extra field does distinguish them —
    // parsePanelSpec reconstructs the PanelSpecV1 field-by-field from its own
    // known keys, so a raw pass-through would leak "bogus" onto the emitted
    // event and a normalized one would not.
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("show me GBP volatility").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_PANEL, {
      turnId,
      panelId: "panel-1",
      spec: { ...VALID_PANEL_SPEC, bogus: "x" },
    });

    expect(received).toHaveLength(1);
    const event = received[0];

    if (event?.type !== "panel") {
      throw new Error("expected a panel event");
    }

    expect(event.spec).toEqual(VALID_PANEL_SPEC);
    expect("bogus" in event.spec).toBe(false);
  });

  it("an INVALID spec substitutes UNSUPPORTED_SENTINEL_SPEC (by reference), keeping the wire panelId", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("show me GBP volatility").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_PANEL, {
      turnId,
      panelId: "panel-1",
      spec: {
        v: 1,
        title: "",
        source: { kind: "blotter" },
        viz: { kind: "table" },
      },
    });

    expect(received).toHaveLength(1);
    const event = received[0];

    if (event?.type !== "panel") {
      throw new Error("expected a panel event");
    }

    expect(event.panelId).toBe("panel-1");
    expect(event.spec).toBe(UNSUPPORTED_SENTINEL_SPEC);
  });

  it("a garbage panelId (empty string) is replaced by a synthesized panel-invalid-<n> id, sentinel spec", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("show me GBP volatility").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_PANEL, {
      turnId,
      panelId: "",
      spec: VALID_PANEL_SPEC,
    });

    expect(received).toHaveLength(1);
    const event = received[0];

    if (event?.type !== "panel") {
      throw new Error("expected a panel event");
    }

    expect(event.panelId).toMatch(/^panel-invalid-\d+$/);
    expect(event.spec).toBe(UNSUPPORTED_SENTINEL_SPEC);
  });

  it("a missing panelId (non-string) is likewise synthesized, sentinel spec, and never throws", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("show me GBP volatility").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    expect(() => {
      ws.emit(SERVER_MSG.JARVIS_PANEL, {
        turnId,
        panelId: undefined,
        spec: VALID_PANEL_SPEC,
      });
    }).not.toThrow();

    expect(received).toHaveLength(1);
    const event = received[0];

    if (event?.type !== "panel") {
      throw new Error("expected a panel event");
    }

    expect(event.panelId).toMatch(/^panel-invalid-\d+$/);
    expect(event.spec).toBe(UNSUPPORTED_SENTINEL_SPEC);
  });

  it("REGRESSION: an unrelated/unknown wire message type is ignored (no panel event emitted)", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("hello").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    ws.emit("some.unknown.type", { turnId, whatever: true });
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId });

    expect(received).toEqual([{ type: "done" }]);
  });
});

describe("WsJarvisAdapter command events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a VALID batch payload is parsed and re-emitted normalized", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("set up my morning workspace").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_COMMAND, { turnId, batch: VALID_DRIVE_BATCH });

    expect(received).toEqual([{ type: "command", batch: VALID_DRIVE_BATCH }]);
  });

  it("REGRESSION: the emitted batch is parseDriveBatch's NORMALIZED result, not the raw wire payload re-emitted verbatim", () => {
    // Mirrors the equivalent panel regression test: an extra unknown field on
    // a command entry can't be distinguished from "re-emitted the rebuilt
    // object" by structural equality alone unless that extra field is
    // actually stripped — parseDriveBatch reconstructs each DriveCommandV1
    // field-by-field from its own known keys, so a raw pass-through would
    // leak the bogus field onto the emitted event and a normalized one would
    // not.
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("set up my morning workspace").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_COMMAND, {
      turnId,
      batch: {
        v: 1,
        commands: [{ kind: "switchTab", tab: "fx", bogus: "x" }],
      },
    });

    expect(received).toHaveLength(1);
    const event = received[0];

    if (event?.type !== "command") {
      throw new Error("expected a command event");
    }

    expect(event.batch).toEqual(VALID_DRIVE_BATCH);
    expect(
      event.batch.commands.some((command) => {
        return "bogus" in command;
      }),
    ).toBe(false);
  });

  it("an INVALID batch is dropped silently — no event emitted, and the turn stays open (unlike panel's sentinel substitution)", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    let completed = false;
    adapter.ask("set up my morning workspace").subscribe({
      next: (event: JarvisEvent) => {
        received.push(event);
      },
      complete: () => {
        completed = true;
      },
    });

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_COMMAND, {
      turnId,
      batch: { v: 1, commands: [{ kind: "bogusKind" }] },
    });

    expect(received).toEqual([]);
    expect(completed).toBe(false);
  });

  it("REGRESSION: the stream stays alive after an invalid batch — a later VALID frame on the same turn still lands", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("set up my morning workspace").subscribe((event) => {
      received.push(event);
    });

    const turnId = sentTurnId(ws);
    ws.emit(SERVER_MSG.JARVIS_COMMAND, {
      turnId,
      batch: { v: "not-1", commands: [] },
    });
    ws.emit(SERVER_MSG.JARVIS_COMMAND, { turnId, batch: VALID_DRIVE_BATCH });
    ws.emit(SERVER_MSG.JARVIS_DONE, { turnId });

    expect(received).toEqual([
      { type: "command", batch: VALID_DRIVE_BATCH },
      { type: "done" },
    ]);
  });

  it("a command frame carrying a different (stale) turnId is ignored", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisEvent[] = [];
    adapter.ask("set up my morning workspace").subscribe((event) => {
      received.push(event);
    });
    sentTurnId(ws); // ensure the chat frame was sent; the real turnId is deliberately not reused below

    ws.emit(SERVER_MSG.JARVIS_COMMAND, {
      turnId: "some-other-turn",
      batch: VALID_DRIVE_BATCH,
    });

    expect(received).toEqual([]);
  });
});

describe("WsJarvisAdapter.availability$()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing until a gatewayConnected event, then registers the handler and sends jarvis.subscribe", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    expect(ws.sentMessages()).toEqual([]);

    ws.emitConnectionEvent("gatewayConnected");

    expect(ws.sentMessages()).toEqual([
      { type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: undefined },
    ]);
    expect(received).toEqual([]);
  });

  it("NEW SHAPE: available:true with brains/defaultBrain passes them through unchanged", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, {
      available: true,
      brains: ["scripted", "claude-haiku-4-5"],
      defaultBrain: "claude-haiku-4-5",
    });
    expect(received).toEqual([
      {
        available: true,
        brains: ["scripted", "claude-haiku-4-5"],
        defaultBrain: "claude-haiku-4-5",
      },
    ]);
  });

  it("NEW SHAPE: available:false carries whatever brains/defaultBrain the server sent", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, {
      available: false,
      brains: [],
      defaultBrain: "claude-haiku-4-5",
    });
    expect(received).toEqual([
      { available: false, brains: [], defaultBrain: "claude-haiku-4-5" },
    ]);
  });

  it("OLD SHAPE COMPAT: available:true with brains/defaultBrain absent maps to every selectable brain and the client's own default", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: true });
    expect(received).toEqual([
      {
        available: true,
        brains: JARVIS_BRAINS,
        defaultBrain: DEFAULT_JARVIS_BRAIN,
      },
    ]);
  });

  it("OLD SHAPE COMPAT: available:false with brains/defaultBrain absent maps to no brains offered and the client's own default", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: false });
    expect(received).toEqual([
      { available: false, brains: [], defaultBrain: DEFAULT_JARVIS_BRAIN },
    ]);
  });

  it("SLOW FIRST RESPONSE: emits an unavailable value with empty brains after the deadline WITHOUT completing, then a late real answer still lands", () => {
    // The bug this pins: the previous implementation used the RxJS
    // `timeout()` operator, whose catchError->of(false) both emits AND
    // completes the outer stream — a subscriber that stayed open past login
    // (>10s to the first response) latched `false` forever, even once the
    // server did answer. `createConnectionAvailabilityStream` uses a plain
    // `setTimeout` instead: the deadline fires a synthetic unavailable value
    // but never unregisters the handler, so a late real frame on the SAME
    // connection still reaches the subscriber.
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    let completed = false;
    adapter.availability$().subscribe({
      next: (availability: JarvisAvailability) => {
        received.push(availability);
      },
      complete: () => {
        completed = true;
      },
    });
    ws.emitConnectionEvent("gatewayConnected");

    vi.advanceTimersByTime(JARVIS_AVAILABILITY_TIMEOUT_MS - 1);
    expect(received).toEqual([]);
    expect(completed).toBe(false);

    vi.advanceTimersByTime(1);
    expect(received).toEqual([
      { available: false, brains: [], defaultBrain: DEFAULT_JARVIS_BRAIN },
    ]);
    expect(completed).toBe(false);

    // The stream is still alive: a real (late) answer still lands.
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, {
      available: true,
      brains: ["scripted"],
      defaultBrain: "scripted",
    });
    expect(received).toEqual([
      { available: false, brains: [], defaultBrain: DEFAULT_JARVIS_BRAIN },
      { available: true, brains: ["scripted"], defaultBrain: "scripted" },
    ]);
    expect(completed).toBe(false);
  });

  it("RECONNECT REGRESSION: a NEW gatewayConnected event re-sends jarvis.subscribe and re-queries", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: true });

    ws.emitConnectionEvent("gatewayDisconnected");
    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: false });

    expect(
      ws.sentMessages().filter((m) => {
        return m.type === CLIENT_MSG.JARVIS_SUBSCRIBE;
      }),
    ).toHaveLength(2);
    expect(received).toEqual([
      {
        available: true,
        brains: JARVIS_BRAINS,
        defaultBrain: DEFAULT_JARVIS_BRAIN,
      },
      { available: false, brains: [], defaultBrain: DEFAULT_JARVIS_BRAIN },
    ]);
  });

  it("SERVER-RESTART REGRESSION: the reconnect after a restart flips a stale unavailable value back to available", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: false });

    // The server restarts: the socket drops and reconnects, and the
    // restarted server now reports available.
    ws.emitConnectionEvent("gatewayDisconnected");
    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: true });

    expect(received).toEqual([
      { available: false, brains: [], defaultBrain: DEFAULT_JARVIS_BRAIN },
      {
        available: true,
        brains: JARVIS_BRAINS,
        defaultBrain: DEFAULT_JARVIS_BRAIN,
      },
    ]);
  });

  it("distinctUntilChanged: a reconnect that lands on a structurally-equal availability value does not re-emit", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, {
      available: true,
      brains: ["scripted"],
      defaultBrain: "scripted",
    });

    ws.emitConnectionEvent("gatewayDisconnected");
    ws.emitConnectionEvent("gatewayConnected");
    // A brand-new array instance with the same elements in the same order —
    // distinctUntilChanged must compare structurally, not by reference.
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, {
      available: true,
      brains: ["scripted"],
      defaultBrain: "scripted",
    });

    expect(received).toEqual([
      { available: true, brains: ["scripted"], defaultBrain: "scripted" },
    ]);
  });

  it("distinctUntilChanged: a differing brains array (same length, different order) DOES re-emit", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });

    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, {
      available: true,
      brains: ["scripted", "claude-haiku-4-5"],
      defaultBrain: "scripted",
    });

    ws.emitConnectionEvent("gatewayDisconnected");
    ws.emitConnectionEvent("gatewayConnected");
    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, {
      available: true,
      brains: ["claude-haiku-4-5", "scripted"],
      defaultBrain: "scripted",
    });

    expect(received).toHaveLength(2);
  });

  it("unsubscribing tears down the handler — a later frame or reconnect emits nothing further", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsJarvisAdapter(ws);
    const received: JarvisAvailability[] = [];
    const subscription = adapter.availability$().subscribe((availability) => {
      received.push(availability);
    });
    ws.emitConnectionEvent("gatewayConnected");
    subscription.unsubscribe();

    ws.emit(SERVER_MSG.JARVIS_AVAILABILITY, { available: true });
    ws.emitConnectionEvent("gatewayConnected");
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

/** A structurally-valid `PanelSpecV1` — passes `parsePanelSpec` with
 * `knownSymbols: []` (roster check skipped), matching the wire panel tests'
 * "happy path" fixture. */
const VALID_PANEL_SPEC: PanelSpecV1 = {
  v: 1,
  title: "GBP Volatility",
  source: { kind: "priceHistory", symbols: ["GBPUSD"] },
  transforms: [],
  viz: { kind: "line" },
};

/** A structurally-valid `DriveBatchV1` — passes `parseDriveBatch` unchanged,
 * matching the wire command tests' "happy path" fixture. */
const VALID_DRIVE_BATCH: DriveBatchV1 = {
  v: 1,
  commands: [{ kind: "switchTab", tab: "fx" }],
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
