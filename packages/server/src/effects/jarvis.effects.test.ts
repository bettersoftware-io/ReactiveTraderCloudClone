import { inspect } from "node:util";

import {
  combineEffects,
  createWsListener,
  type Inbound,
  type Outbound,
} from "@better-software/rx-ws-effects";
import { firstValueFrom, type Observable, of, Subject } from "rxjs";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import {
  DEFAULT_JARVIS_BRAIN,
  Direction,
  type DriveBatchV1,
  JARVIS_BRAINS,
  JARVIS_KEY_MAX_CHARS,
  JARVIS_OWN_CAP_MAX_USD,
  type JarvisBrain,
  type JarvisEvent,
  type JarvisHistoryEntry,
  type JarvisOwnBrain,
  type PanelSpecV1,
} from "@rtc/domain";
import {
  CLIENT_MSG,
  type JarvisAvailabilityPayload,
  type JarvisCancelPayload,
  type JarvisChatPayload,
  type JarvisConfirmPayload,
  type JarvisKeyPayload,
  SERVER_MSG,
} from "@rtc/shared";

import { AnthropicAgentLoop } from "../agent/AnthropicAgentLoop.js";
import {
  type AgentLoop,
  type AgentSession,
  createJarvisLoops,
  type JarvisLoops,
  type JarvisTurnOptions,
  type OwnKeyFailureSink,
  type OwnKeyLoopBuilder,
} from "../agent/agentLoop.js";
import { scopeServicesToConnection } from "../services/connectionScope.js";
import { createInMemorySpendStore } from "../services/jarvisBudget/InMemorySpendStore.js";
import type { JarvisTier } from "../services/jarvisBudget/jarvisTier.js";
import type {
  SpendStore,
  SpendTotals,
} from "../services/jarvisBudget/SpendStore.js";
import {
  type Caller,
  createServices,
  type ServiceContainer,
} from "../services/serviceContainer.js";
import type { JarvisTokenUsage } from "../services/UsageMeter.js";
import type { Ctx } from "./context.js";
import { jarvisEffects } from "./jarvis.effects.js";

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
  it("responds { available: true, brains: ['scripted'], defaultBrain: 'scripted' } when only the scripted loop is present (RTC_JARVIS_FAKE=1)", () => {
    const { messages$, sent } = createHarness();

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

  it("responds with every JARVIS_BRAINS entry and DEFAULT_JARVIS_BRAIN to an operator when a live anthropic loop is present too", async () => {
    vi.setSystemTime(NOON);
    // `{}` explicit, not the ambient `process.env` default — this test's
    // budget must not be spent regardless of whatever RTC_JARVIS_* is set in
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

    const sent: Outbound[] = [];
    const socket = createSocket(sent);
    createWsListener(
      combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop)),
      scopeServicesToConnection(services, OPERATOR),
    )(socket);

    socket.messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: JARVIS_BRAINS,
          defaultBrain: DEFAULT_JARVIS_BRAIN,
          budget: {
            keyKind: "house",
            spentUsd: 0,
            limitUsd: null,
            exhausted: null,
            resetsAtMs: NEXT_MIDNIGHT,
          },
        },
      },
    ]);
  });
});

describe("jarvis effects", () => {
  it("streams a quote turn's tool badge + paced deltas + done, every frame carrying the request's turnId, deltas reassembling the reply", async () => {
    const { messages$, sent } = createHarness();
    const turnId = "turn-quote";

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "where is EURUSD?", turnId } satisfies JarvisChatPayload,
    });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sent[0]).toEqual({
      type: SERVER_MSG.JARVIS_BRAIN,
      payload: { brain: "scripted", turnId },
    });
    expect(sent[1]).toEqual({
      type: SERVER_MSG.JARVIS_TOOL_EVENT,
      payload: { tool: "quote", status: "running", turnId },
    });
    expect(sent[2]).toEqual({
      type: SERVER_MSG.JARVIS_TOOL_EVENT,
      payload: { tool: "quote", status: "done", turnId },
    });
    expect(sent.at(-1)).toEqual({
      type: SERVER_MSG.JARVIS_DONE,
      payload: { turnId },
    });

    const deltas = sent.slice(3, -1);
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
    const { services, messages$, sent } = createHarness();
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
    const { services, messages$, sent } = createHarness();
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
    const { services, messages$, sent } = createHarness();
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
    const { messages$, sent } = createHarness();

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
    const { services, messages$, closed$, sent } = createHarness();
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
    const { services, a, b } = createTwoSocketHarness();
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
    const { messages$, sent } = createHarness();

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
    const { messages$, sent } = createHarness();

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

  it("rejects a jarvis.chat text longer than the wire cap with a JARVIS_ERROR, and serves the next turn", async () => {
    const { messages$, sent } = createHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "x".repeat(4_001),
        turnId: "t-long",
      } satisfies JarvisChatPayload,
    });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "x".repeat(4_000),
        turnId: "t-ok",
      } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sent[0]).toEqual({
      type: SERVER_MSG.JARVIS_ERROR,
      payload: { turnId: "t-long", message: "Malformed jarvis.chat payload." },
    });
    // The 4 000-char text sits exactly ON the cap and is served to
    // completion: a JARVIS_DONE for its turnId, and never a JARVIS_ERROR.
    expect(
      sent.some((m) => {
        return (
          m.type === SERVER_MSG.JARVIS_DONE &&
          (m.payload as TurnIdCarrier).turnId === "t-ok"
        );
      }),
    ).toBe(true);
    expect(
      sent.some((m) => {
        return (
          m.type === SERVER_MSG.JARVIS_ERROR &&
          (m.payload as TurnIdCarrier).turnId === "t-ok"
        );
      }),
    ).toBe(false);
  });

  it("jarvis.chat with a non-object payload is dropped without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messages$, sent } = createHarness();

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
    const { messages$, sent } = createHarness();

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
    const { messages$, sent } = createHarness();

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
    const { messages$ } = createStubHarness(loop);
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
    const { messages$ } = createStubHarness(loop);

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
    const { messages$, sent } = createStubHarness(loop);

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
    const { messages$, sent } = createStubHarness(loop);

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
    const { messages$ } = createStubHarness(loop);
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
    const { messages$, sent } = createStubHarness(loop);
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
    const { messages$, sent } = createStubHarness(loop);

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
      const { messages$, sent } = createStubHarness(loop);

      messages$.next({
        type: CLIENT_MSG.JARVIS_CHAT,
        payload: {
          text: "irrelevant",
          turnId: STUB_TURN_ID,
        } satisfies JarvisChatPayload,
      });

      expect(sent).toEqual([
        {
          type: SERVER_MSG.JARVIS_BRAIN,
          payload: { brain: "scripted", turnId: STUB_TURN_ID },
        },
        { type: wireType, payload: body },
      ]);
    },
  );
});

describe("jarvis effects — chat turns are serialized (concatMap, not mergeMap)", () => {
  it("a second rapid jarvis.chat does not even start (runTurn is not invoked) until the first turn's stream completes", () => {
    const { loop, turnSubjects } = createControllableStubLoop();
    const { messages$, sent } = createStubHarness(loop);

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
    const { messages$, sent } = createStubHarness(loop);

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
  beforeEach(() => {
    vi.setSystemTime(NOON);
  });

  it("no brain in the payload routes to loops.defaultBrain, reaching the anthropic session with resolved options and the turn's meter", async () => {
    const { loops, scriptedSpy, anthropicSpy, messages$, sent } =
      dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "hi", turnId: STUB_TURN_ID } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    expect(scriptedSpy.createSession).not.toHaveBeenCalled();
    expect(anthropicSpy.createSession).toHaveBeenCalledTimes(1);
    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: loops.defaultBrain,
      effort: undefined,
      meter: expect.anything(),
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_BRAIN,
        payload: { brain: loops.defaultBrain, turnId: STUB_TURN_ID },
      },
      { type: SERVER_MSG.JARVIS_DONE, payload: { turnId: STUB_TURN_ID } },
    ]);
  });

  it("brain: 'scripted' routes to the scripted session; the anthropic spy is never touched", async () => {
    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "scripted",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    expect(scriptedSpy.createSession).toHaveBeenCalledTimes(1);
    expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", []);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });

  it("an explicit real-model brain + effort routes to the anthropic session carrying both", async () => {
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
    await settleBudgetReads();

    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: "claude-opus-5",
      effort: "high",
      meter: expect.anything(),
    });
  });

  it("an unrecognized brain string falls back to the default brain (lenient parse seam, not a rejected frame)", async () => {
    const { loops, anthropicSpy, messages$, sent } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "hi", turnId: STUB_TURN_ID, brain: "gpt-5" },
    });
    await settleBudgetReads();

    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: loops.defaultBrain,
      effort: undefined,
      meter: expect.anything(),
    });
    // Not treated as malformed: no JARVIS_ERROR, the turn still completes.
    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_BRAIN,
        payload: { brain: loops.defaultBrain, turnId: STUB_TURN_ID },
      },
      { type: SERVER_MSG.JARVIS_DONE, payload: { turnId: STUB_TURN_ID } },
    ]);
  });

  it("a recognized but un-offered brain (not a member of loops.brains) falls back to the default brain", async () => {
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
    await settleBudgetReads();

    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: "claude-haiku-4-5",
      effort: undefined,
      meter: expect.anything(),
    });
  });

  it("a scripted-only conversation never constructs the anthropic session (laziness)", async () => {
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
    await settleBudgetReads();

    expect(scriptedSpy.createSession).toHaveBeenCalledTimes(1);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });

  it("an anthropic-only conversation never constructs the scripted session (laziness)", async () => {
    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "one",
        turnId: "t1",
        brain: "claude-sonnet-5",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    expect(anthropicSpy.createSession).toHaveBeenCalledTimes(1);
    expect(scriptedSpy.createSession).not.toHaveBeenCalled();
  });

  it("records ctx.usageMeter.recordTurn(resolvedBrain) exactly once per accepted chat frame, in order", async () => {
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
    await settleBudgetReads();

    expect(recordTurn).toHaveBeenCalledTimes(2);
    expect(recordTurn).toHaveBeenNthCalledWith(1, "claude-sonnet-5");
    expect(recordTurn).toHaveBeenNthCalledWith(2, "scripted");
  });

  it("recordTurn is NOT called for a malformed chat frame — never an accepted turn", async () => {
    const recordTurn = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messages$ } = dualLoopsHarness(recordTurn);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { turnId: "bad-frame" },
    });
    await settleBudgetReads();

    expect(recordTurn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("jarvis.confirm forwards to BOTH live sessions — cross-talk is a no-op only because each session's own ownership guard gates it, not the effect layer", async () => {
    const { scriptedSpy, anthropicSpy, messages$ } = dualLoopsHarness();

    // Bring both sessions to life first (both default runTurn impls
    // complete immediately, so both chat frames finish once read).
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
    await settleBudgetReads();

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

  it("jarvis.cancel forwards to every EXISTING session when it matches the in-flight turnId, even an idle one", async () => {
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
    await settleBudgetReads();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CANCEL,
      payload: { turnId: "t-a" } satisfies JarvisCancelPayload,
    });

    expect(anthropicSpy.sessions[0]?.cancelTurn).toHaveBeenCalledTimes(1);
    expect(scriptedSpy.sessions[0]?.cancelTurn).toHaveBeenCalledTimes(1);
  });

  it("finalize disposes every session that was actually created for the connection", async () => {
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
    await settleBudgetReads();

    expect(scriptedSpy.sessions[0]?.dispose).not.toHaveBeenCalled();
    expect(anthropicSpy.sessions[0]?.dispose).not.toHaveBeenCalled();

    closed$.next();

    expect(scriptedSpy.sessions[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(anthropicSpy.sessions[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("finalize never disposes a session that was never created", async () => {
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
    await settleBudgetReads();

    closed$.next();

    expect(scriptedSpy.sessions[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });
});

describe("per-caller offers and the daily budget", () => {
  beforeEach(() => {
    vi.setSystemTime(NOON);
  });

  it("offers a member scripted, Haiku and Sonnet, Haiku by default, with the member's daily limit", async () => {
    const services = createBudgetServices();
    const { messages$, sent } = wireSpySocket(services, MEMBER);

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: ["scripted", "claude-haiku-4-5", "claude-sonnet-5"],
          defaultBrain: "claude-haiku-4-5",
          budget: {
            keyKind: "house",
            spentUsd: 0,
            limitUsd: 0.2,
            exhausted: null,
            resetsAtMs: NEXT_MIDNIGHT,
          },
        },
      },
    ]);
  });

  it("offers an operator (the roster persona) every brain and no personal limit", async () => {
    const services = createBudgetServices();
    const { messages$, sent } = wireSpySocket(services, OPERATOR);

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: JARVIS_BRAINS,
          defaultBrain: DEFAULT_JARVIS_BRAIN,
          budget: {
            keyKind: "house",
            spentUsd: 0,
            limitUsd: null,
            exhausted: null,
            resetsAtMs: NEXT_MIDNIGHT,
          },
        },
      },
    ]);
  });

  it("offers a connection with no signed-in caller the scripted brain only, with no budget — there is no one to meter", async () => {
    const services = createBudgetServices();
    const { anthropicSpy, scriptedSpy, messages$, sent } = wireSpySocket(
      services,
      null,
    );

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-haiku-4-5",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    expect(sent[0]).toEqual({
      type: SERVER_MSG.JARVIS_AVAILABILITY,
      payload: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
      },
    });
    expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", []);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });

  it("offers a member only the scripted brain when the process has no live model (RTC_JARVIS_FAKE=1), still with the budget", async () => {
    const services = createBudgetServices();
    const loops = createJarvisLoops({ RTC_JARVIS_FAKE: "1" }, services);

    const sent: Outbound[] = [];
    const socket = createSocket(sent);
    createWsListener(
      combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop)),
      scopeServicesToConnection(services, MEMBER),
    )(socket);

    socket.messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();

    expect(sent).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: ["scripted"],
          defaultBrain: "scripted",
          budget: {
            keyKind: "house",
            spentUsd: 0,
            limitUsd: 0.2,
            exhausted: null,
            resetsAtMs: NEXT_MIDNIGHT,
          },
        },
      },
    ]);
  });

  it("reads a caller whose tier lookup fails as a member: a failure never widens the offer", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const services = createServices(
      {},
      {
        jarvisTier: (): Promise<JarvisTier> => {
          return Promise.reject(new Error("directory down"));
        },
      },
    );
    const { messages$, sent } = wireSpySocket(services, OPERATOR);

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();

    expect(
      (sent[0]?.payload as JarvisAvailabilityPayload | undefined)?.brains,
    ).toEqual(["scripted", "claude-haiku-4-5", "claude-sonnet-5"]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "jarvis-budget: tier lookup failed, reading the caller as a member: directory down",
    );
  });

  it("runs a member's request for Opus on the default brain (Haiku): Opus is not on a member's offer", async () => {
    const services = createBudgetServices();
    const { anthropicSpy, messages$ } = wireSpySocket(services, MEMBER);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-opus-5",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: "claude-haiku-4-5",
      effort: undefined,
      meter: expect.anything(),
    });
  });

  it("an exhausted member: the subscribed socket is pushed a hard gate, and a chat asking for Haiku runs scripted", async () => {
    const services = createBudgetServices();
    const { anthropicSpy, scriptedSpy, messages$, sent } = wireSpySocket(
      services,
      MEMBER,
    );

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();
    expect(sent).toHaveLength(1);

    // $0.20 on Haiku ($1/Mtok input) — exactly the member's daily limit.
    services.jarvisBudget
      .meterFor(MEMBER, "member")
      .record("claude-haiku-4-5", createUsageFixture(200_000));
    await settleBudgetReads();

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      type: SERVER_MSG.JARVIS_AVAILABILITY,
      payload: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: {
          level: "hard",
          resetsAtMs: NEXT_MIDNIGHT,
          gated: ["claude-haiku-4-5", "claude-sonnet-5"],
        },
        budget: {
          keyKind: "house",
          spentUsd: 0.2,
          limitUsd: 0.2,
          exhausted: "user",
          resetsAtMs: NEXT_MIDNIGHT,
        },
      },
    });

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-haiku-4-5",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", []);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });

  it("a turn's meter reserves its requests in the caller's budget, where the caller's other turns see them, and releases them", async () => {
    const store = createInMemorySpendStore();
    await store.record("account:acc-ann", TODAY, "house", 0.15);
    const services = createBudgetServices({}, store);
    await services.jarvisBudget.stateFor(MEMBER, "member");
    const otherTab = services.jarvisBudget.meterFor(MEMBER, "member");
    const seenByOtherTab: boolean[] = [];
    const scriptedSpy = createSpyLoop();
    const anthropicSpy = createSpyLoop(
      (options?: JarvisTurnOptions): Observable<JarvisEvent> => {
        options?.meter?.beginRequest("claude-sonnet-5", SONNET_CEILING);
        seenByOtherTab.push(otherTab.exhausted());
        options?.meter?.endRequest();
        seenByOtherTab.push(otherTab.exhausted());
        return of<JarvisEvent>({ type: "done" });
      },
    );

    const loops: JarvisLoops = {
      scripted: scriptedSpy.loop,
      anthropic: anthropicSpy.loop,
      brains: JARVIS_BRAINS,
      defaultBrain: DEFAULT_JARVIS_BRAIN,
    };
    const socket = createSocket([]);
    createWsListener(
      combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop)),
      scopeServicesToConnection(services, MEMBER),
    )(socket);

    socket.messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-sonnet-5",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    expect(seenByOtherTab).toEqual([true, false]);
  });

  it("a spend store that cannot be read fails closed: the subscribed socket is gated as unavailable, and a chat asking for Haiku runs scripted", async () => {
    const unreachableStore: SpendStore = {
      kind: "supabase",
      read: (): Promise<"unavailable"> => {
        return Promise.resolve("unavailable");
      },
      record: (): Promise<"unavailable"> => {
        return Promise.resolve("unavailable");
      },
    };
    const services = createBudgetServices({}, unreachableStore);
    const { anthropicSpy, scriptedSpy, messages$, sent } = wireSpySocket(
      services,
      MEMBER,
    );

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-haiku-4-5",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    const availability = sent.filter((m) => {
      return m.type === SERVER_MSG.JARVIS_AVAILABILITY;
    });
    expect(availability).toEqual([
      {
        type: SERVER_MSG.JARVIS_AVAILABILITY,
        payload: {
          available: true,
          brains: ["scripted"],
          defaultBrain: "scripted",
          gate: {
            level: "hard",
            resetsAtMs: NEXT_MIDNIGHT,
            gated: ["claude-haiku-4-5", "claude-sonnet-5"],
          },
          budget: {
            keyKind: "house",
            spentUsd: 0,
            limitUsd: 0.2,
            exhausted: "unavailable",
            resetsAtMs: NEXT_MIDNIGHT,
          },
        },
      },
    ]);
    expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", []);
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
  });

  it("two tabs of one caller: a turn that spends the budget on one pushes the gated frame to both, and feeds the Ops usage meter", async () => {
    const services = createBudgetServices();
    // Each tab's turn spends $0.20 on Haiku through the meter the effect
    // hands the session — the way a real Anthropic session records.
    const scriptedSpy = createSpyLoop();
    const anthropicSpy = createSpyLoop(
      (options?: JarvisTurnOptions): Observable<JarvisEvent> => {
        options?.meter?.record("claude-haiku-4-5", createUsageFixture(200_000));
        return of<JarvisEvent>({ type: "done" });
      },
    );

    const loops: JarvisLoops = {
      scripted: scriptedSpy.loop,
      anthropic: anthropicSpy.loop,
      brains: JARVIS_BRAINS,
      defaultBrain: DEFAULT_JARVIS_BRAIN,
    };
    // One effect for the process, one scoped container per socket — the
    // way `index.ts` composes every connection.
    const effect = combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop));
    const sentA: Outbound[] = [];
    const socketA = createSocket(sentA);
    createWsListener(
      effect,
      scopeServicesToConnection(services, MEMBER),
    )(socketA);
    const sentB: Outbound[] = [];
    const socketB = createSocket(sentB);
    createWsListener(
      effect,
      scopeServicesToConnection(services, MEMBER),
    )(socketB);

    socketA.messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    socketB.messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();

    socketA.messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-haiku-4-5",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    for (const sent of [sentA, sentB]) {
      const availability = sent.filter((m) => {
        return m.type === SERVER_MSG.JARVIS_AVAILABILITY;
      });
      expect(gateLevelOf(availability.at(-1))).toBe("hard");
    }

    const usage = await firstValueFrom(services.usageMeter.snapshot$);
    expect(usage.sinceBoot).toEqual([
      expect.objectContaining({
        brain: "claude-haiku-4-5",
        turns: 1,
        inputTokens: 200_000,
      }),
    ]);
  });

  it("midnight lifts a spent budget: a gated socket that sends nothing is pushed an ungated frame at 00:00 UTC", async () => {
    const store = createInMemorySpendStore();
    await store.record("account:acc-ann", TODAY, "house", 0.2);
    const services = createBudgetServices({}, store);
    const { messages$, sent } = wireSpySocket(services, MEMBER);

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();

    expect(sent).toHaveLength(1);
    expect(gateLevelOf(sent[0])).toBe("hard");

    await vi.advanceTimersByTimeAsync(NEXT_MIDNIGHT - NOON);
    await settleBudgetReads();

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      type: SERVER_MSG.JARVIS_AVAILABILITY,
      payload: {
        available: true,
        brains: ["scripted", "claude-haiku-4-5", "claude-sonnet-5"],
        defaultBrain: "claude-haiku-4-5",
        budget: {
          keyKind: "house",
          spentUsd: 0,
          limitUsd: 0.2,
          exhausted: null,
          resetsAtMs: NEXT_MIDNIGHT + DAY_MS,
        },
      },
    });
  });

  it("a narrator turn asking for Haiku runs scripted and records nothing against the budget", async () => {
    const services = createBudgetServices();
    const { anthropicSpy, scriptedSpy, messages$ } = wireSpySocket(
      services,
      MEMBER,
    );

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "narrate",
        turnId: STUB_TURN_ID,
        brain: "claude-haiku-4-5",
        origin: "narrator",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();

    expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledWith(
      "narrate",
      [],
    );
    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
    expect(
      (await services.jarvisBudget.stateFor(MEMBER, "member")).spentUsd,
    ).toBe(0);
  });

  it("an origin other than narrator reads as the person's own turn", async () => {
    const services = createBudgetServices();
    const { anthropicSpy, messages$ } = wireSpySocket(services, MEMBER);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-haiku-4-5",
        origin: "robot",
      },
    });
    await settleBudgetReads();

    expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledWith("hi", [], {
      brain: "claude-haiku-4-5",
      effort: undefined,
      meter: expect.anything(),
    });
  });

  it("a cancel that lands while the turn's budget read is pending keeps the turn from starting", async () => {
    const pendingReads: ((totals: SpendTotals) => void)[] = [];
    const slowStore: SpendStore = {
      kind: "in-memory",
      read: (): Promise<SpendTotals> => {
        return new Promise((resolve) => {
          pendingReads.push(resolve);
        });
      },
      record: (): Promise<SpendTotals> => {
        return Promise.resolve({ ownerUsd: 0, houseUsd: 0 });
      },
    };
    const services = createBudgetServices({}, slowStore);
    const { anthropicSpy, scriptedSpy, messages$, sent } = wireSpySocket(
      services,
      MEMBER,
    );

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: {
        text: "hi",
        turnId: STUB_TURN_ID,
        brain: "claude-haiku-4-5",
      } satisfies JarvisChatPayload,
    });
    await settleBudgetReads();
    messages$.next({
      type: CLIENT_MSG.JARVIS_CANCEL,
      payload: { turnId: STUB_TURN_ID } satisfies JarvisCancelPayload,
    });
    expect(pendingReads).toHaveLength(1);
    pendingReads[0]?.({ ownerUsd: 0, houseUsd: 0 });
    await settleBudgetReads();

    expect(anthropicSpy.createSession).not.toHaveBeenCalled();
    expect(scriptedSpy.createSession).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("two subscribe frames on one socket leave exactly one live observer: a budget change pushes exactly one new frame, not two", async () => {
    const services = createBudgetServices();
    const { messages$, sent } = wireSpySocket(services, MEMBER);

    // Two JARVIS_SUBSCRIBE frames on the SAME socket — a reconnect replay,
    // or simply a client re-sending the handshake. Each produces its own
    // immediate frame, so `sent` legitimately holds two frames here — the
    // assertion below is about what happens on the NEXT change.
    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();
    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();
    expect(sent).toHaveLength(2);

    // A mergeMap'd (uncapped) availability effect would still hold BOTH
    // subscribe frames' observers live, so this one change would append
    // TWO new frames. switchMap tore the first one down when the second
    // JARVIS_SUBSCRIBE arrived — exactly one new frame.
    services.jarvisBudget
      .meterFor(MEMBER, "member")
      .record("claude-haiku-4-5", createUsageFixture(200_000));
    await settleBudgetReads();

    expect(sent).toHaveLength(3);
    expect(gateLevelOf(sent[2])).toBe("hard");
  });

  it("a budget change that leaves this caller's frame as it was pushes nothing", async () => {
    const services = createBudgetServices();
    const { messages$, sent } = wireSpySocket(services, MEMBER);

    messages$.next({ type: CLIENT_MSG.JARVIS_SUBSCRIBE, payload: {} });
    await settleBudgetReads();

    // Someone else's spend moves the house total, not this member's view.
    await services.jarvisBudget.stateFor(OTHER_MEMBER, "member");
    services.jarvisBudget
      .meterFor(OTHER_MEMBER, "member")
      .record("claude-haiku-4-5", createUsageFixture(10_000));
    await settleBudgetReads();

    expect(sent).toHaveLength(1);
  });
});

describe("jarvis effects — each turn is stamped with the brain that ran", () => {
  beforeEach(() => {
    vi.setSystemTime(NOON);
  });

  it("a member asking for Sonnet within budget: the first frame names Sonnet", async () => {
    const { messages$, sent } = wireSpySocket(createBudgetServices(), MEMBER);

    messages$.next(chatFrame("claude-sonnet-5"));
    await settleBudgetReads();

    expectBrainFirst(sent, "claude-sonnet-5");
  });

  it("a member asking for Opus, which is not offered: the first frame names the resolved default, Haiku", async () => {
    const { messages$, sent } = wireSpySocket(createBudgetServices(), MEMBER);

    messages$.next(chatFrame("claude-opus-5"));
    await settleBudgetReads();

    expectBrainFirst(sent, "claude-haiku-4-5");
  });

  it("an exhausted member asking for Haiku: the first frame names scripted", async () => {
    const services = createBudgetServices();
    const { messages$, sent } = wireSpySocket(services, MEMBER);

    services.jarvisBudget
      .meterFor(MEMBER, "member")
      .record("claude-haiku-4-5", createUsageFixture(200_000));
    await settleBudgetReads();

    messages$.next(chatFrame("claude-haiku-4-5"));
    await settleBudgetReads();

    expectBrainFirst(sent, "scripted");
  });

  it("a narrator turn asking for Haiku: the first frame names scripted", async () => {
    const { messages$, sent } = wireSpySocket(createBudgetServices(), MEMBER);

    messages$.next(chatFrame("claude-haiku-4-5", "narrator"));
    await settleBudgetReads();

    expectBrainFirst(sent, "scripted");
  });

  it("a model brain with no live anthropic session falls back to scripted, and the frame says so", async () => {
    const scriptedSpy = createSpyLoop();
    const loops: JarvisLoops = {
      scripted: scriptedSpy.loop,
      anthropic: null,
      brains: JARVIS_BRAINS,
      defaultBrain: DEFAULT_JARVIS_BRAIN,
    };
    const { messages$, sent } = wireDualLoops(loops);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      return undefined;
    });

    messages$.next(chatFrame("claude-haiku-4-5"));
    await settleBudgetReads();
    logged.mockRestore();

    expect(scriptedSpy.createSession).toHaveBeenCalledTimes(1);
    expectBrainFirst(sent, "scripted");
  });

  it("the brain frame precedes every other frame of the turn", async () => {
    const { messages$, sent } = wireSpySocket(createBudgetServices(), MEMBER);

    messages$.next(chatFrame("claude-haiku-4-5"));
    await settleBudgetReads();

    expect(
      sent.map((frame) => {
        return frame.type;
      }),
    ).toEqual([SERVER_MSG.JARVIS_BRAIN, SERVER_MSG.JARVIS_DONE]);
  });
});

describe("a person's own key", () => {
  beforeEach(() => {
    vi.setSystemTime(NOON);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("availability", () => {
    it("an accepted key adds its models to the availability frame with ownKey and ownBudget", async () => {
      answerFetchWith(200);
      const { messages$, sent } = ownKeyHarness();

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(lastAvailability(sent)).toEqual({
        available: true,
        brains: [
          "scripted",
          "claude-haiku-4-5",
          "claude-sonnet-5",
          OWN_HAIKU,
          OWN_SONNET,
          OWN_OPUS,
        ],
        defaultBrain: DEFAULT_JARVIS_BRAIN,
        budget: expect.objectContaining({ keyKind: "house" }),
        ownBudget: {
          keyKind: "own",
          spentUsd: 0,
          limitUsd: 1,
          exhausted: null,
          resetsAtMs: NEXT_MIDNIGHT,
        },
        ownKey: { provider: "anthropic", status: "accepted", capUsd: 1 },
      });
    });

    it("offers the own brains while the key is being checked", async () => {
      holdFetch();
      const { messages$, sent } = ownKeyHarness();

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(lastAvailability(sent).ownKey?.status).toBe("checking");
      expect(lastAvailability(sent).brains).toContain(OWN_HAIKU);
    });

    it.each([
      ["unreachable", 500, (): void => {}],
      [
        "limited",
        200,
        (services: ServiceContainer): void => {
          vi.spyOn(services.ownKeyChecks, "allow").mockReturnValue(false);
        },
      ],
    ])(
      "offers no own brain on a key reading %s, and gates none, though the frame says why",
      async (status, httpStatus, prepare) => {
        answerFetchWith(httpStatus);
        const services = createBudgetServices();
        prepare(services);
        const { messages$, sent } = ownKeyHarness({ services });

        messages$.next(SUBSCRIBE_FRAME);
        messages$.next(keyFrame());
        await settleBudgetReads();

        const frame = lastAvailability(sent);

        expect(frame.ownKey?.status).toBe(status);
        expect(frame.ownBudget?.keyKind).toBe("own");
        expect(frame.brains).not.toContain(OWN_HAIKU);
        expect(frame.gate).toBeUndefined();
      },
    );

    it("clearing the key takes ownKey and ownBudget off the frame", async () => {
      answerFetchWith(200);
      const { messages$, sent } = ownKeyHarness();

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(CLEAR_KEY_FRAME);
      await settleBudgetReads();

      expect(lastAvailability(sent)).not.toHaveProperty("ownKey");
      expect(lastAvailability(sent)).not.toHaveProperty("ownBudget");
      expect(lastAvailability(sent).brains).not.toContain(OWN_HAIKU);
    });

    it("a house budget that is spent still leaves the own brains offered, with the house brains gated", async () => {
      answerFetchWith(200);
      const services = createBudgetServices({ RTC_JARVIS_USER_DAILY_USD: "0" });
      const { messages$, sent } = ownKeyHarness({ services });

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(lastAvailability(sent).brains).toEqual([
        "scripted",
        OWN_HAIKU,
        OWN_SONNET,
        OWN_OPUS,
      ]);
      expect(lastAvailability(sent).gate?.gated).toEqual([
        "claude-haiku-4-5",
        "claude-sonnet-5",
      ]);
    });
  });

  describe("routing", () => {
    it.each<readonly [string, number, JarvisBrain, boolean]>([
      ["no key", 200, OWN_HAIKU, false],
      ["an unreachable check", 500, OWN_HAIKU, true],
      ["a model that left the list", 200, RETIRED_OWN_BRAIN, true],
      ["another provider's model", 200, OPENAI_OWN_BRAIN, true],
    ])(
      "an own brain with no key runs scripted, never a house brain: %s",
      async (_name, httpStatus, brain, sendKey) => {
        answerFetchWith(httpStatus);
        const { messages$, sent, scriptedSpy, anthropicSpy, buildOwnKeyLoop } =
          ownKeyHarness();

        if (sendKey) {
          messages$.next(keyFrame());
        }

        await settleBudgetReads();
        messages$.next(chatFrame(brain));
        await settleBudgetReads();

        expectBrainFirst(sent, "scripted");
        expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledTimes(1);
        expect(anthropicSpy.createSession).not.toHaveBeenCalled();
        expect(buildOwnKeyLoop).not.toHaveBeenCalled();
      },
    );

    it("an own brain with no key runs scripted, never a house brain: a limited check", async () => {
      answerFetchWith(200);
      const services = createBudgetServices();
      vi.spyOn(services.ownKeyChecks, "allow").mockReturnValue(false);
      const { messages$, sent, anthropicSpy, buildOwnKeyLoop } = ownKeyHarness({
        services,
      });

      messages$.next(keyFrame());
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expectBrainFirst(sent, "scripted");
      expect(anthropicSpy.createSession).not.toHaveBeenCalled();
      expect(buildOwnKeyLoop).not.toHaveBeenCalled();
    });

    it("an own brain on a connection with no caller runs scripted", async () => {
      const { messages$, sent, anthropicSpy } = ownKeyHarness({ caller: null });

      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expectBrainFirst(sent, "scripted");
      expect(anthropicSpy.createSession).not.toHaveBeenCalled();
    });

    it("an accepted key runs the turn on that brain, building the loop lazily with the provider and key", async () => {
      answerFetchWith(200);
      const { messages$, sent, ownSpy, buildOwnKeyLoop, anthropicSpy } =
        ownKeyHarness();

      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(buildOwnKeyLoop).not.toHaveBeenCalled();

      messages$.next(chatFrame(OWN_SONNET));
      await settleBudgetReads();

      expect(buildOwnKeyLoop).toHaveBeenCalledExactlyOnceWith(
        "anthropic",
        OWN_KEY,
      );
      expect(ownSpy.sessions[0]?.runTurn).toHaveBeenCalledExactlyOnceWith(
        "hi",
        [],
        {
          brain: OWN_SONNET,
          effort: undefined,
          meter: expect.anything(),
          keyFailure: {
            providerName: "Anthropic",
            refused: expect.any(Function),
          },
        },
      );
      expectBrainFirst(sent, OWN_SONNET);
      expect(anthropicSpy.createSession).not.toHaveBeenCalled();
    });

    it("an own brain still being checked waits for the answer", async () => {
      const fetches = holdFetch();
      const { messages$, sent, scriptedSpy, anthropicSpy, ownSpy } =
        ownKeyHarness();

      messages$.next(keyFrame());
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expect(brainFramesOf(sent)).toEqual([]);
      expect(scriptedSpy.createSession).not.toHaveBeenCalled();
      expect(anthropicSpy.createSession).not.toHaveBeenCalled();

      fetches.answer(0, 200);
      await settleBudgetReads();

      expectBrainFirst(sent, OWN_HAIKU);
      expect(ownSpy.sessions[0]?.runTurn).toHaveBeenCalledTimes(1);
    });

    it("a newer key sent during the wait is waited for too", async () => {
      const fetches = holdFetch();
      const { messages$, sent, ownSpy, buildOwnKeyLoop } = ownKeyHarness();

      messages$.next(keyFrame("sk-first"));
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();
      messages$.next(keyFrame("sk-second"));
      await settleBudgetReads();
      fetches.answer(0, 200);
      await settleBudgetReads();

      expect(brainFramesOf(sent)).toEqual([]);

      fetches.answer(1, 200);
      await settleBudgetReads();

      expectBrainFirst(sent, OWN_HAIKU);
      expect(ownSpy.sessions).toHaveLength(1);
      expect(buildOwnKeyLoop).toHaveBeenCalledWith("anthropic", "sk-second");
    });

    it("a turn cancelled while its key is being checked never starts", async () => {
      const fetches = holdFetch();
      const { messages$, sent, scriptedSpy, buildOwnKeyLoop } = ownKeyHarness();

      messages$.next(keyFrame());
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();
      messages$.next({
        type: CLIENT_MSG.JARVIS_CANCEL,
        payload: { turnId: STUB_TURN_ID } satisfies JarvisCancelPayload,
      });
      fetches.answer(0, 200);
      await settleBudgetReads();

      expect(sent).toEqual([]);
      expect(scriptedSpy.createSession).not.toHaveBeenCalled();
      expect(buildOwnKeyLoop).not.toHaveBeenCalled();
    });

    it("a refused key keeps the own brain offered and each turn fails naming the provider", async () => {
      answerFetchWith(401);
      const {
        messages$,
        sent,
        scriptedSpy,
        anthropicSpy,
        buildOwnKeyLoop,
        recordTurn,
      } = ownKeyHarness();

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(lastAvailability(sent).ownKey?.status).toBe("refused");
      expect(lastAvailability(sent).brains).toContain(OWN_HAIKU);

      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_SONNET));
      await settleBudgetReads();

      expect(errorMessagesOf(sent)).toEqual([
        "Anthropic refused your key.",
        "Anthropic refused your key.",
      ]);
      expect(brainFramesOf(sent)).toEqual([]);
      expect(buildOwnKeyLoop).not.toHaveBeenCalled();
      expect(scriptedSpy.createSession).not.toHaveBeenCalled();
      expect(anthropicSpy.createSession).not.toHaveBeenCalled();
      expect(recordTurn).not.toHaveBeenCalled();
    });

    it("a house brain runs as today with a refused key beside it", async () => {
      answerFetchWith(401);
      const { messages$, sent, anthropicSpy } = ownKeyHarness();

      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame("claude-sonnet-5"));
      await settleBudgetReads();

      expectBrainFirst(sent, "claude-sonnet-5");
      expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledTimes(1);
    });

    it("a provider 401 mid-session marks the key refused and pushes availability", async () => {
      answerFetchWith(200);
      const runner = vi.fn((): never => {
        throw providerError(401, "denied");
      });

      const { messages$, sent } = ownKeyHarness({
        ownLoop: anthropicLoopOver(runner),
      });

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();
      vi.spyOn(console, "error").mockImplementation(() => {});
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expect(errorMessagesOf(sent)).toEqual(["Anthropic refused your key."]);
      expect(lastAvailability(sent).ownKey?.status).toBe("refused");
      expect(lastAvailability(sent).brains).toContain(OWN_HAIKU);

      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expect(runner).toHaveBeenCalledTimes(1);
      expect(errorMessagesOf(sent)).toHaveLength(2);
    });

    it("a failure from the session of an old key leaves a newer accepted key alone", async () => {
      answerFetchWith(200);
      const sinks: OwnKeyFailureSink[] = [];
      const { messages$, sent } = ownKeyHarness({
        runOwnTurn: (options?: JarvisTurnOptions): Observable<JarvisEvent> => {
          if (options?.keyFailure !== undefined) {
            sinks.push(options.keyFailure);
          }

          return of<JarvisEvent>({ type: "done" });
        },
      });

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame("sk-old"));
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();
      messages$.next(keyFrame("sk-new"));
      await settleBudgetReads();

      sinks[0]?.refused();
      await settleBudgetReads();

      expect(lastAvailability(sent).ownKey?.status).toBe("accepted");

      // The witness: the sink of the current key's session does refuse it.
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();
      sinks[1]?.refused();
      await settleBudgetReads();

      expect(lastAvailability(sent).ownKey?.status).toBe("refused");
    });

    it("a spent cap runs scripted and gates the own brains; a house brain still runs", async () => {
      answerFetchWith(200);
      const store = createInMemorySpendStore();
      await store.record("account:acc-ann", TODAY, "own", 1);
      const services = createBudgetServices({}, store);
      const { messages$, sent, anthropicSpy, buildOwnKeyLoop } = ownKeyHarness({
        services,
      });

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame(OWN_KEY, 1));
      await settleBudgetReads();

      const frame = lastAvailability(sent);

      expect(frame.brains).toEqual([
        "scripted",
        "claude-haiku-4-5",
        "claude-sonnet-5",
      ]);
      expect(frame.gate).toEqual({
        level: "hard",
        resetsAtMs: NEXT_MIDNIGHT,
        gated: [OWN_HAIKU, OWN_SONNET, OWN_OPUS],
      });
      expect(frame.ownBudget?.exhausted).toBe("user");
      expect(frame.budget?.exhausted).toBeNull();

      sent.length = 0;
      messages$.next(chatFrame(OWN_SONNET));
      await settleBudgetReads();

      expectBrainFirst(sent, "scripted");
      expect(anthropicSpy.createSession).not.toHaveBeenCalled();
      expect(buildOwnKeyLoop).not.toHaveBeenCalled();

      sent.length = 0;
      messages$.next(chatFrame("claude-sonnet-5"));
      await settleBudgetReads();

      expectBrainFirst(sent, "claude-sonnet-5");
      expect(anthropicSpy.sessions[0]?.runTurn).toHaveBeenCalledTimes(1);
    });

    it.each<readonly [string, number | null, JarvisBrain]>([
      ["a capped turn fails closed to scripted", 1, "scripted"],
      ["a no-limit turn runs regardless", null, OWN_HAIKU],
    ])(
      "a spend store that cannot be read (D15): %s",
      async (_name, capUsd, ranOn) => {
        answerFetchWith(200);
        const store: SpendStore = {
          kind: "in-memory",
          read: () => {
            return Promise.resolve("unavailable");
          },
          record: () => {
            return Promise.resolve("unavailable");
          },
        };
        const services = createBudgetServices({}, store);
        const { messages$, sent, anthropicSpy } = ownKeyHarness({ services });

        messages$.next(keyFrame(OWN_KEY, capUsd));
        await settleBudgetReads();
        messages$.next(chatFrame(OWN_HAIKU));
        await settleBudgetReads();

        expectBrainFirst(sent, ranOn);
        expect(anthropicSpy.createSession).not.toHaveBeenCalled();
      },
    );

    it("an own-key turn books to the own row, not the house budget or the usage meter", async () => {
      answerFetchWith(200);
      const store = createInMemorySpendStore();
      const record = vi.spyOn(store, "record");
      const services = createBudgetServices({}, store);
      const meterFor = vi.spyOn(services.jarvisBudget, "meterFor");
      const { messages$, sent, recordTurn, recordTokens } = ownKeyHarness({
        services,
        runOwnTurn: (options?: JarvisTurnOptions): Observable<JarvisEvent> => {
          options?.meter?.record(OWN_SONNET, createUsageFixture(50_000));
          return of<JarvisEvent>({ type: "done" });
        },
      });

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_SONNET));
      await settleBudgetReads();

      expect(record).toHaveBeenCalledExactlyOnceWith(
        "account:acc-ann",
        TODAY,
        "own",
        expect.any(Number),
      );
      expect(services.jarvisBudget.houseToday().spentUsd).toBe(0);
      expect(meterFor).not.toHaveBeenCalled();
      expect(recordTurn).not.toHaveBeenCalled();
      expect(recordTokens).not.toHaveBeenCalled();
      expect(lastAvailability(sent).ownBudget?.spentUsd).toBeGreaterThan(0);
      expect(lastAvailability(sent).budget?.spentUsd).toBe(0);
    });

    it("an own turn's meter stops at the cap the person set", async () => {
      answerFetchWith(200);
      const services = createBudgetServices();
      const ownMeterFor = vi.spyOn(services.jarvisBudget, "ownMeterFor");
      const { messages$ } = ownKeyHarness({ services });

      messages$.next(keyFrame(OWN_KEY, 2.5));
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_SONNET));
      await settleBudgetReads();

      expect(ownMeterFor).toHaveBeenCalledExactlyOnceWith(MEMBER, 2.5);
    });

    it("a narrator turn on an own brain runs on it and counts against the cap; on a house brain it stays scripted", async () => {
      answerFetchWith(200);
      const store = createInMemorySpendStore();
      const record = vi.spyOn(store, "record");
      const services = createBudgetServices({}, store);
      const { messages$, sent, ownSpy, scriptedSpy, anthropicSpy } =
        ownKeyHarness({
          services,
          runOwnTurn: (
            options?: JarvisTurnOptions,
          ): Observable<JarvisEvent> => {
            options?.meter?.record(OWN_SONNET, createUsageFixture(50_000));
            return of<JarvisEvent>({ type: "done" });
          },
        });

      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_SONNET, "narrator"));
      await settleBudgetReads();

      expectBrainFirst(sent, OWN_SONNET);
      expect(ownSpy.sessions[0]?.runTurn).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(
        "account:acc-ann",
        TODAY,
        "own",
        expect.any(Number),
      );

      sent.length = 0;
      messages$.next(chatFrame("claude-sonnet-5", "narrator"));
      await settleBudgetReads();

      expectBrainFirst(sent, "scripted");
      expect(scriptedSpy.sessions[0]?.runTurn).toHaveBeenCalledTimes(1);
      expect(anthropicSpy.createSession).not.toHaveBeenCalled();
    });

    it("a narrator turn on an own brain with its cap spent runs scripted", async () => {
      answerFetchWith(200);
      const store = createInMemorySpendStore();
      await store.record("account:acc-ann", TODAY, "own", 1);
      const { messages$, sent, buildOwnKeyLoop } = ownKeyHarness({
        services: createBudgetServices({}, store),
      });

      messages$.next(keyFrame(OWN_KEY, 1));
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_SONNET, "narrator"));
      await settleBudgetReads();

      expectBrainFirst(sent, "scripted");
      expect(buildOwnKeyLoop).not.toHaveBeenCalled();
    });

    it("with no house key, Jarvis is available and an own key works", async () => {
      answerFetchWith(200);
      const services = createBudgetServices();
      const { messages$, sent, ownSpy } = ownKeyHarness({
        services,
        loops: createJarvisLoops({}, services),
      });

      messages$.next(SUBSCRIBE_FRAME);
      await settleBudgetReads();

      expect(lastAvailability(sent).available).toBe(true);
      expect(lastAvailability(sent).brains).toEqual(["scripted"]);

      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(lastAvailability(sent).brains).toEqual([
        "scripted",
        OWN_HAIKU,
        OWN_SONNET,
        OWN_OPUS,
      ]);

      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expect(ownSpy.sessions[0]?.runTurn).toHaveBeenCalledTimes(1);
    });
  });

  describe("the own session's life", () => {
    it("clearing the key cancels a running own turn and disposes its session", async () => {
      answerFetchWith(200);
      const turn = new Subject<JarvisEvent>();
      const { messages$, sent, ownSpy } = ownKeyHarness({
        runOwnTurn: (): Observable<JarvisEvent> => {
          return turn;
        },
      });

      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      const session = ownSpy.sessions[0];

      expect(session?.dispose).not.toHaveBeenCalled();

      messages$.next(CLEAR_KEY_FRAME);

      expect(session?.cancelTurn).toHaveBeenCalledTimes(1);
      expect(session?.dispose).toHaveBeenCalledTimes(1);
      expect(session?.cancelTurn.mock.invocationCallOrder[0]).toBeLessThan(
        session?.dispose.mock.invocationCallOrder[0] ?? 0,
      );

      turn.complete();
      await settleBudgetReads();
      sent.length = 0;
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expectBrainFirst(sent, "scripted");
      expect(ownSpy.sessions).toHaveLength(1);
    });

    it("a different key retires the session; the next own turn gets a new one on the new key", async () => {
      answerFetchWith(200);
      const { messages$, ownSpy, buildOwnKeyLoop } = ownKeyHarness();

      messages$.next(keyFrame("sk-old"));
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();
      messages$.next(keyFrame("sk-new"));
      await settleBudgetReads();

      expect(ownSpy.sessions[0]?.dispose).toHaveBeenCalledTimes(1);

      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expect(ownSpy.sessions).toHaveLength(2);
      expect(buildOwnKeyLoop).toHaveBeenLastCalledWith("anthropic", "sk-new");
    });

    it("a new cap on the same key keeps the session and its running turn", async () => {
      answerFetchWith(200);
      const { messages$, ownSpy } = ownKeyHarness();

      messages$.next(keyFrame(OWN_KEY, 1));
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();
      messages$.next(keyFrame(OWN_KEY, 5));
      await settleBudgetReads();

      expect(ownSpy.sessions[0]?.dispose).not.toHaveBeenCalled();
      expect(ownSpy.sessions[0]?.cancelTurn).not.toHaveBeenCalled();
    });

    it("the socket closing stops a check in flight", async () => {
      const fetches = holdFetch();
      const { messages$, closed$ } = ownKeyHarness();

      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(fetches.signals[0]?.aborted).toBe(false);

      closed$.next();

      expect(fetches.signals[0]?.aborted).toBe(true);
    });

    it("the socket closing disposes the own session of a key still current", async () => {
      answerFetchWith(200);
      const { messages$, closed$, ownSpy } = ownKeyHarness();

      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      closed$.next();

      expect(ownSpy.sessions[0]?.cancelTurn).toHaveBeenCalledTimes(1);
      expect(ownSpy.sessions[0]?.dispose).toHaveBeenCalledTimes(1);
    });

    it("jarvis.confirm and jarvis.cancel reach the own session", async () => {
      answerFetchWith(200);
      const turn = new Subject<JarvisEvent>();
      const { messages$, ownSpy } = ownKeyHarness({
        runOwnTurn: (): Observable<JarvisEvent> => {
          return turn;
        },
      });

      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();
      messages$.next({
        type: CLIENT_MSG.JARVIS_CONFIRM,
        payload: {
          confirmationId: "confirm-own",
          approved: true,
        } satisfies JarvisConfirmPayload,
      });
      messages$.next({
        type: CLIENT_MSG.JARVIS_CANCEL,
        payload: { turnId: STUB_TURN_ID } satisfies JarvisCancelPayload,
      });

      expect(ownSpy.sessions[0]?.resolveConfirmation).toHaveBeenCalledWith(
        "confirm-own",
        true,
      );
      expect(ownSpy.sessions[0]?.cancelTurn).toHaveBeenCalledTimes(1);
    });
  });

  describe("the jarvis.key frame", () => {
    it.each<readonly [string, unknown]>([
      ["not an object", OWN_KEY],
      ["no action", { provider: "anthropic", key: OWN_KEY, capUsd: 1 }],
      ["an unknown action", setKeyPayload({ action: "replace" })],
      ["a provider outside the set", setKeyPayload({ provider: "evil" })],
      ["a provider not offered yet", setKeyPayload({ provider: "openai" })],
      ["a key that is no string", setKeyPayload({ key: [OWN_KEY] })],
      [
        "a key over the limit",
        setKeyPayload({ key: OWN_KEY.padEnd(JARVIS_KEY_MAX_CHARS + 1, "x") }),
      ],
      ["a missing cap", setKeyPayload({ capUsd: undefined })],
      ["a cap that is no number", setKeyPayload({ capUsd: "1" })],
      ["a NaN cap", setKeyPayload({ capUsd: Number.NaN })],
      ["an infinite cap", setKeyPayload({ capUsd: Number.POSITIVE_INFINITY })],
      ["a zero cap", setKeyPayload({ capUsd: 0 })],
      ["a negative cap", setKeyPayload({ capUsd: -1 })],
      [
        "a cap over the limit",
        setKeyPayload({ capUsd: JARVIS_OWN_CAP_MAX_USD + 0.01 }),
      ],
    ])(
      "a malformed or refused key frame's log lines do not contain the key: %s",
      async (_name, payload) => {
        const fetchFn = answerFetchWith(200);
        const logged = captureConsole();
        const { messages$, sent } = ownKeyHarness();

        messages$.next(SUBSCRIBE_FRAME);
        await settleBudgetReads();
        messages$.next({ type: CLIENT_MSG.JARVIS_KEY, payload });
        await settleBudgetReads();

        expect(fetchFn).not.toHaveBeenCalled();
        expect(lastAvailability(sent)).not.toHaveProperty("ownKey");
        expect(logged()).toContain("type=jarvis.key");
        expect(logged()).toContain("payload omitted");
        expect(logged()).not.toContain(OWN_KEY);
      },
    );

    it("a malformed or refused key frame's log lines do not contain the key: refused by the provider", async () => {
      const fetchFn = answerFetchWith(401);
      const logged = captureConsole();
      const { messages$, sent } = ownKeyHarness();

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(logged()).not.toContain(OWN_KEY);
      expect(JSON.stringify(sent)).not.toContain(OWN_KEY);
    });

    it("takes the largest key and the largest cap, and no limit", async () => {
      answerFetchWith(200);
      const { messages$, sent } = ownKeyHarness();
      const longestKey = "k".repeat(JARVIS_KEY_MAX_CHARS);

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame(longestKey, JARVIS_OWN_CAP_MAX_USD));
      await settleBudgetReads();

      expect(lastAvailability(sent).ownKey).toEqual({
        provider: "anthropic",
        status: "accepted",
        capUsd: JARVIS_OWN_CAP_MAX_USD,
      });

      messages$.next(keyFrame(longestKey, null));
      await settleBudgetReads();

      expect(lastAvailability(sent).ownKey?.capUsd).toBeNull();
    });

    it("a connection with no caller ignores the frame", async () => {
      const fetchFn = answerFetchWith(200);
      const logged = captureConsole();
      const { messages$, sent } = ownKeyHarness({ caller: null });

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(fetchFn).not.toHaveBeenCalled();
      expect(lastAvailability(sent)).not.toHaveProperty("ownKey");
      expect(logged()).toBe("");
    });

    it("the same key sent again after an unreachable check is checked again", async () => {
      const fetchFn = answerFetchWith(500);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { messages$, sent } = ownKeyHarness();

      messages$.next(SUBSCRIBE_FRAME);
      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(lastAvailability(sent).ownKey?.status).toBe("unreachable");

      fetchFn.mockImplementation(() => {
        return Promise.resolve(new Response(null, { status: 200 }));
      });
      messages$.next(keyFrame());
      await settleBudgetReads();

      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(lastAvailability(sent).ownKey?.status).toBe("accepted");
    });

    it.each<readonly [string, Caller, string]>([
      ["an account", MEMBER, "account:acc-ann"],
      ["the roster persona", OPERATOR, "roster:demo"],
    ])(
      "charges the check to the stable id of %s, across sockets",
      async (_name, caller, identity) => {
        answerFetchWith(200);
        const services = createBudgetServices();
        const allow = vi.spyOn(services.ownKeyChecks, "allow");
        const first = ownKeyHarness({ services, caller });
        const second = ownKeyHarness({ services, caller });

        first.messages$.next(keyFrame("sk-one"));
        second.messages$.next(keyFrame("sk-two"));
        await settleBudgetReads();

        expect(allow.mock.calls).toEqual([[identity], [identity]]);
      },
    );
  });

  describe("provider errors", () => {
    it("a provider error's message is never logged or sent to the client", async () => {
      answerFetchWith(200);
      const logged = captureConsole();
      const { messages$, sent } = ownKeyHarness({
        ownLoop: anthropicLoopOver((): never => {
          throw providerError(500, `upstream said ${SECRET_MARKER}`);
        }),
      });

      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expect(errorMessagesOf(sent)).toHaveLength(1);
      expect(JSON.stringify(sent)).not.toContain(SECRET_MARKER);
      expect(logged()).toContain("status 500");
      expect(logged()).not.toContain(SECRET_MARKER);
      expect(logged()).not.toContain(OWN_KEY);
    });

    it("a loop that throws while it is built logs no message either", async () => {
      answerFetchWith(200);
      const logged = captureConsole();
      const { messages$, sent } = ownKeyHarness({
        buildOwnKeyLoop: (): AgentLoop => {
          throw new Error(`bad key ${SECRET_MARKER}`);
        },
      });

      messages$.next(keyFrame());
      await settleBudgetReads();
      messages$.next(chatFrame(OWN_HAIKU));
      await settleBudgetReads();

      expect(logged()).not.toBe("");
      expect(logged()).not.toContain(SECRET_MARKER);
      expect(JSON.stringify(sent)).not.toContain(SECRET_MARKER);
    });
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

/** Shape of a `jarvis.error` payload. */
interface ErrorPayload {
  readonly message: string;
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

function brainFramesOf(sent: readonly Outbound[]): Outbound[] {
  return sent.filter((frame) => {
    return frame.type === SERVER_MSG.JARVIS_BRAIN;
  });
}

function chatFrame(brain: JarvisBrain, origin?: "narrator"): Inbound {
  return {
    type: CLIENT_MSG.JARVIS_CHAT,
    payload: {
      text: "hi",
      turnId: STUB_TURN_ID,
      brain,
      origin,
    } satisfies JarvisChatPayload,
  };
}

function expectBrainFirst(sent: readonly Outbound[], brain: JarvisBrain): void {
  expect(sent[0]).toEqual({
    type: SERVER_MSG.JARVIS_BRAIN,
    payload: { brain, turnId: STUB_TURN_ID },
  });
  expect(brainFramesOf(sent)).toHaveLength(1);
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

function createHarness(): Harness {
  // `{}` explicit — see the note on the anthropic-loop availability test
  // above; every scenario built from this createHarness assumes an ungated
  // ("none") gate regardless of the ambient process env.
  const services = createServices({});
  const loops = createJarvisLoops({ RTC_JARVIS_FAKE: "1" }, services);

  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(
    combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop)),
    services,
  )(socket);
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
function createTwoSocketHarness(): TwoSocketHarness {
  const services = createServices({});
  const loops = createJarvisLoops({ RTC_JARVIS_FAKE: "1" }, services);

  const listen = createWsListener(
    combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop)),
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
 * supplies just `usageMeter.recordTurn` (a no-op spy) and no caller, so no
 * budget is read and every turn runs at once. */
function createStubHarness(loop: AgentLoop): StubHarness {
  const loops: JarvisLoops = {
    scripted: loop,
    anthropic: null,
    brains: ["scripted"],
    defaultBrain: "scripted",
  };

  const ctx = {
    usageMeter: { recordTurn: vi.fn() },
    caller: null,
  } as unknown as Ctx;
  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(
    combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop)),
    ctx,
  )(socket);
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
  runTurnImpl: (
    options?: JarvisTurnOptions,
  ) => Observable<JarvisEvent> = (): Observable<JarvisEvent> => {
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
        options?: JarvisTurnOptions,
      ): Observable<JarvisEvent> => {
        return runTurnImpl(options);
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

/** Wires `jarvisEffects` to a caller-supplied `JarvisLoops` on a connection
 * scoped to the roster persona (an operator: every brain offered, no personal
 * limit), with an injectable `recordTurn` spy standing in for
 * `ctx.usageMeter.recordTurn`. The budget is the real default one over an
 * in-memory store, so a turn is routed only after its budget read settles. */
function wireDualLoops(
  loops: JarvisLoops,
  recordTurn: ReturnType<typeof vi.fn> = vi.fn(),
): DualLoopsHarness {
  const ctx: Ctx = {
    ...scopeServicesToConnection(createBudgetServices(), OPERATOR),
    usageMeter: {
      recordTurn,
      recordTokens: vi.fn(),
    } as unknown as Ctx["usageMeter"],
  };
  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(
    combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop)),
    ctx,
  )(socket);
  return { messages$: socket.messages$, closed$: socket.closed$, sent };
}

interface DualSpyHarness extends DualLoopsHarness {
  readonly loops: JarvisLoops;
  readonly scriptedSpy: SpyLoop;
  readonly anthropicSpy: SpyLoop;
}

/** The common case for the dual-brain routing tests: a full `JarvisLoops`
 * (all four `JARVIS_BRAINS`, `DEFAULT_JARVIS_BRAIN`) built from two fresh
 * `createSpyLoop()`s, wired via `wireDualLoops`. */
function dualLoopsHarness(
  recordTurn: ReturnType<typeof vi.fn> = vi.fn(),
): DualSpyHarness {
  const scriptedSpy = createSpyLoop();
  const anthropicSpy = createSpyLoop();
  const loops: JarvisLoops = {
    scripted: scriptedSpy.loop,
    anthropic: anthropicSpy.loop,
    brains: JARVIS_BRAINS,
    defaultBrain: DEFAULT_JARVIS_BRAIN,
  };

  const { messages$, closed$, sent } = wireDualLoops(loops, recordTurn);
  return { loops, scriptedSpy, anthropicSpy, messages$, closed$, sent };
}

/** A container over a real `JarvisBudgetService` — the default one
 * `createServices` builds — on the given store, with every `RTC_JARVIS_*`
 * setting at its default unless `env` says otherwise. Build it after the
 * test has pinned the clock: the service arms its midnight timer at once. */
function createBudgetServices(
  env: NodeJS.ProcessEnv = {},
  spendStore: SpendStore = createInMemorySpendStore(),
): ServiceContainer {
  return createServices(env, { spendStore });
}

/** One socket on a connection scoped to `caller` (null: the unscoped shared
 * container), served by a full dual-loop set of spy loops. */
function wireSpySocket(
  services: ServiceContainer,
  caller: Caller | null,
): DualSpyHarness {
  const scriptedSpy = createSpyLoop();
  const anthropicSpy = createSpyLoop();
  const loops: JarvisLoops = {
    scripted: scriptedSpy.loop,
    anthropic: anthropicSpy.loop,
    brains: JARVIS_BRAINS,
    defaultBrain: DEFAULT_JARVIS_BRAIN,
  };

  const ctx =
    caller === null ? services : scopeServicesToConnection(services, caller);
  const sent: Outbound[] = [];
  const socket = createSocket(sent);
  createWsListener(
    combineEffects(...jarvisEffects(loops, refuseOwnKeyLoop)),
    ctx,
  )(socket);
  return {
    loops,
    scriptedSpy,
    anthropicSpy,
    messages$: socket.messages$,
    closed$: socket.closed$,
    sent,
  };
}

/** The gate level on an availability frame; undefined when ungated. */
function gateLevelOf(frame: Outbound | undefined): string | undefined {
  if (frame === undefined) {
    throw new Error("expected a jarvis.availability frame");
  }

  return (frame.payload as JarvisAvailabilityPayload).gate?.level;
}

/** Lets every pending budget read (tier lookup, store read) settle and the
 * turn or frame that waits on it go out. The in-memory store answers in
 * microtasks; advancing the fake clock by zero drains them. */
async function settleBudgetReads(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

/** The worst case one Sonnet request is reserved at: $0.07096. */
const SONNET_CEILING: JarvisTokenUsage = {
  inputTokens: 15_000,
  outputTokens: 4_096,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

/** Input-only usage: Haiku bills $1/Mtok input, so N tokens cost N/1e6 USD. */
function createUsageFixture(inputTokens: number): JarvisTokenUsage {
  return {
    inputTokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
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

const QUOTE_REPLY =
  "EURUSD is trading at 1.0921, up 0 pips since the start of the session. " +
  "Spread 1 pips; short-term momentum is positive. Anything else, sir?";

const DECLINED_REPLY = "Understood, sir — standing down. Nothing was executed.";

const FILL_REPLY =
  "Very good, sir. Bought 5,000,000 EUR at 1.0922 — the trade is on your blotter.";

const NOON = Date.UTC(2026, 9, 25, 12);

const TODAY = "2026-10-25";

const NEXT_MIDNIGHT = Date.UTC(2026, 9, 26);

const DAY_MS = 86_400_000;

/** An approved account with role `user`: the default tier lookup reads any
 * account as a member. */
const MEMBER: Caller = {
  username: "ann",
  accountId: "acc-ann",
  issuedAt: null,
};

const OTHER_MEMBER: Caller = {
  username: "bob",
  accountId: "acc-bob",
  issuedAt: null,
};

/** The roster persona: no account, an operator. */
const OPERATOR: Caller = { username: "demo", accountId: null, issuedAt: null };

/** For a test whose key frames never reach an own turn. */
function refuseOwnKeyLoop(): AgentLoop {
  throw new Error("this test runs no own-key turn");
}

const OWN_KEY = "sk-ant-own-key-a1b2c3d4";

const OWN_HAIKU: JarvisOwnBrain = "own:anthropic:claude-haiku-4-5";

const OWN_SONNET: JarvisOwnBrain = "own:anthropic:claude-sonnet-5";

const OWN_OPUS: JarvisOwnBrain = "own:anthropic:claude-opus-5";

/** The right shape, but off the curated list. */
const RETIRED_OWN_BRAIN: JarvisOwnBrain = "own:anthropic:claude-retired-1";

/** A provider the accepted test key is not for. */
const OPENAI_OWN_BRAIN: JarvisOwnBrain = "own:openai:gpt-test";

/** Stands for whatever a provider's error text may quote. */
const SECRET_MARKER = "MARKER-must-stay-out";

const SUBSCRIBE_FRAME: Inbound = {
  type: CLIENT_MSG.JARVIS_SUBSCRIBE,
  payload: {},
};

const CLEAR_KEY_FRAME: Inbound = {
  type: CLIENT_MSG.JARVIS_KEY,
  payload: { action: "clear" } satisfies JarvisKeyPayload,
};

function keyFrame(key: string = OWN_KEY, capUsd: number | null = 1): Inbound {
  return {
    type: CLIENT_MSG.JARVIS_KEY,
    payload: {
      action: "set",
      provider: "anthropic",
      key,
      capUsd,
    } satisfies JarvisKeyPayload,
  };
}

/** A well-formed key frame's payload with the given fields replaced. */
function setKeyPayload(
  overrides: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    action: "set",
    provider: "anthropic",
    key: OWN_KEY,
    capUsd: 1,
    ...overrides,
  };
}

/** Every provider check answers `status`. */
function answerFetchWith(status: number): Mock<typeof fetch> {
  const fetchFn = vi.fn<typeof fetch>(() => {
    return Promise.resolve(new Response(null, { status }));
  });

  vi.stubGlobal("fetch", fetchFn);

  return fetchFn;
}

interface HeldFetches {
  /** Answers the `index`-th check made. */
  answer(index: number, status: number): void;
  /** The abort signal each check was given, in call order. */
  readonly signals: AbortSignal[];
}

/** Every provider check stays open until the test answers it. */
function holdFetch(): HeldFetches {
  const answers: ((status: number) => void)[] = [];
  const signals: AbortSignal[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((_url, init) => {
      if (init?.signal) {
        signals.push(init.signal);
      }

      return new Promise<Response>((resolve) => {
        answers.push((status: number): void => {
          resolve(new Response(null, { status }));
        });
      });
    }),
  );

  return {
    answer: (index: number, status: number): void => {
      answers[index]?.(status);
    },
    signals,
  };
}

function availabilityFramesOf(
  sent: readonly Outbound[],
): JarvisAvailabilityPayload[] {
  return sent
    .filter((frame) => {
      return frame.type === SERVER_MSG.JARVIS_AVAILABILITY;
    })
    .map((frame) => {
      return frame.payload as JarvisAvailabilityPayload;
    });
}

function lastAvailability(
  sent: readonly Outbound[],
): JarvisAvailabilityPayload {
  const frame = availabilityFramesOf(sent).at(-1);

  if (frame === undefined) {
    throw new Error("expected a jarvis.availability frame");
  }

  return frame;
}

function errorMessagesOf(sent: readonly Outbound[]): string[] {
  return sent
    .filter((frame) => {
      return frame.type === SERVER_MSG.JARVIS_ERROR;
    })
    .map((frame) => {
      return (frame.payload as ErrorPayload).message;
    });
}

/** Mutes the console and returns a reader of everything written to it,
 * errors in full: message, stack and properties. */
function captureConsole(): () => string {
  const spies = [
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "debug").mockImplementation(() => {}),
  ];

  return (): string => {
    return spies
      .flatMap((spy) => {
        return spy.mock.calls.flat();
      })
      .map((argument: unknown) => {
        return typeof argument === "string" ? argument : inspect(argument);
      })
      .join("\n");
  };
}

/** What the Anthropic SDK throws for an HTTP failure. */
function providerError(status: number, message: string): Error {
  class APIError extends Error {
    readonly status = status;
  }

  return new APIError(message);
}

/** A real own-key loop whose runner is the test's. */
function anthropicLoopOver(runner: () => never): AgentLoop {
  return new AnthropicAgentLoop({
    apiKey: OWN_KEY,
    knownSymbols: [],
    buildTools: () => {
      return [];
    },
    runnerFactory: runner,
  });
}

interface OwnKeyHarnessOptions {
  /** Null: the unscoped shared container. A member by default. */
  readonly caller?: Caller | null;
  readonly services?: ServiceContainer;
  readonly loops?: JarvisLoops;
  /** What every own session's turn does; `done` at once by default. */
  readonly runOwnTurn?: (
    options?: JarvisTurnOptions,
  ) => Observable<JarvisEvent>;
  /** The loop the builder returns; the own spy loop by default. */
  readonly ownLoop?: AgentLoop;
  readonly buildOwnKeyLoop?: OwnKeyLoopBuilder;
}

interface OwnKeyHarness extends DualSpyHarness {
  readonly ownSpy: SpyLoop;
  readonly buildOwnKeyLoop: Mock<OwnKeyLoopBuilder>;
  readonly recordTurn: ReturnType<typeof vi.fn>;
  readonly recordTokens: ReturnType<typeof vi.fn>;
}

/** One socket with spy house loops, a spy own-key loop, and a usage meter
 * that only records. The key checks go through the real `verifyOwnKey`, so a
 * test answers them by stubbing `fetch`. */
function ownKeyHarness(options: OwnKeyHarnessOptions = {}): OwnKeyHarness {
  const services = options.services ?? createBudgetServices();
  const scriptedSpy = createSpyLoop();
  const anthropicSpy = createSpyLoop();
  const ownSpy = createSpyLoop(options.runOwnTurn);
  const loops: JarvisLoops = options.loops ?? {
    scripted: scriptedSpy.loop,
    anthropic: anthropicSpy.loop,
    brains: JARVIS_BRAINS,
    defaultBrain: DEFAULT_JARVIS_BRAIN,
  };

  const buildOwnKeyLoop = vi.fn<OwnKeyLoopBuilder>(
    options.buildOwnKeyLoop ??
      ((): AgentLoop => {
        return options.ownLoop ?? ownSpy.loop;
      }),
  );
  const recordTurn = vi.fn();
  const recordTokens = vi.fn();
  const caller = options.caller === undefined ? MEMBER : options.caller;
  const scoped =
    caller === null ? services : scopeServicesToConnection(services, caller);

  const ctx: Ctx = {
    ...scoped,
    usageMeter: {
      recordTurn,
      recordTokens,
    } as unknown as Ctx["usageMeter"],
  };
  const sent: Outbound[] = [];
  const socket = createSocket(sent);

  createWsListener(
    combineEffects(...jarvisEffects(loops, buildOwnKeyLoop)),
    ctx,
  )(socket);

  return {
    loops,
    scriptedSpy,
    anthropicSpy,
    ownSpy,
    buildOwnKeyLoop,
    recordTurn,
    recordTokens,
    messages$: socket.messages$,
    closed$: socket.closed$,
    sent,
  };
}
