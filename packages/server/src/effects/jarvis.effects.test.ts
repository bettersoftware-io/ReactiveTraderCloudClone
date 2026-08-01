import { type Observable, of, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Direction } from "@rtc/domain";
import type {
  JarvisCancelPayload,
  JarvisChatPayload,
  JarvisConfirmPayload,
  JarvisEvent,
  JarvisHistoryEntry,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import type { AgentLoop } from "../agent/agentLoop.js";
import { createAgentLoop } from "../agent/agentLoop.js";
import {
  createServices,
  type ServiceContainer,
} from "../services/serviceContainer.js";
import type { Ctx } from "./context.js";
import { jarvisEffects } from "./jarvis.effects.js";

const QUOTE_REPLY =
  "EURUSD is trading at 1.0921, up 0 pips since the start of the session. " +
  "Spread 1 pips; short-term momentum is positive. Anything else, sir?";

const DECLINED_REPLY = "Understood, sir — standing down. Nothing was executed.";

const FILL_REPLY =
  "Very good, sir. Bought 5,000,000 EUR at 1.0922 — the trade is on your blotter.";

const STUB_TURN_ID = "turn-stub";

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
  it("responds { available: false } to jarvis.subscribe when no agent loop is present", () => {
    const sent: Outbound[] = [];
    const socket = createSocket(sent);
    createWsListener(combineEffects(...jarvisEffects(null)), {} as Ctx)(socket);

    socket.messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    expect(sent).toEqual([
      { type: SERVER_MSG.JARVIS_AVAILABILITY, payload: { available: false } },
    ]);
  });

  it("responds { available: true } to jarvis.subscribe when a scripted loop is present", () => {
    const { messages$, sent } = harness();

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });

    expect(sent).toEqual([
      { type: SERVER_MSG.JARVIS_AVAILABILITY, payload: { available: true } },
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
      payload: { text: "no turn id here" },
    });

    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalled();

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
  });

  it("jarvis.cancel with a malformed payload is dropped without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messages$, sent } = harness();

    expect(() => {
      messages$.next({ type: CLIENT_MSG.JARVIS_CANCEL, payload: {} });
    }).not.toThrow();

    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalled();
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
  it.each(
    WIRE_MAPPING_CASES,
  )("maps a stubbed $event.type event to its wire type, minus the type field, plus turnId", ({
    event,
    wireType,
    body,
  }) => {
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
  });
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

function harness(): Harness {
  const services = createServices();
  const loop = createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services);

  if (!loop) {
    throw new Error("expected a non-null AgentLoop");
  }

  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(combineEffects(...jarvisEffects(loop)), {} as Ctx)(socket);
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

/** Wires ONE `jarvisEffects(loop)` array to TWO separately-`listen()`ed
 * sockets, mirroring how `server/src/index.ts` calls the same listener once
 * per accepted connection — each call runs the session effect's body again,
 * so each socket gets its own `AgentSession` via `loop.createSession()`. */
function twoSocketHarness(): TwoSocketHarness {
  const services = createServices();
  const loop = createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services);

  if (!loop) {
    throw new Error("expected a non-null AgentLoop");
  }

  const listen = createWsListener(
    combineEffects(...jarvisEffects(loop)),
    {} as Ctx,
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

/** Wires `jarvisEffects` to a caller-supplied stub `AgentLoop` — no
 * `ServiceContainer` / fake timers, since a stub `runTurn` returning `of(…)`
 * emits synchronously. Used only by the wire-type mapping table above. */
function stubHarness(loop: AgentLoop): StubHarness {
  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(combineEffects(...jarvisEffects(loop)), {} as Ctx)(socket);
  return { messages$: socket.messages$, sent };
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
