import { type Observable, of, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_JARVIS_BRAIN, Direction, JARVIS_BRAINS } from "@rtc/domain";
import type {
  DriveBatchV1,
  JarvisCancelPayload,
  JarvisChatPayload,
  JarvisConfirmPayload,
  JarvisEvent,
  JarvisHistoryEntry,
  PanelSpecV1,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import type {
  AgentLoop,
  AgentSession,
  JarvisLoops,
  JarvisTurnOptions,
} from "../agent/agentLoop.js";
import { createJarvisLoops } from "../agent/agentLoop.js";
import {
  type JarvisGateConfig,
  JarvisGateService,
} from "../services/jarvisGate.js";
import {
  createServices,
  type ServiceContainer,
} from "../services/serviceContainer.js";
import { JARVIS_USAGE_WINDOW_MS, UsageMeter } from "../services/UsageMeter.js";
import type { Ctx } from "./context.js";
import { jarvisEffects } from "./jarvis.effects.js";

const QUOTE_REPLY =
  "EURUSD is trading at 1.0921, up 0 pips since the start of the session. " +
  "Spread 1 pips; short-term momentum is positive. Anything else, sir?";

const DECLINED_REPLY = "Understood, sir — standing down. Nothing was executed.";

const FILL_REPLY =
  "Very good, sir. Bought 5,000,000 EUR at 1.0922 — the trade is on your blotter.";

const STUB_TURN_ID = "turn-stub";

const STUB_PANEL_SPEC: PanelSpecV1 = {
  v: 1,
  title: "GBP Volatility",
  source: { kind: "priceHistory", symbols: ["GBPUSD"] },
  transforms: [{ kind: "rollingVol", samples: 20 }],
  viz: { kind: "line" },
};

const STUB_DRIVE_BATCH: DriveBatchV1 = {
  v: 1,
  commands: [{ kind: "switchTab", tab: "fx" }],
};

/** One case per `JarvisEvent` variant, proving `WIRE_TYPE_BY_EVENT` end to
 * end: mutating any one entry (e.g. error -> JARVIS_DONE) fails exactly its
 * row here, even though the full-engine tests above never happen to reach
 * every variant (nothing in the scripted brain currently emits `error`).
 * Every body carries `turnId` — the wire rule for every turn-scoped
 * SERVER_MSG.JARVIS_* payload. */
const WIRE_MAPPING_CASES: readonly WireMappingCase[] = [
  {
    event: { type: "delta", text: "hi" },
    wireType: SERVER_MSG.JARVIS_DELTA,
    body: { text: "hi", turnId: STUB_TURN_ID },
  },
  {
    event: { type: "toolEvent", tool: "quote", status: "running" },
    wireType: SERVER_MSG.JARVIS_TOOL_EVENT,
    body: { tool: "quote", status: "running", turnId: STUB_TURN_ID },
  },
  {
    event: {
      type: "confirmRequest",
      confirmationId: "confirm-abc",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.1,
      ratePrecision: 5,
    },
    wireType: SERVER_MSG.JARVIS_CONFIRM_REQUEST,
    body: {
      confirmationId: "confirm-abc",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.1,
      ratePrecision: 5,
      turnId: STUB_TURN_ID,
    },
  },
  {
    event: {
      type: "panel",
      panelId: "panel-scripted-1",
      spec: STUB_PANEL_SPEC,
    },
    wireType: SERVER_MSG.JARVIS_PANEL,
    body: {
      panelId: "panel-scripted-1",
      spec: STUB_PANEL_SPEC,
      turnId: STUB_TURN_ID,
    },
  },
  {
    event: { type: "command", batch: STUB_DRIVE_BATCH },
    wireType: SERVER_MSG.JARVIS_COMMAND,
    body: { batch: STUB_DRIVE_BATCH, turnId: STUB_TURN_ID },
  },
  {
    event: { type: "done" },
    wireType: SERVER_MSG.JARVIS_DONE,
    body: { turnId: STUB_TURN_ID },
  },
  {
    event: { type: "error", message: "boom" },
    wireType: SERVER_MSG.JARVIS_ERROR,
    body: { message: "boom", turnId: STUB_TURN_ID },
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  // PricingSimulator's random-walk history and ExecutionSimulator's fill
  // delay both derive from Math.random(); pinning it makes every quoted
  // price / reply byte-for-byte reproducible instead of drifting per run.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("jarvis availability", () => {
  it("responds { available: false, brains: [], defaultBrain: 'scripted' } to jarvis.subscribe when no loops are present", () => {
    const sent: Outbound[] = [];
    const socket = createSocket(sent);
    const ctx = { jarvisGate: createUngatedGate() } as unknown as Ctx;
    createWsListener(combineEffects(...jarvisEffects(null)), ctx)(socket);

    socket.messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: { available: false, brains: [], defaultBrain: "scripted" },
      },
    ]);
  });

  it("responds { available: true, brains: ['scripted'], defaultBrain: 'scripted' } when only the scripted loop is present (RTC_JARVIS_FAKE=1)", () => {
    const { messages$, sent } = harness();

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: ["scripted"],
          defaultBrain: "scripted",
        },
      },
    ]);
  });

  it("responds with every JARVIS_BRAINS entry and DEFAULT_JARVIS_BRAIN when a live anthropic loop is present too", () => {
    // `{}` explicit, not the ambient `process.env` default — this test's
    // gate must read "none" regardless of whatever RTC_JARVIS_* is set in
    // whatever environment the suite happens to run under (mirrors
    // `createJarvisLoops`'s own explicit-env call just below).
    const services = createServices({});
    const loops = createJarvisLoops(
      { ANTHROPIC_API_KEY: "sk-test" },
      services,
      () => {
        return { createSession: vi.fn() };
      },
    );

    if (!loops) {
      throw new Error("expected a non-null JarvisLoops");
    }

    const sent: Outbound[] = [];
    const socket = createSocket(sent);
    createWsListener(combineEffects(...jarvisEffects(loops)), services)(socket);

    socket.messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: JARVIS_BRAINS,
          defaultBrain: DEFAULT_JARVIS_BRAIN,
        },
      },
    ]);
  });
});

describe("jarvis effects", () => {
  it("streams a quote turn's tool badge + paced deltas + done, every frame carrying the request's turnId, deltas reassembling the reply", async () => {
    const { messages$, sent } = harness();
    const turnId = "turn-quote";

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "where is EURUSD?", turnId } satisfies JarvisChatPayload,
    });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sent[0]).toEqual({
      type: SERVER_MSG.JARVIS_TOOL_EVENT,
      payload: { tool: "quote", status: "running", turnId },
    });
    expect(sent[1]).toEqual({
      type: SERVER_MSG.JARVIS_TOOL_EVENT,
      payload: { tool: "quote", status: "done", turnId },
    });
    expect(sent.at(-1)).toEqual({
      type: SERVER_MSG.JARVIS_DONE,
      payload: { turnId },
    });

    const deltas = sent.slice(2, -1);
    expect(deltas.length).toBeGreaterThan(1);
    expect(
      deltas.every((m) => {
        return m.type === SERVER_MSG.JARVIS_DELTA;
      }),
    ).toBe(true);
    expect(reassembleDeltas(sent)).toBe(QUOTE_REPLY);
    expect(
      sent.every((m) => {
        return (m.payload as TurnIdCarrier).turnId === turnId;
      }),
    ).toBe(true);
  });

  it("a trade turn's confirmRequest carries the confirm-card fields plus turnId, no type field; approving executes, streams the fill reply, and grows the blotter", async () => {
    const { services, messages$, sent } = harness();
    const turnId = "turn-trade";

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "buy 5M EURUSD", turnId } satisfies JarvisChatPayload,
    });

    // ReferenceDataSimulator.getCurrencyPairs() carries a fixed 1s delay
    // before the confirmRequest is pushed.
    await vi.advanceTimersByTimeAsync(1_000);

    const confirmRequest = findConfirmRequest(sent);
    expect(confirmRequest.payload).toEqual({
      confirmationId: expect.any(String),
      symbol: "EURUSD",
      direction: "Buy",
      notional: 5_000_000,
      quotedPrice: 1.0922,
      ratePrecision: 5,
      turnId,
    });
    expect(confirmRequest.payload).not.toHaveProperty("type");

    const { confirmationId } = confirmRequest.payload as ConfirmationCarrier;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CONFIRM,
      payload: {
        confirmationId,
        approved: true,
      } satisfies JarvisConfirmPayload,
    });

    // ExecutionSimulator delays EURUSD fills 0-2s.
    await vi.advanceTimersByTimeAsync(2_500);

    expect(reassembleDeltas(sent)).toBe(FILL_REPLY);
    expect(sent.at(-1)).toEqual({
      type: SERVER_MSG.JARVIS_DONE,
      payload: { turnId },
    });
    expect(tradeCounts.at(-1)).toBe(seededCount + 1);
  });

  it("declining a confirmRequest streams the declined copy and executes nothing", async () => {
    const { services, messages$, sent } = harness();
    const turnId = "turn-decline";

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "buy 5M EURUSD", turnId } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const { confirmationId } = findConfirmRequest(sent)
      .payload as ConfirmationCarrier;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CONFIRM,
      payload: {
        confirmationId,
        approved: false,
      } satisfies JarvisConfirmPayload,
    });

    await vi.advanceTimersByTimeAsync(2_500);

    expect(reassembleDeltas(sent)).toBe(DECLINED_REPLY);
    expect(sent.at(-1)).toEqual({
      type: SERVER_MSG.JARVIS_DONE,
      payload: { turnId },
    });
    expect(tradeCounts.at(-1)).toBe(seededCount);
  });

  it("jarvis.cancel mid-confirmation cancels the turn: a late jarvis.confirm is a no-op and nothing executes", async () => {
    const { services, messages$, sent } = harness();
    const turnId = "turn-cancel";

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "buy 5M EURUSD", turnId } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const { confirmationId } = findConfirmRequest(sent)
      .payload as ConfirmationCarrier;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CANCEL,
      payload: { turnId } satisfies JarvisCancelPayload,
    });

    messages$.next({
      type: CLIENT_MSG.JARVIS_CONFIRM,
      payload: {
        confirmationId,
        approved: true,
      } satisfies JarvisConfirmPayload,
    });
    await vi.advanceTimersByTimeAsync(2_500);

    expect(tradeCounts.at(-1)).toBe(seededCount);
  });

  it("a stale jarvis.cancel for an already-completed turn does not kill a later in-flight turn", async () => {
    const { messages$, sent } = harness();

    // Turn A completes normally.
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "hello", turnId: "turn-a" } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      sent.some((m) => {
        return (
          m.type === SERVER_MSG.JARVIS_DONE &&
          (m.payload as TurnIdCarrier).turnId === "turn-a"
        );
      }),
    ).toBe(true);

    // Turn B starts and is still mid-stream (a quote turn takes several
    // paced deltas to finish) when the stale cancel for the already-done A
    // arrives — mirrors Task 7's client sending jarvis.cancel on EVERY
    // teardown, including a turn that already completed normally.
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "where is EURUSD?",
        turnId: "turn-b",
      } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(500);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CANCEL,
      payload: { turnId: "turn-a" } satisfies JarvisCancelPayload,
    });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(
      sent.some((m) => {
        return (
          m.type === SERVER_MSG.JARVIS_DONE &&
          (m.payload as TurnIdCarrier).turnId === "turn-b"
        );
      }),
    ).toBe(true);
  });

  it("tearing down the outbound stream mid-confirmation makes a late jarvis.confirm a no-op", async () => {
    const { services, messages$, closed$, sent } = harness();
    const turnId = "turn-teardown";

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "buy 5M EURUSD", turnId } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const { confirmationId } = findConfirmRequest(sent)
      .payload as ConfirmationCarrier;

    // Simulate the socket disconnecting: createWsListener's takeUntil(closed$)
    // unsubscribes the whole outbound stream, including the still-open chat
    // turn's inner subscription — the engine's teardown path completes the
    // pending confirmation Subject with no value, per turnConfirmationIds —
    // and `session.dispose()` (the effect's `finalize`) runs too.
    closed$.next();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CONFIRM,
      payload: {
        confirmationId,
        approved: true,
      } satisfies JarvisConfirmPayload,
    });
    await vi.advanceTimersByTimeAsync(2_500);

    expect(tradeCounts.at(-1)).toBe(seededCount);
  });

  it("two socket connections get distinct sessions: a confirmation issued on socket A cannot be resolved from socket B", async () => {
    const { services, a, b } = twoSocketHarness();
    const turnId = "turn-a";

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    a.messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "buy 5M EURUSD", turnId } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const { confirmationId } = findConfirmRequest(a.sent)
      .payload as ConfirmationCarrier;

    // Forged: socket B attempts to resolve socket A's confirmation.
    b.messages$.next({
      type: CLIENT_MSG.JARVIS_CONFIRM,
      payload: {
        confirmationId,
        approved: true,
      } satisfies JarvisConfirmPayload,
    });
    await vi.advanceTimersByTimeAsync(2_500);

    expect(tradeCounts.at(-1)).toBe(seededCount);
    expect(b.sent).toEqual([]);

    // The rightful socket can still resolve it afterwards.
    a.messages$.next({
      type: CLIENT_MSG.JARVIS_CONFIRM,
      payload: {
        confirmationId,
        approved: true,
      } satisfies JarvisConfirmPayload,
    });
    await vi.advanceTimersByTimeAsync(2_500);

    expect(tradeCounts.at(-1)).toBe(seededCount + 1);
  });
});

describe("jarvis effects — malformed payloads don't kill the connection's effect", () => {
  it("jarvis.chat with a turnId but no text emits JARVIS_ERROR correlated to that turnId; the connection keeps serving later valid turns", async () => {
    const { messages$, sent } = harness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { turnId: "turn-bad" },
    });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_ERROR,
        payload: { turnId: "turn-bad", message: expect.any(String) },
      },
    ]);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi there",
        turnId: "turn-good",
      } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(
      sent.some((m) => {
        return m.type === SERVER_MSG.JARVIS_DONE;
      }),
    ).toBe(true);
  });

  it("jarvis.chat with no turnId at all is dropped with a console.warn; the connection keeps serving later valid turns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messages$, sent } = harness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "no turn id here, and this text must never reach the log",
      },
    });

    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalled();
    // Log-hygiene: the warn must summarize the frame (type + best-effort
    // turnId), never echo the payload body — an authenticated peer can send
    // arbitrary content on a malformed frame, and there is no ws
    // `maxPayload` cap upstream of this handler.
    const warnArgs = warn.mock.calls.flat().join(" ");
    expect(warnArgs).toContain("type=jarvis.chat");
    expect(warnArgs).toContain("payload omitted");
    expect(warnArgs).not.toContain("no turn id here");

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi there",
        turnId: "turn-good",
      } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(
      sent.some((m) => {
        return m.type === SERVER_MSG.JARVIS_DONE;
      }),
    ).toBe(true);
  });

  it("jarvis.chat with a non-object payload is dropped without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messages$, sent } = harness();

    expect(() => {
      messages$.next({
        type: CLIENT_MSG.JARVIS_CHAT,
        payload: "not an object",
      });
    }).not.toThrow();

    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("jarvis.confirm with a malformed payload is dropped without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messages$, sent } = harness();

    expect(() => {
      messages$.next({
        type: CLIENT_MSG.JARVIS_CONFIRM,
        payload: { confirmationId: 42 },
      });
    }).not.toThrow();

    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalled();
    // Log-hygiene: same summarize-don't-echo contract as the jarvis.chat
    // case above.
    const warnArgs = warn.mock.calls.flat().join(" ");
    expect(warnArgs).toContain("type=jarvis.confirm");
    expect(warnArgs).toContain("payload omitted");
    expect(warnArgs).not.toContain("confirmationId");
  });

  it("jarvis.cancel with a malformed payload is dropped without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messages$, sent } = harness();

    expect(() => {
      messages$.next({ type: CLIENT_MSG.JARVIS_CANCEL, payload: {} });
    }).not.toThrow();

    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalled();
    // Log-hygiene: same summarize-don't-echo contract as the jarvis.chat
    // case above.
    const warnArgs = warn.mock.calls.flat().join(" ");
    expect(warnArgs).toContain("type=jarvis.cancel");
    expect(warnArgs).toContain("payload omitted");
  });
});

describe("jarvis effects — jarvis.chat history payload handling (stub loop)", () => {
  it("passes a valid history array through to session.runTurn verbatim", () => {
    const { loop, runTurn } = createCapturingStubLoop();
    const { messages$ } = stubHarness(loop);
    const history: JarvisHistoryEntry[] = [{ role: "user", text: "hi" }];

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "irrelevant",
        turnId: STUB_TURN_ID,
        history,
      } satisfies JarvisChatPayload,
    });

    expect(runTurn).toHaveBeenCalledWith("irrelevant", history);
  });

  it("omitted history reaches session.runTurn as an empty array", () => {
    const { loop, runTurn } = createCapturingStubLoop();
    const { messages$ } = stubHarness(loop);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "irrelevant",
        turnId: STUB_TURN_ID,
      } satisfies JarvisChatPayload,
    });

    expect(runTurn).toHaveBeenCalledWith("irrelevant", []);
  });

  it("a history entry with an invalid role is a malformed payload: JARVIS_ERROR carries the turnId, session.runTurn is never called", () => {
    const { loop, runTurn } = createCapturingStubLoop();
    const { messages$, sent } = stubHarness(loop);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "irrelevant",
        turnId: STUB_TURN_ID,
        history: [{ role: "nope" }],
      },
    });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_ERROR,
        payload: { turnId: STUB_TURN_ID, message: expect.any(String) },
      },
    ]);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("a non-array history is a malformed payload: JARVIS_ERROR carries the turnId, session.runTurn is never called", () => {
    const { loop, runTurn } = createCapturingStubLoop();
    const { messages$, sent } = stubHarness(loop);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "irrelevant", turnId: STUB_TURN_ID, history: "x" },
    });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_ERROR,
        payload: { turnId: STUB_TURN_ID, message: expect.any(String) },
      },
    ]);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("truncates a history longer than the entry cap to the LAST entries (most recent)", () => {
    const { loop, runTurn } = createCapturingStubLoop();
    const { messages$ } = stubHarness(loop);
    const longHistory: JarvisHistoryEntry[] = Array.from(
      { length: 25 },
      (_, i) => {
        return { role: "user", text: `turn-${i}` };
      },
    );

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "irrelevant",
        turnId: STUB_TURN_ID,
        history: longHistory,
      } satisfies JarvisChatPayload,
    });

    expect(runTurn).toHaveBeenCalledWith("irrelevant", longHistory.slice(-20));
  });

  it("rejects a history entry whose text exceeds the per-entry text cap as a malformed payload", () => {
    const { loop, runTurn } = createCapturingStubLoop();
    const { messages$, sent } = stubHarness(loop);
    const oversized: JarvisHistoryEntry = {
      role: "user",
      text: "x".repeat(2_001),
    };

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "irrelevant",
        turnId: STUB_TURN_ID,
        history: [oversized],
      } satisfies JarvisChatPayload,
    });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_ERROR,
        payload: { turnId: STUB_TURN_ID, message: expect.any(String) },
      },
    ]);
    expect(runTurn).not.toHaveBeenCalled();
  });
});

describe("jarvis effects — defer() keeps a synchronous session.runTurn throw from killing the connection's effect", () => {
  it("a session.runTurn that throws synchronously on its first call does not kill the effect: a later turn on the same socket still reaches JARVIS_DONE", () => {
    const loop = createOnceThrowingStubLoop();
    const { messages$, sent } = stubHarness(loop);

    expect(() => {
      messages$.next({
        type: CLIENT_MSG.JARVIS_CHAT,
        payload: {
          text: "first",
          turnId: "turn-1",
        } satisfies JarvisChatPayload,
      });
    }).not.toThrow();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "second", turnId: "turn-2" } satisfies JarvisChatPayload,
    });

    expect(sent).toContainEqual({
      type: SERVER_MSG.JARVIS_DONE,
      payload: { turnId: "turn-2" },
    });
  });
});

describe("jarvis effects — wire-type mapping (stub loop, no simulators)", () => {
  it.each(WIRE_MAPPING_CASES)(
    "maps a stubbed $event.type event to its wire type, minus the type field, plus turnId",
    ({ event, wireType, body }) => {
      const loop: AgentLoop = {
        createSession: () => {
          return {
            runTurn: () => {
              return of(event);
            },
            resolveConfirmation: vi.fn(),
            cancelTurn: vi.fn(),
            dispose: vi.fn(),
          };
        },
      };
      const { messages$, sent } = stubHarness(loop);

      messages$.next({
        type: CLIENT_MSG.JARVIS_CHAT,
        payload: {
          text: "irrelevant",
          turnId: STUB_TURN_ID,
        } satisfies JarvisChatPayload,
      });

      expect(sent).toEqual([{ type: wireType, payload: body }]);
    },
  );
});

describe("jarvis effects — chat turns are serialized (concatMap, not mergeMap)", () => {
  it("a second rapid jarvis.chat does not even start (runTurn is not invoked) until the first turn's stream completes", () => {
    const { loop, turnSubjects } = createControllableStubLoop();
    const { messages$, sent } = stubHarness(loop);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "first", turnId: "turn-A" } satisfies JarvisChatPayload,
    });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "second", turnId: "turn-B" } satisfies JarvisChatPayload,
    });

    // mergeMap would have subscribed turn B's stream immediately on the
    // second jarvis.chat frame; concatMap queues it — only turn A's
    // runTurn has been called so far.
    expect(turnSubjects).toHaveLength(1);

    turnSubjects[0]?.next({ type: "delta", text: "A-delta" });
    turnSubjects[0]?.next({ type: "done" });
    turnSubjects[0]?.complete();

    // Only NOW does turn B's stream subscribe.
    expect(turnSubjects).toHaveLength(2);

    turnSubjects[1]?.next({ type: "delta", text: "B-delta" });
    turnSubjects[1]?.next({ type: "done" });
    turnSubjects[1]?.complete();

    const doneAIndex = sent.findIndex((m) => {
      return (
        m.type === SERVER_MSG.JARVIS_DONE &&
        (m.payload as TurnIdCarrier).turnId === "turn-A"
      );
    });

    const firstBIndex = sent.findIndex((m) => {
      return (m.payload as Partial<TurnIdCarrier>).turnId === "turn-B";
    });

    expect(doneAIndex).toBeGreaterThanOrEqual(0);
    expect(firstBIndex).toBeGreaterThan(doneAIndex);
  });

  it("a confirmRequest emitted mid-turn-A is tagged with turn A's turnId even while turn B sits queued behind it", () => {
    const { loop, turnSubjects } = createControllableStubLoop();
    const { messages$, sent } = stubHarness(loop);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "buy 1m EURUSD",
        turnId: "turn-A",
      } satisfies JarvisChatPayload,
    });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "second", turnId: "turn-B" } satisfies JarvisChatPayload,
    });

    turnSubjects[0]?.next({
      type: "confirmRequest",
      confirmationId: "confirm-1",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.1,
      ratePrecision: 4,
    });

    const confirmRequest = findConfirmRequest(sent);
    expect((confirmRequest.payload as TurnIdCarrier).turnId).toBe("turn-A");
    // Turn B's stream genuinely doesn't exist yet — the correlation isn't
    // "coincidentally right", there's nothing else in flight to collide.
    expect(turnSubjects).toHaveLength(1);
  });
});

describe("jarvis effects — dual-brain routing (spy loops)", () => {
  it("no brain in the payload routes to loops.defaultBrain, reaching the anthropic session with resolved options", () => {
    const { loops, scriptedSpy, anthropicSpy, messages$, sent } =
      dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "hi", turnId: STUB_TURN_ID } satisfies JarvisChatPayload,
    });

    expect(scriptedSpy.createSession).not.toHaveBeenCalled();
    expect(anthropicSpy.createSession).toHaveBeenCalledTimes(1);
    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: loops.defaultBrain,
      effort: undefined,
    });
    expect(sent).toEqual([
      { type: SERVER_MSG.JARVIS_DONE, payload: { turnId: STUB_TURN_ID } },
    ]);
  });

  it("brain: 'scripted' routes to the scripted session; the anthropic spy is never touched", () => {
    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });

    expect(scriptedSpy.createSession).toHaveBeenCalledTimes(1);
    expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", []);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });

  it("an explicit real-model brain + effort routes to the anthropic session carrying both", () => {
    const { anthropicSpy, messages$ } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-opus-5",
        effort: "high",
      } satisfies JarvisChatPayload,
    });

    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: "claude-opus-5",
      effort: "high",
    });
  });

  it("an unrecognized brain string falls back to the default brain (lenient parse seam, not a rejected frame)", () => {
    const { loops, anthropicSpy, messages$, sent } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "hi", turnId: STUB_TURN_ID, brain: "gpt-5" },
    });

    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: loops.defaultBrain,
      effort: undefined,
    });
    // Not treated as malformed: no JARVIS_ERROR, the turn still completes.
    expect(sent).toEqual([
      { type: SERVER_MSG.JARVIS_DONE, payload: { turnId: STUB_TURN_ID } },
    ]);
  });

  it("a recognized but un-offered brain (not a member of loops.brains) falls back to the default brain", () => {
    const scriptedSpy = createSpyLoop();
    const anthropicSpy = createSpyLoop();
    const loops: JarvisLoops = {
      scripted: scriptedSpy.loop,
      anthropic: anthropicSpy.loop,
      // "claude-opus-5" is a valid JarvisBrain but not offered by this loop set.
      brains: ["scripted", "claude-haiku-4-5"],
      defaultBrain: "claude-haiku-4-5",
    };
    const { messages$ } = wireDualLoops(loops);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-opus-5",
      } satisfies JarvisChatPayload,
    });

    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: "claude-haiku-4-5",
      effort: undefined,
    });
  });

  it("a scripted-only conversation never constructs the anthropic session (laziness)", () => {
    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "one",
        turnId: "t1",
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "two",
        turnId: "t2",
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });

    expect(scriptedSpy.createSession).toHaveBeenCalledTimes(1);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });

  it("an anthropic-only conversation never constructs the scripted session (laziness)", () => {
    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "one",
        turnId: "t1",
        brain: "claude-sonnet-5",
      } satisfies JarvisChatPayload,
    });

    expect(anthropicSpy.createSession).toHaveBeenCalledTimes(1);
    expect(scriptedSpy.createSession).not.toHaveBeenCalled();
  });

  it("records ctx.usageMeter.recordTurn(resolvedBrain) exactly once per accepted chat frame, in order", () => {
    const recordTurn = vi.fn();
    const { messages$ } = dualLoopsHarness(recordTurn);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: "t1",
        brain: "claude-sonnet-5",
      } satisfies JarvisChatPayload,
    });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi again",
        turnId: "t2",
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });

    expect(recordTurn).toHaveBeenCalledTimes(2);
    expect(recordTurn).toHaveBeenNthCalledWith(1, "claude-sonnet-5");
    expect(recordTurn).toHaveBeenNthCalledWith(2, "scripted");
  });

  it("recordTurn is NOT called for a malformed chat frame — never an accepted turn", () => {
    const recordTurn = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messages$ } = dualLoopsHarness(recordTurn);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { turnId: "bad-frame" },
    });

    expect(recordTurn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("jarvis.confirm forwards to BOTH live sessions — cross-talk is a no-op only because each session's own ownership guard gates it, not the effect layer", () => {
    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness();

    // Bring both sessions to life first (both default runTurn impls
    // complete immediately, so both chat frames finish synchronously).
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "s",
        turnId: "t-s",
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "a",
        turnId: "t-a",
        brain: "claude-sonnet-5",
      } satisfies JarvisChatPayload,
    });

    messages$.next({
      type: CLIENT_MSG.JARVIS_CONFIRM,
      payload: {
        confirmationId: "confirm-x",
        approved: true,
      } satisfies JarvisConfirmPayload,
    });

    expect(scriptedSpy.sessions[0]?.resolveConfirmation).toHaveBeenCalledWith(
      "confirm-x",
      true,
    );
    expect(anthropicSpy.sessions[0]?.resolveConfirmation).toHaveBeenCalledWith(
      "confirm-x",
      true,
    );
  });

  it("jarvis.confirm before either session exists creates NEITHER — never conjures a session just to deliver a confirm", () => {
    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CONFIRM,
      payload: {
        confirmationId: "confirm-x",
        approved: true,
      } satisfies JarvisConfirmPayload,
    });

    expect(scriptedSpy.createSession).not.toHaveBeenCalled();
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });

  it("jarvis.cancel forwards to every EXISTING session when it matches the in-flight turnId, even an idle one", () => {
    const scriptedSpy = createSpyLoop();
    const turnSubjects: Subject<JarvisEvent>[] = [];
    const anthropicSpy = createSpyLoop((): Observable<JarvisEvent> => {
      const subject = new Subject<JarvisEvent>();
      turnSubjects.push(subject);
      return subject.asObservable();
    });

    const loops: JarvisLoops = {
      scripted: scriptedSpy.loop,
      anthropic: anthropicSpy.loop,
      brains: JARVIS_BRAINS,
      defaultBrain: DEFAULT_JARVIS_BRAIN,
    };
    const { messages$ } = wireDualLoops(loops);

    // Scripted turn completes immediately, bringing that session to life.
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "s",
        turnId: "t-s",
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });
    // Anthropic turn stays open — a controllable Subject, never completes.
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "a",
        turnId: "t-a",
        brain: "claude-sonnet-5",
      } satisfies JarvisChatPayload,
    });

    messages$.next({
      type: CLIENT_MSG.JARVIS_CANCEL,
      payload: { turnId: "t-a" } satisfies JarvisCancelPayload,
    });

    expect(anthropicSpy.sessions[0]?.cancelTurn).toHaveBeenCalledTimes(1);
    expect(scriptedSpy.sessions[0]?.cancelTurn).toHaveBeenCalledTimes(1);
  });

  it("finalize disposes every session that was actually created for the connection", () => {
    const { scriptedSpy, anthropicSpy, messages$, closed$ } =
      dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "s",
        turnId: "t-s",
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "a",
        turnId: "t-a",
        brain: "claude-sonnet-5",
      } satisfies JarvisChatPayload,
    });

    expect(scriptedSpy.sessions[0]?.dispose).not.toHaveBeenCalled();
    expect(anthropicSpy.sessions[0]?.dispose).not.toHaveBeenCalled();

    closed$.next();

    expect(scriptedSpy.sessions[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(anthropicSpy.sessions[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("finalize never disposes a session that was never created", () => {
    const { scriptedSpy, anthropicSpy, messages$, closed$ } =
      dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "s",
        turnId: "t-s",
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });

    closed$.next();

    expect(scriptedSpy.sessions[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });
});

describe("budget gate", () => {
  it("re-pushes availability when the gate trips, narrowed and carrying gate metadata", () => {
    const { meter, messages$, sent } = availabilityGateHarness({
      budgetUsd: 0.5,
      softRatio: 0.8,
      forceLevel: null,
    });

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: JARVIS_BRAINS,
          defaultBrain: "claude-haiku-4-5",
        },
      },
    ]);

    const beforeTrip = Date.now();

    // $1.00 estimated (200_000 input tokens * $5/Mtok for claude-opus-5) —
    // over the $0.50 budget, so this trips "hard" in one call.
    meter.recordTokens("claude-opus-5", {
      inputTokens: 200_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      type: SERVER_MSG.JARVIS_AVAILABILITY,
      payload: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: {
          level: "hard",
          resetsAtMs: beforeTrip + JARVIS_USAGE_WINDOW_MS,
          gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
        },
      },
    });
  });

  it("soft gate keeps haiku and scripted and lists exactly sonnet+opus as gated", () => {
    const { meter, messages$, sent } = availabilityGateHarness({
      budgetUsd: 1,
      softRatio: 0.8,
      forceLevel: null,
    });

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    expect(sent).toHaveLength(1);

    // $0.45 of the $1 budget (90_000 input tokens * $5/Mtok) — under the
    // soft threshold ($0.80): the gate stays "none", no new push.
    meter.recordTokens("claude-opus-5", {
      inputTokens: 90_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(sent).toHaveLength(1);

    const beforeSoft = Date.now();

    // Cumulative $0.85 (+80_000 input tokens) — crosses the $0.80 soft
    // threshold without reaching the $1 hard one.
    meter.recordTokens("claude-opus-5", {
      inputTokens: 80_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      type: SERVER_MSG.JARVIS_AVAILABILITY,
      payload: {
        available: true,
        brains: ["scripted", "claude-haiku-4-5"],
        defaultBrain: "claude-haiku-4-5",
        gate: {
          level: "soft",
          resetsAtMs: beforeSoft + JARVIS_USAGE_WINDOW_MS,
          gated: ["claude-sonnet-5", "claude-opus-5"],
        },
      },
    });
  });

  it("lifts by timer without any new record (fake timers advance past windowEndMs)", async () => {
    const { meter, messages$, sent } = availabilityGateHarness({
      budgetUsd: 0.5,
      softRatio: 0.8,
      forceLevel: null,
    });

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    const beforeTrip = Date.now();

    meter.recordTokens("claude-opus-5", {
      inputTokens: 200_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      type: SERVER_MSG.JARVIS_AVAILABILITY,
      payload: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: {
          level: "hard",
          resetsAtMs: beforeTrip + JARVIS_USAGE_WINDOW_MS,
          gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
        },
      },
    });

    // No further record — the lift is the gate's own timer firing at
    // windowEndMs, re-judging the same (now-stale) snapshot as "none".
    await vi.advanceTimersByTimeAsync(JARVIS_USAGE_WINDOW_MS + 1);

    expect(sent).toHaveLength(3);
    expect(sent[2]).toEqual({
      type: SERVER_MSG.JARVIS_AVAILABILITY,
      payload: {
        available: true,
        brains: JARVIS_BRAINS,
        defaultBrain: "claude-haiku-4-5",
      },
    });
  });

  it("loops === null never attaches gate metadata to the unavailable payload, even while forced-hard", () => {
    const gate = new JarvisGateService(new UsageMeter(), {
      budgetUsd: 1,
      softRatio: 0.8,
      forceLevel: "hard",
    });
    const sent: Outbound[] = [];
    const socket = createSocket(sent);
    const ctx = { jarvisGate: gate } as unknown as Ctx;
    createWsListener(combineEffects(...jarvisEffects(null)), ctx)(socket);

    socket.messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    // `buildAvailabilityPayload`'s `loops === null` branch must win outright
    // — no `gate` field, no narrowed `brains` — regardless of the gate
    // level: `applyGateToOffer` is never even called against the (empty)
    // env-capability offer.
    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: { available: false, brains: [], defaultBrain: "scripted" },
      },
    ]);
  });

  it("subscribing while ALREADY gated gets the gated payload in the very first frame", () => {
    const { sent, messages$ } = availabilityGateHarness({
      budgetUsd: 1,
      softRatio: 0.8,
      forceLevel: "hard",
    });

    // No prior subscribe on this connection at all — the very first
    // JARVIS_SUBSCRIBE frame lands after the gate is already tripped
    // (forced hard from construction), proving `state$`'s `BehaviorSubject`
    // replay reaches a brand-new observer, not just a pre-existing one.
    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: ["scripted"],
          defaultBrain: "scripted",
          gate: {
            level: "hard",
            resetsAtMs: 0,
            gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
          },
        },
      },
    ]);
  });

  it("two subscribe frames on one socket leave exactly one live observer: a gate transition produces exactly one new frame, not two", () => {
    const { meter, messages$, sent } = availabilityGateHarness({
      budgetUsd: 0.5,
      softRatio: 0.8,
      forceLevel: null,
    });

    // Two JARVIS_SUBSCRIBE frames on the SAME socket — a reconnect replay,
    // or simply a client re-sending the handshake. Each produces its own
    // immediate frame (the state$ BehaviorSubject replays "none" to every
    // new subscriber), so `sent` legitimately holds two frames here — the
    // assertion below is about what happens on the NEXT transition, not
    // about de-duplicating these two.
    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    expect(sent).toHaveLength(2);

    const beforeTrip = Date.now();

    // $1.00 estimated — trips "hard". A mergeMap'd (uncapped) availability
    // effect would still hold BOTH subscribe frames' observers live, so
    // this single transition would append TWO new frames (one per stale
    // observer) instead of one. switchMap tore the first one down when the
    // second JARVIS_SUBSCRIBE arrived, so only one observer is left —
    // exactly one new frame, not two.
    meter.recordTokens("claude-opus-5", {
      inputTokens: 200_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });

    expect(sent).toHaveLength(3);
    expect(sent[2]).toEqual({
      type: SERVER_MSG.JARVIS_AVAILABILITY,
      payload: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: {
          level: "hard",
          resetsAtMs: beforeTrip + JARVIS_USAGE_WINDOW_MS,
          gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
        },
      },
    });
  });

  it("a turn frame requesting a gated brain resolves to the gated offer's default", () => {
    const gate = new JarvisGateService(new UsageMeter(), {
      budgetUsd: 1,
      softRatio: 0.8,
      forceLevel: "soft",
    });
    const { anthropicSpy, messages$ } = dualLoopsHarness(vi.fn(), gate);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-opus-5",
      } satisfies JarvisChatPayload,
    });

    // "claude-opus-5" is soft-gated away; the offer's surviving default
    // (DEFAULT_JARVIS_BRAIN, "claude-haiku-4-5") is what the turn actually
    // routes to — the scripted-vs-anthropic routing here still reaches the
    // anthropic session, just on the fallback brain.
    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: "claude-haiku-4-5",
      effort: undefined,
    });
  });

  it("hard gate routes every turn to the scripted loop", () => {
    const gate = new JarvisGateService(new UsageMeter(), {
      budgetUsd: 1,
      softRatio: 0.8,
      forceLevel: "hard",
    });

    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness(
      vi.fn(),
      gate,
    );

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-opus-5",
      } satisfies JarvisChatPayload,
    });

    expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", []);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });
});

interface WireMappingCase {
  readonly event: JarvisEvent;
  readonly wireType: string;
  readonly body: Record<string, unknown>;
}

interface Harness {
  readonly services: ServiceContainer;
  readonly messages$: Subject<Inbound>;
  readonly closed$: Subject<void>;
  readonly sent: Outbound[];
}

/** Shape shared by every `jarvis.confirm`-eligible payload read back in
 * these tests — just the `confirmationId` field. */
interface ConfirmationCarrier {
  readonly confirmationId: string;
}

/** Shape shared by every turn-scoped `SERVER_MSG.JARVIS_*` payload — just
 * the `turnId` field this test reads back. */
interface TurnIdCarrier {
  readonly turnId: string;
}

/** Shape of a `jarvis.delta` payload. */
interface DeltaPayload {
  readonly text: string;
}

/** A `Socket` whose `messages$`/`closed$` stay typed as the concrete
 * `Subject` the tests drive directly, rather than widened to the interface's
 * `Observable` — structurally still a `Socket` wherever one is expected. */
interface TestSocket {
  readonly messages$: Subject<Inbound>;
  readonly closed$: Subject<void>;
  send(message: Outbound): void;
}

function createSocket(sent: Outbound[]): TestSocket {
  return {
    messages$: new Subject<Inbound>(),
    closed$: new Subject<void>(),
    send: (m: Outbound): void => {
      sent.push(m);
    },
  };
}

/** A `JarvisGateService` that never gates (`budgetUsd: "off"`) — the default
 * stand-in for every harness below that doesn't itself exercise the budget
 * gate, so `ctx.jarvisGate.current().level` reads `"none"` throughout and
 * `resolveBrain`'s gated offer is always the full, ungated one. */
function createUngatedGate(): JarvisGateService {
  return new JarvisGateService(new UsageMeter(), {
    budgetUsd: "off",
    softRatio: 0.8,
    forceLevel: null,
  });
}

interface AvailabilityGateHarness {
  readonly meter: UsageMeter;
  readonly gate: JarvisGateService;
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
}

/** The common setup for the "budget gate" describe block's availability-push
 * tests below: a real `JarvisGateService` (built from the given config) over
 * a real `UsageMeter`, wired to a fixed full-`JARVIS_BRAINS` `JarvisLoops`
 * (session-spy-free `vi.fn()` stubs — these tests only exercise the
 * availability effect, never a chat turn). Does NOT send the initial
 * `JARVIS_SUBSCRIBE` itself — callers drive `messages$` explicitly, same as
 * every other harness in this file, so a test that needs more than one
 * subscribe frame (e.g. proving a socket holds at most one live observer)
 * can send exactly as many as it needs. */
function availabilityGateHarness(
  config: JarvisGateConfig,
): AvailabilityGateHarness {
  const meter = new UsageMeter();
  const gate = new JarvisGateService(meter, config);
  const loops: JarvisLoops = {
    scripted: { createSession: vi.fn() },
    anthropic: { createSession: vi.fn() },
    brains: JARVIS_BRAINS,
    defaultBrain: "claude-haiku-4-5",
  };
  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  const ctx = { jarvisGate: gate } as unknown as Ctx;
  createWsListener(combineEffects(...jarvisEffects(loops)), ctx)(socket);
  return { meter, gate, messages$: socket.messages$, sent };
}

function harness(): Harness {
  // `{}` explicit — see the note on the anthropic-loop availability test
  // above; every scenario built from this harness assumes an ungated
  // ("none") gate regardless of the ambient process env.
  const services = createServices({});
  const loops = createJarvisLoops({ RTC_JARVIS_FAKE: "1" }, services);

  if (!loops) {
    throw new Error("expected a non-null JarvisLoops");
  }

  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(combineEffects(...jarvisEffects(loops)), services)(socket);
  return {
    services,
    messages$: socket.messages$,
    closed$: socket.closed$,
    sent,
  };
}

interface TwoSocketHarness {
  readonly services: ServiceContainer;
  readonly a: SocketHandle;
  readonly b: SocketHandle;
}

interface SocketHandle {
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
}

/** Wires ONE `jarvisEffects(loops)` array to TWO separately-`listen()`ed
 * sockets, mirroring how `server/src/index.ts` calls the same listener once
 * per accepted connection — each call runs the session effect's body again,
 * so each socket gets its own `AgentSession` via `loops.scripted.createSession()`. */
function twoSocketHarness(): TwoSocketHarness {
  const services = createServices({});
  const loops = createJarvisLoops({ RTC_JARVIS_FAKE: "1" }, services);

  if (!loops) {
    throw new Error("expected a non-null JarvisLoops");
  }

  const listen = createWsListener(
    combineEffects(...jarvisEffects(loops)),
    services,
  );
  const sentA: Outbound[] = [];
  const socketA = createSocket(sentA);
  listen(socketA);
  const sentB: Outbound[] = [];
  const socketB = createSocket(sentB);
  listen(socketB);

  return {
    services,
    a: { messages$: socketA.messages$, sent: sentA },
    b: { messages$: socketB.messages$, sent: sentB },
  };
}

function reassembleDeltas(sent: readonly Outbound[]): string {
  return sent
    .filter((m) => {
      return m.type === SERVER_MSG.JARVIS_DELTA;
    })
    .map((m) => {
      return (m.payload as DeltaPayload).text;
    })
    .join("");
}

interface StubHarness {
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
}

/** Wires `jarvisEffects` to a caller-supplied stub `AgentLoop` as the
 * scripted-only `JarvisLoops` shape (`anthropic: null` — every stub test
 * below sends no `brain`, so routing always resolves to `"scripted"` and
 * reaches this loop) — no `ServiceContainer` / fake timers, since a stub
 * `runTurn` returning `of(…)` emits synchronously. A minimal stub `ctx`
 * supplies just `usageMeter.recordTurn` (a no-op spy) and an ungated
 * `jarvisGate` — the two `Ctx` members `jarvisEffects` reads. */
function stubHarness(loop: AgentLoop): StubHarness {
  const loops: JarvisLoops = {
    scripted: loop,
    anthropic: null,
    brains: ["scripted"],
    defaultBrain: "scripted",
  };

  const ctx = {
    usageMeter: { recordTurn: vi.fn() },
    jarvisGate: createUngatedGate(),
  } as unknown as Ctx;
  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(combineEffects(...jarvisEffects(loops)), ctx)(socket);
  return { messages$: socket.messages$, sent };
}

interface SpySession {
  readonly runTurn: ReturnType<typeof vi.fn>;
  readonly resolveConfirmation: ReturnType<typeof vi.fn>;
  readonly cancelTurn: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
}

interface SpyLoop {
  readonly loop: AgentLoop;
  /** Spies on the loop's own `createSession()` — the laziness contract
   * (a brain a connection never uses must never have this called). */
  readonly createSession: ReturnType<typeof vi.fn>;
  /** Every session this loop has minted so far, in call order. */
  readonly sessions: SpySession[];
}

/** A spy `AgentLoop` for the dual-brain routing tests below: `createSession`
 * is itself a spy, and every session it mints records every call made to it.
 * `runTurnImpl` defaults to a turn that completes immediately with `done` —
 * pass a custom one (e.g. one backed by a held-open `Subject`, the same
 * technique `createControllableStubLoop` below uses) for a test that needs
 * the turn to stay "in flight" (e.g. to exercise `jarvis.cancel`). */
function createSpyLoop(
  runTurnImpl: () => Observable<JarvisEvent> = (): Observable<JarvisEvent> => {
    return of<JarvisEvent>({ type: "done" });
  },
): SpyLoop {
  const sessions: SpySession[] = [];
  const createSession = vi.fn((): AgentSession => {
    // Built from precisely-typed locals (not a `SpySession`-annotated
    // literal) — annotating the literal directly would push vi.fn()'s
    // generic inference for `runTurn` through the loose `ReturnType<typeof
    // vi.fn>` field type instead of the specific lambda below, and the
    // resulting untyped mock then fails `AgentSession`'s structural check.
    const runTurn = vi.fn(
      (
        _text: string,
        _history: readonly JarvisHistoryEntry[],
        _options?: JarvisTurnOptions,
      ): Observable<JarvisEvent> => {
        return runTurnImpl();
      },
    );
    const resolveConfirmation = vi.fn();
    const cancelTurn = vi.fn();
    const dispose = vi.fn();
    const session = { runTurn, resolveConfirmation, cancelTurn, dispose };
    sessions.push(session);
    return session;
  });
  return { loop: { createSession }, createSession, sessions };
}

interface DualLoopsHarness {
  readonly messages$: Subject<Inbound>;
  readonly closed$: Subject<void>;
  readonly sent: Outbound[];
}

/** Wires `jarvisEffects` to a caller-supplied `JarvisLoops`, with an
 * injectable `recordTurn` spy standing in for `ctx.usageMeter.recordTurn`
 * and an injectable `jarvisGate` (an ungated stand-in by default) — the two
 * `Ctx` members `jarvisEffects` reads. */
function wireDualLoops(
  loops: JarvisLoops,
  recordTurn: ReturnType<typeof vi.fn> = vi.fn(),
  jarvisGate: JarvisGateService = createUngatedGate(),
): DualLoopsHarness {
  const ctx = { usageMeter: { recordTurn }, jarvisGate } as unknown as Ctx;
  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(combineEffects(...jarvisEffects(loops)), ctx)(socket);
  return { messages$: socket.messages$, closed$: socket.closed$, sent };
}

interface DualSpyHarness extends DualLoopsHarness {
  readonly loops: JarvisLoops;
  readonly scriptedSpy: SpyLoop;
  readonly anthropicSpy: SpyLoop;
}

/** The common case for the dual-brain routing tests: a full `JarvisLoops`
 * (all four `JARVIS_BRAINS`, `DEFAULT_JARVIS_BRAIN`) built from two fresh
 * `createSpyLoop()`s, wired via `wireDualLoops`. `jarvisGate` defaults to an
 * ungated stand-in — the budget-gate tests below pass a forced/tripped
 * `JarvisGateService` instead, to prove `resolveBrain` actually consults it. */
function dualLoopsHarness(
  recordTurn: ReturnType<typeof vi.fn> = vi.fn(),
  jarvisGate: JarvisGateService = createUngatedGate(),
): DualSpyHarness {
  const scriptedSpy = createSpyLoop();
  const anthropicSpy = createSpyLoop();
  const loops: JarvisLoops = {
    scripted: scriptedSpy.loop,
    anthropic: anthropicSpy.loop,
    brains: JARVIS_BRAINS,
    defaultBrain: DEFAULT_JARVIS_BRAIN,
  };

  const { messages$, closed$, sent } = wireDualLoops(
    loops,
    recordTurn,
    jarvisGate,
  );
  return { loops, scriptedSpy, anthropicSpy, messages$, closed$, sent };
}

interface CapturingStubLoop {
  readonly loop: AgentLoop;
  /** The stub session's `runTurn`, so a test can assert exactly what
   * `(text, history)` args `jarvisEffects` handed it. */
  readonly runTurn: ReturnType<typeof vi.fn>;
}

/** A stub `AgentLoop` whose single session's `runTurn` records every call
 * (args) and completes immediately — used by the history-payload-handling
 * tests, which only care what reaches `session.runTurn`, not the streamed
 * reply. */
function createCapturingStubLoop(): CapturingStubLoop {
  const runTurn = vi.fn(
    (
      _text: string,
      _history: readonly JarvisHistoryEntry[],
    ): Observable<JarvisEvent> => {
      return of<JarvisEvent>({ type: "done" });
    },
  );

  const loop: AgentLoop = {
    createSession: () => {
      return {
        runTurn,
        resolveConfirmation: vi.fn(),
        cancelTurn: vi.fn(),
        dispose: vi.fn(),
      };
    },
  };
  return { loop, runTurn };
}

interface ControllableStubLoop {
  readonly loop: AgentLoop;
  /** One `Subject` per `runTurn()` call, in call order — a test drives a
   * turn's events by pushing to `turnSubjects[n]` directly and asserts
   * queuing by checking `turnSubjects.length` (a later turn's `Subject`
   * doesn't exist until `runTurn` is actually called for it). */
  readonly turnSubjects: Subject<JarvisEvent>[];
}

/** A stub `AgentLoop` whose single session's `runTurn` returns a fresh,
 * test-controlled `Subject` per call instead of completing on its own —
 * used to prove `jarvisChat$`'s `concatMap` serialization: a `mergeMap`
 * implementation would subscribe every turn's stream immediately, so
 * `turnSubjects` would grow to N on N `jarvis.chat` frames sent back to
 * back; `concatMap` only subscribes the next one once the previous
 * `Subject` completes. */
function createControllableStubLoop(): ControllableStubLoop {
  const turnSubjects: Subject<JarvisEvent>[] = [];

  const loop: AgentLoop = {
    createSession: () => {
      return {
        runTurn: (): Observable<JarvisEvent> => {
          const subject = new Subject<JarvisEvent>();
          turnSubjects.push(subject);
          return subject.asObservable();
        },
        resolveConfirmation: vi.fn(),
        cancelTurn: vi.fn(),
        dispose: vi.fn(),
      };
    },
  };

  return { loop, turnSubjects };
}

/** A stub `AgentLoop` whose single session's `runTurn` throws SYNCHRONOUSLY
 * on its first call (as a naive, unguarded `AgentLoop` implementation
 * might) and behaves normally on every later call — proves the `defer()`
 * wrapper around `session.runTurn(...)` in `jarvisEffects` keeps that throw
 * from tearing down the whole per-connection effect. */
function createOnceThrowingStubLoop(): AgentLoop {
  let calls = 0;

  return {
    createSession: () => {
      return {
        runTurn: (): Observable<JarvisEvent> => {
          calls += 1;

          if (calls === 1) {
            throw new Error("boom");
          }

          return of<JarvisEvent>({ type: "done" });
        },
        resolveConfirmation: vi.fn(),
        cancelTurn: vi.fn(),
        dispose: vi.fn(),
      };
    },
  };
}

function findConfirmRequest(sent: readonly Outbound[]): Outbound {
  const confirmRequest = sent.find((m) => {
    return m.type === SERVER_MSG.JARVIS_CONFIRM_REQUEST;
  });

  if (!confirmRequest) {
    throw new Error("expected a jarvis.confirmRequest frame");
  }

  return confirmRequest;
}
