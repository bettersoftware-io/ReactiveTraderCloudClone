import { of, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Direction } from "@rtc/domain";
import type {
  JarvisChatPayload,
  JarvisConfirmPayload,
  JarvisEvent,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
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

/** One case per `JarvisEvent` variant, proving `WIRE_TYPE_BY_EVENT` end to
 * end: mutating any one entry (e.g. error -> JARVIS_DONE) fails exactly its
 * row here, even though the full-engine tests above never happen to reach
 * every variant (nothing in the scripted brain currently emits `error`). */
const WIRE_MAPPING_CASES: readonly WireMappingCase[] = [
  {
    event: { type: "delta", text: "hi" },
    wireType: SERVER_MSG.JARVIS_DELTA,
    body: { text: "hi" },
  },
  {
    event: { type: "toolEvent", tool: "quote", status: "running" },
    wireType: SERVER_MSG.JARVIS_TOOL_EVENT,
    body: { tool: "quote", status: "running" },
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
    },
  },
  {
    event: { type: "done" },
    wireType: SERVER_MSG.JARVIS_DONE,
    body: {},
  },
  {
    event: { type: "error", message: "boom" },
    wireType: SERVER_MSG.JARVIS_ERROR,
    body: { message: "boom" },
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

describe("jarvis effects", () => {
  it("streams a quote turn's tool badge + paced deltas + done, deltas reassembling the reply", async () => {
    const { messages$, sent } = harness();

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "where is EURUSD?" } satisfies JarvisChatPayload,
    });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sent[0]).toEqual({
      type: SERVER_MSG.JARVIS_TOOL_EVENT,
      payload: { tool: "quote", status: "running" },
    });
    expect(sent[1]).toEqual({
      type: SERVER_MSG.JARVIS_TOOL_EVENT,
      payload: { tool: "quote", status: "done" },
    });
    expect(sent.at(-1)).toEqual({
      type: SERVER_MSG.JARVIS_DONE,
      payload: {},
    });

    const deltas = sent.slice(2, -1);
    expect(deltas.length).toBeGreaterThan(1);
    expect(
      deltas.every((m) => {
        return m.type === SERVER_MSG.JARVIS_DELTA;
      }),
    ).toBe(true);
    expect(reassembleDeltas(sent)).toBe(QUOTE_REPLY);
  });

  it("a trade turn's confirmRequest carries the confirm-card fields with no type field; approving executes, streams the fill reply, and grows the blotter", async () => {
    const { services, messages$, sent } = harness();

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "buy 5M EURUSD" } satisfies JarvisChatPayload,
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
      payload: {},
    });
    expect(tradeCounts.at(-1)).toBe(seededCount + 1);
  });

  it("declining a confirmRequest streams the declined copy and executes nothing", async () => {
    const { services, messages$, sent } = harness();

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "buy 5M EURUSD" } satisfies JarvisChatPayload,
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
      payload: {},
    });
    expect(tradeCounts.at(-1)).toBe(seededCount);
  });

  it("tearing down the outbound stream mid-confirmation makes a late resolveConfirmation a no-op", async () => {
    const { services, loop, messages$, closed$, sent } = harness();

    const tradeCounts: number[] = [];
    services.blotter.getTradeStream().subscribe((trades) => {
      tradeCounts.push(trades.length);
    });
    const seededCount = tradeCounts[0] ?? 0;

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "buy 5M EURUSD" } satisfies JarvisChatPayload,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const { confirmationId } = findConfirmRequest(sent)
      .payload as ConfirmationCarrier;

    // Simulate the socket disconnecting: createWsListener's takeUntil(closed$)
    // unsubscribes the whole outbound stream, including the still-open chat
    // turn's inner subscription — the engine's teardown path completes the
    // pending confirmation Subject with no value, per turnConfirmationIds.
    closed$.next();

    loop.resolveConfirmation(confirmationId, true);
    await vi.advanceTimersByTimeAsync(2_500);

    expect(tradeCounts.at(-1)).toBe(seededCount);
  });
});

describe("jarvis effects — wire-type mapping (stub loop, no simulators)", () => {
  it.each(
    WIRE_MAPPING_CASES,
  )("maps a stubbed $event.type event to its wire type, minus the type field", ({
    event,
    wireType,
    body,
  }) => {
    const loop: AgentLoop = {
      runTurn: () => {
        return of(event);
      },
      resolveConfirmation: vi.fn(),
    };
    const { messages$, sent } = stubHarness(loop);

    messages$.next({
      type: CLIENT_MSG.JARVIS_CHAT,
      payload: { text: "irrelevant" } satisfies JarvisChatPayload,
    });

    expect(sent).toEqual([{ type: wireType, payload: body }]);
  });
});

interface WireMappingCase {
  readonly event: JarvisEvent;
  readonly wireType: string;
  readonly body: Record<string, unknown>;
}

interface Harness {
  readonly services: ServiceContainer;
  readonly loop: AgentLoop;
  readonly messages$: Subject<Inbound>;
  readonly closed$: Subject<void>;
  readonly sent: Outbound[];
}

/** Shape shared by every `jarvis.confirm`-eligible payload read back in
 * these tests — just the `confirmationId` field. */
interface ConfirmationCarrier {
  readonly confirmationId: string;
}

/** Shape of a `jarvis.delta` payload. */
interface DeltaPayload {
  readonly text: string;
}

function harness(): Harness {
  const services = createServices();
  const loop = createAgentLoop({ RTC_JARVIS_FAKE: "1" }, services);

  if (!loop) {
    throw new Error("expected a non-null AgentLoop");
  }

  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = {
    messages$,
    closed$,
    send: (m: Outbound) => {
      sent.push(m);
    },
  };
  createWsListener(combineEffects(...jarvisEffects(loop)), {} as Ctx)(socket);
  return { services, loop, messages$, closed$, sent };
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
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = {
    messages$,
    closed$,
    send: (m: Outbound) => {
      sent.push(m);
    },
  };
  createWsListener(combineEffects(...jarvisEffects(loop)), {} as Ctx)(socket);
  return { messages$, sent };
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
