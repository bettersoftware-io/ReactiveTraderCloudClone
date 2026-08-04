import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it, vi } from "vitest";

import type { ConfirmGate, JarvisToolDefinition } from "@rtc/agent-tools";
import { DEFAULT_JARVIS_BRAIN, Direction } from "@rtc/domain";
import type { JarvisEvent, JarvisHistoryEntry, PanelSpecV1 } from "@rtc/shared";

import { AnthropicAgentLoop } from "./AnthropicAgentLoop.js";
import type {
  AnthropicFinalMessage,
  AnthropicMessageStream,
  AnthropicRunner,
  AnthropicRunnerFactory,
} from "./AnthropicAgentSession.js";
import type { AgentSession, JarvisTurnOptions } from "./agentLoop.js";
import {
  JARVIS_HISTORY_MAX_MESSAGES,
  JARVIS_MAX_TURNS_PER_SESSION,
} from "./jarvisRunnerConfig.js";
import { RENDER_PANEL_TOOL_NAME } from "./renderPanelTool.js";

const REFUSAL_MESSAGE = "I'm afraid I can't assist with that, sir.";
const DESK_LINK_FALTERED_MESSAGE =
  "The desk link faltered, sir — do try again.";

const SESSION_CAP_MESSAGE =
  "We've had quite the session, sir — do reconnect for a fresh one.";
const CANCELLED_MESSAGE = "Cancelled, sir.";

describe("AnthropicAgentLoop", () => {
  it("(a) text-only turn reassembles deltas, completes, and grows session history by one user + one assistant message", async () => {
    const first = fakeStream(
      [textDeltaEvent(0, "Good "), textDeltaEvent(0, "morning, sir.")],
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Good morning, sir." }],
      },
    );

    const second = fakeStream([textDeltaEvent(0, "Indeed.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Indeed." }],
    });
    let callIndex = 0;
    const calls: RunnerCall[] = [];

    function factory(
      params: FactoryParams,
      options: FactoryOptions,
    ): AnthropicRunner {
      calls.push({ params, options });
      const stream = callIndex === 0 ? first : second;
      callIndex += 1;

      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield stream;
        },
        pushMessages: (): void => {},
      };
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events1 = await runTurnCollecting(session, "good morning");
    expect(events1).toEqual([
      { type: "delta", text: "Good " },
      { type: "delta", text: "morning, sir." },
      { type: "done" },
    ]);

    await runTurnCollecting(session, "thanks");

    expect(calls).toHaveLength(2);
    // Turn 2's request replays turn 1's user + assistant messages, then adds
    // turn 2's own user message — proof session history grew by exactly two
    // entries after the first completed turn.
    expect(calls[1]?.params.messages).toEqual([
      { role: "user", content: "good morning" },
      { role: "assistant", content: "Good morning, sir." },
      { role: "user", content: "thanks" },
    ]);
  });

  it("(b) a tool-use turn brackets toolEvent running/done around the call and invokes the real tool with the model's input", async () => {
    const toolRun = vi.fn(async (input: unknown) => {
      return JSON.stringify({
        symbol: (input as GetPriceInput).symbol,
        mid: "1.10000",
      });
    });

    const toolCallStream = fakeStream(
      [
        toolUseStartEvent(0, "t1", "get_price", { symbol: "EURUSD" }),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "get_price",
            input: { symbol: "EURUSD" },
          },
        ],
      },
    );

    const finalStream = fakeStream(
      [textDeltaEvent(0, "EURUSD is 1.10000, sir.")],
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "EURUSD is 1.10000, sir." }],
      },
    );

    const calls: RunnerCall[] = [];

    function factory(
      params: FactoryParams,
      options: FactoryOptions,
    ): AnthropicRunner {
      calls.push({ params, options });

      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield toolCallStream;

          // Mirrors what the SDK's own tool-runner machinery does between
          // iterations: invoke the matching adapted tool with the model's
          // raw input before continuing.
          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === "get_price";
          });
          await tool?.run({ symbol: "EURUSD" });

          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    function buildFixtureTools(): readonly JarvisToolDefinition[] {
      return [fakeGetPriceTool(toolRun)];
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(buildFixtureTools),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "what's EURUSD?");

    expect(events).toEqual([
      { type: "toolEvent", tool: "quote", status: "running" },
      { type: "toolEvent", tool: "quote", status: "done" },
      { type: "delta", text: "EURUSD is 1.10000, sir." },
      { type: "done" },
    ]);
    expect(toolRun).toHaveBeenCalledExactlyOnceWith({ symbol: "EURUSD" });
    expect(calls).toHaveLength(1);
  });

  it("(c) execute_trade: approval resolves the gate true and reports a fill", async () => {
    const onExecute = vi.fn();
    const tradeStream = fakeStream(
      [
        toolUseStartEvent(0, "t1", "execute_trade", {
          symbol: "EURUSD",
          direction: Direction.Buy,
          notional: 1_000_000,
        }),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "execute_trade",
            input: {
              symbol: "EURUSD",
              direction: Direction.Buy,
              notional: 1_000_000,
            },
          },
        ],
      },
    );

    const finalStream = fakeStream([textDeltaEvent(0, "Done, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Done, sir." }],
    });
    let toolResult = "";

    function factory(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield tradeStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === "execute_trade";
          });
          toolResult =
            (await tool?.run({
              symbol: "EURUSD",
              direction: Direction.Buy,
              notional: 1_000_000,
            })) ?? "";

          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    function buildFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      return [fakeExecuteTradeTool(confirmTrade, onExecute)];
    }

    function approveOnConfirmRequest(event: JarvisEvent): void {
      if (event.type === "confirmRequest") {
        session.resolveConfirmation(event.confirmationId, true);
      }
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(buildFixtureTools),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(
      session,
      "buy 1m EURUSD",
      [],
      approveOnConfirmRequest,
    );

    const confirmRequest = events.find((event) => {
      return event.type === "confirmRequest";
    });
    expect(confirmRequest).toMatchObject({
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
    });
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(JSON.parse(toolResult)).toMatchObject({ status: "Filled" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("(c) execute_trade: decline reaches the model as a plain result and never executes", async () => {
    const onExecute = vi.fn();
    const tradeStream = fakeStream(
      [
        toolUseStartEvent(0, "t1", "execute_trade", {
          symbol: "EURUSD",
          direction: Direction.Sell,
          notional: 500_000,
        }),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "execute_trade",
            input: {
              symbol: "EURUSD",
              direction: Direction.Sell,
              notional: 500_000,
            },
          },
        ],
      },
    );

    const finalStream = fakeStream([textDeltaEvent(0, "Standing down, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Standing down, sir." }],
    });
    let toolResult = "";

    function factory(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield tradeStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === "execute_trade";
          });
          toolResult =
            (await tool?.run({
              symbol: "EURUSD",
              direction: Direction.Sell,
              notional: 500_000,
            })) ?? "";

          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    function buildFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      return [fakeExecuteTradeTool(confirmTrade, onExecute)];
    }

    function declineOnConfirmRequest(event: JarvisEvent): void {
      if (event.type === "confirmRequest") {
        session.resolveConfirmation(event.confirmationId, false);
      }
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(buildFixtureTools),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(
      session,
      "sell 500k EURUSD",
      [],
      declineOnConfirmRequest,
    );

    expect(onExecute).not.toHaveBeenCalled();
    expect(toolResult).toBe(
      "The user declined the trade — nothing was executed.",
    );
  });

  it("(d) a refusal stop_reason surfaces the butler-refusal error and ends the turn", async () => {
    const stream = fakeStream([], { stop_reason: "refusal", content: [] });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "say something awful");

    expect(events).toEqual([{ type: "error", message: REFUSAL_MESSAGE }]);
    expect(calls).toHaveLength(1);
  });

  it("(e) a thrown SDK/network error surfaces a single sanitized error event", async () => {
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: throwingRunner(),
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "hello");

    expect(events).toEqual([
      { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
    ]);
  });

  it("(f) breaching the per-session turn cap short-circuits with no runnerFactory invocation", async () => {
    const stream = fakeStream([textDeltaEvent(0, "hi")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
    });
    let callCount = 0;

    function factory(): AnthropicRunner {
      callCount += 1;

      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield stream;
        },
        pushMessages: (): void => {},
      };
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    for (let i = 0; i < JARVIS_MAX_TURNS_PER_SESSION; i += 1) {
      // Sequential by design — each turn must complete before the next
      // starts, mirroring one chat conversation.

      await runTurnCollecting(session, `turn ${i}`);
    }

    expect(callCount).toBe(JARVIS_MAX_TURNS_PER_SESSION);

    const events = await runTurnCollecting(session, "one too many");

    expect(events).toEqual([{ type: "error", message: SESSION_CAP_MESSAGE }]);
    expect(callCount).toBe(JARVIS_MAX_TURNS_PER_SESSION);
  });

  it("(g) cancelTurn aborts the in-flight request and surfaces a single cancellation error", async () => {
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: hangingRunner(),
    });
    const session = loop.createSession();

    const eventsPromise = runTurnCollecting(session, "this will hang");

    // Give the microtask queue a turn so runOneTurn has actually started
    // (subscribed, called the factory, entered the hanging `for await`)
    // before cancelling.
    await new Promise((resolve) => {
      return setTimeout(resolve, 0);
    });
    session.cancelTurn();

    const events = await eventsPromise;
    expect(events).toEqual([{ type: "error", message: CANCELLED_MESSAGE }]);
  });

  it("cancelTurn resolves a pending trade confirmation immediately — aborting the network signal alone can't unblock a signal-unaware confirmation Promise, so runOneTurn would otherwise deadlock awaiting a tool call nothing will ever resolve", async () => {
    const onExecute = vi.fn();
    const tradeStream = fakeStream(
      [
        toolUseStartEvent(0, "t1", "execute_trade", {
          symbol: "EURUSD",
          direction: Direction.Buy,
          notional: 1_000_000,
        }),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "execute_trade",
            input: {
              symbol: "EURUSD",
              direction: Direction.Buy,
              notional: 1_000_000,
            },
          },
        ],
      },
    );
    let toolResult: string | undefined;

    function factory(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield tradeStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === "execute_trade";
          });

          // Never yields again — the outer for-await stays parked here,
          // exactly like the real SDK machinery would be while a tool call
          // is in flight, until this await itself resolves.
          toolResult = await tool?.run({
            symbol: "EURUSD",
            direction: Direction.Buy,
            notional: 1_000_000,
          });
        },
        pushMessages: (): void => {},
      };
    }

    function buildFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      return [fakeExecuteTradeTool(confirmTrade, onExecute)];
    }

    function cancelOnConfirmRequest(event: JarvisEvent): void {
      if (event.type === "confirmRequest") {
        session.cancelTurn();
      }
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(buildFixtureTools),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(
      session,
      "buy 1m EURUSD",
      [],
      cancelOnConfirmRequest,
    );

    expect(onExecute).not.toHaveBeenCalled();
    expect(toolResult).toBe(
      "The user declined the trade — nothing was executed.",
    );
  });

  it("(h) an over-long seeded history is trimmed to the cap, keeping the newest entries", async () => {
    const stream = fakeStream([textDeltaEvent(0, "noted")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "noted" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    // Deliberately EVEN (JARVIS_HISTORY_MAX_MESSAGES is also even), so the
    // numeric trim boundary lands on an already-"user" entry and this test
    // isolates the CAP behaviour from the leading-assistant guard (that
    // guard gets its own dedicated tests below).
    const oversized = 34;
    const history: JarvisHistoryEntry[] = Array.from(
      { length: oversized },
      (_unused, i) => {
        return {
          role: i % 2 === 0 ? "user" : "jarvis",
          text: `entry-${i}`,
        } satisfies JarvisHistoryEntry;
      },
    );

    await runTurnCollecting(session, "new question", history);

    expect(calls).toHaveLength(1);
    const messages: BetaMessageParam[] = calls[0]?.params.messages ?? [];
    // JARVIS_HISTORY_MAX_MESSAGES of replayed history + the new user turn.
    expect(messages).toHaveLength(JARVIS_HISTORY_MAX_MESSAGES + 1);
    // Oldest-kept entry is the one JARVIS_HISTORY_MAX_MESSAGES back from the
    // end of the wire history — everything older was trimmed. entry-4 is
    // even (role "user"); entry-33 is odd (role "jarvis" → "assistant").
    const oldestKeptIndex = oversized - JARVIS_HISTORY_MAX_MESSAGES;
    expect(messages[0]).toEqual({
      role: "user",
      content: `entry-${oldestKeptIndex}`,
    });
    expect(messages[JARVIS_HISTORY_MAX_MESSAGES - 1]).toEqual({
      role: "assistant",
      content: `entry-${oversized - 1}`,
    });
    expect(messages[JARVIS_HISTORY_MAX_MESSAGES]).toEqual({
      role: "user",
      content: "new question",
    });
  });

  it("(critical 1a) an assistant-first seeded history is trimmed to user-first before reaching the runner", async () => {
    const stream = fakeStream([textDeltaEvent(0, "noted")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "noted" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    // A stray leading "jarvis" entry — e.g. a reconnect mid-conversation
    // whose wire-truncated window happened to start on an assistant reply.
    const history: JarvisHistoryEntry[] = [
      { role: "jarvis", text: "stray reply" },
      { role: "user", text: "hello" },
    ];

    await runTurnCollecting(session, "new question", history);

    expect(calls).toHaveLength(1);
    const messages: BetaMessageParam[] = calls[0]?.params.messages ?? [];
    expect(messages[0]?.role).toBe("user");
    expect(messages).toEqual([
      { role: "user", content: "hello" },
      { role: "user", content: "new question" },
    ]);
  });

  it("(critical 1b) every leading assistant entry is dropped, not just the first, leaving an odd-length user-first array", async () => {
    const stream = fakeStream([textDeltaEvent(0, "noted")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "noted" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const history: JarvisHistoryEntry[] = [
      { role: "jarvis", text: "a" },
      { role: "jarvis", text: "b" },
      { role: "user", text: "c" },
      { role: "jarvis", text: "d" },
      { role: "user", text: "e" },
    ];

    await runTurnCollecting(session, "new question", history);

    expect(calls).toHaveLength(1);
    const messages: BetaMessageParam[] = calls[0]?.params.messages ?? [];
    // Both leading assistant entries dropped, leaving an odd-length
    // (3-entry) user-first history + the new turn's user message.
    expect(messages).toEqual([
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
      { role: "user", content: "e" },
      { role: "user", content: "new question" },
    ]);
  });

  it("(mandated i) a pause_turn stop_reason pushes the paused assistant content back and continues to the next runner iteration", async () => {
    const pausedContent = [{ type: "text", text: "still thinking..." }];
    const firstStream = fakeStream([textDeltaEvent(0, "still thinking...")], {
      stop_reason: "pause_turn",
      content: pausedContent,
    });

    const secondStream = fakeStream([textDeltaEvent(0, " done now.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "done now." }],
    });
    const pushed: BetaMessageParam[] = [];
    let callCount = 0;

    function factory(): AnthropicRunner {
      callCount += 1;

      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield firstStream;
          yield secondStream;
        },
        pushMessages: (message: BetaMessageParam): void => {
          pushed.push(message);
        },
      };
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "keep going");

    // One runnerFactory call for the whole turn — pause_turn resumes on the
    // SAME runner via pushMessages, not a fresh factory call.
    expect(callCount).toBe(1);
    expect(pushed).toEqual([{ role: "assistant", content: pausedContent }]);
    expect(events).toEqual([
      { type: "delta", text: "still thinking..." },
      { type: "delta", text: " done now." },
      { type: "done" },
    ]);
    expect(
      events.filter((event) => {
        return event.type === "done";
      }),
    ).toHaveLength(1);
  });

  it("(important 4) falling out of the runner loop after a tool_use stop_reason reports the truncation honestly instead of a clean done", async () => {
    const stream = fakeStream(
      [
        toolUseStartEvent(0, "t1", "get_price", { symbol: "EURUSD" }),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "get_price",
            input: { symbol: "EURUSD" },
          },
        ],
      },
    );
    // Only ONE stream — the runner's own async iterator ends right after,
    // mirroring what `max_iterations` cutting the SDK's internal loop off
    // looks like from this session's side: the last thing it saw was a
    // tool_use iteration, and nothing further ever arrives.
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "what's EURUSD?");

    expect(calls).toHaveLength(1);
    expect(events).toEqual([
      { type: "toolEvent", tool: "quote", status: "running" },
      { type: "toolEvent", tool: "quote", status: "done" },
      {
        type: "delta",
        text: " I ran out of runway mid-task, sir — the answer above may be incomplete.",
      },
      { type: "done" },
    ]);
  });

  it("(mandated ii) requestConfirmation resolves false immediately when no turn is open — defense in depth for the important-2 concurrent-turn race", async () => {
    let capturedConfirmTrade: ConfirmGate | undefined;

    function buildFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      capturedConfirmTrade = confirmTrade;
      return [];
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(buildFixtureTools),
      runnerFactory: throwingRunner(),
    });
    // Constructing the session captures `confirmTrade` (buildTools runs in
    // the constructor) but never starts a turn — `currentPush` stays null,
    // exactly the state a stray/late confirm gate call would see.
    loop.createSession();

    expect(capturedConfirmTrade).toBeDefined();

    const approved = await capturedConfirmTrade?.({
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
      quotedPrice: 1.1,
      ratePrecision: 4,
    });

    expect(approved).toBe(false);
  });

  it("(Task 5 model) options.brain reaches the runner as `model`, and options absent defaults to the domain default (Haiku)", async () => {
    const stream = fakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
    });
    const { factory, calls } = scriptedRunner([stream, stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi", [], undefined, {
      brain: "claude-sonnet-5",
    });
    await runTurnCollecting(session, "hi again");

    expect(calls).toHaveLength(2);
    expect(calls[0]?.params.model).toBe("claude-sonnet-5");
    expect(calls[1]?.params.model).toBe(DEFAULT_JARVIS_BRAIN);
  });

  it("(Task 5 effort) output_config.effort is present for sonnet/opus but ABSENT for haiku, even when options.effort is explicitly set", async () => {
    const stream = fakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
    });
    const { factory, calls } = scriptedRunner([stream, stream, stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "sonnet turn", [], undefined, {
      brain: "claude-sonnet-5",
      effort: "high",
    });
    await runTurnCollecting(session, "opus turn", [], undefined, {
      brain: "claude-opus-5",
      effort: "low",
    });
    await runTurnCollecting(session, "haiku turn", [], undefined, {
      brain: "claude-haiku-4-5",
      effort: "high",
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.params.output_config).toEqual({ effort: "high" });
    expect(calls[1]?.params.output_config).toEqual({ effort: "low" });
    expect(calls[2]?.params.output_config).toBeUndefined();
  });

  it("(Task 5 default model) options absent → default model (Haiku) with no output_config at all", async () => {
    const stream = fakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.model).toBe(DEFAULT_JARVIS_BRAIN);
    expect(calls[0]?.params.output_config).toBeUndefined();
  });

  it("(Task 5 usage) per-iteration usage is recorded into the meter, keyed by the resolved model — a two-iteration turn (pause_turn resume) records twice with distinct usage", async () => {
    const first = fakeStream([textDeltaEvent(0, "part 1")], {
      stop_reason: "pause_turn",
      content: [{ type: "text", text: "part 1" }],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 1,
      },
    });

    const second = fakeStream([textDeltaEvent(0, " part 2")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "part 2" }],
      usage: {
        input_tokens: 50,
        output_tokens: 10,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });

    function factory(): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield first;
          yield second;
        },
        pushMessages: (): void => {},
      };
    }

    const recordTokens = vi.fn();

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
      usageMeter: { recordTokens },
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi", [], undefined, {
      brain: "claude-sonnet-5",
    });

    expect(recordTokens).toHaveBeenCalledTimes(2);
    expect(recordTokens).toHaveBeenNthCalledWith(1, "claude-sonnet-5", {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      cacheCreationTokens: 1,
    });
    expect(recordTokens).toHaveBeenNthCalledWith(2, "claude-sonnet-5", {
      inputTokens: 50,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("(Task 5 usage) a final message with no `usage` at all records zeros via the `?? 0` defaults, keyed by the default model", async () => {
    const stream = fakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
      // usage omitted entirely — mirrors a fixture that doesn't care to set it.
    });
    const { factory } = scriptedRunner([stream]);
    const recordTokens = vi.fn();

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
      usageMeter: { recordTokens },
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi");

    expect(recordTokens).toHaveBeenCalledExactlyOnceWith(DEFAULT_JARVIS_BRAIN, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("(Task 5 usage) no meter injected → the turn still completes normally, with no error and no crash", async () => {
    const stream = fakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    const { factory } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
      // usageMeter deliberately omitted.
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "hi");

    expect(events).toEqual([{ type: "delta", text: "ok" }, { type: "done" }]);
  });

  it("(Task 5 usage) a meter whose recordTokens throws does not corrupt the turn: it still completes with the full reply, logs server-side, and history still grows for the NEXT turn", async () => {
    const first = fakeStream([textDeltaEvent(0, "Good morning, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Good morning, sir." }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });

    const second = fakeStream([textDeltaEvent(0, "Indeed.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Indeed." }],
    });
    let callIndex = 0;
    const calls: RunnerCall[] = [];

    function factory(
      params: FactoryParams,
      options: FactoryOptions,
    ): AnthropicRunner {
      calls.push({ params, options });
      const stream = callIndex === 0 ? first : second;
      callIndex += 1;

      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield stream;
        },
        pushMessages: (): void => {},
      };
    }

    const recordTokens = vi.fn(() => {
      throw new Error("usage meter exploded — must never corrupt the turn");
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
      usageMeter: { recordTokens },
    });
    const session = loop.createSession();

    const events1 = await runTurnCollecting(session, "good morning");

    // The turn completes exactly as if the meter had never thrown: the full
    // reply, terminated with "done" — NOT the sanitized "desk link
    // faltered" error the outer catch would have produced had the throw
    // been allowed to propagate there.
    expect(events1).toEqual([
      { type: "delta", text: "Good morning, sir." },
      { type: "done" },
    ]);
    expect(recordTokens).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "AnthropicAgentSession: usageMeter.recordTokens threw —",
      expect.stringContaining("Error"),
    );

    // History still grew after the "completed" outcome — proof the throw
    // never reached the outer catch (which would have produced an
    // "errored" outcome, and `runTurn`'s `.then` only appends to history on
    // "completed"). Turn 2's request replays turn 1's user + assistant
    // messages, exactly like the unthrottled case in test (a).
    await runTurnCollecting(session, "thanks");

    expect(calls).toHaveLength(2);
    expect(calls[1]?.params.messages).toEqual([
      { role: "user", content: "good morning" },
      { role: "assistant", content: "Good morning, sir." },
      { role: "user", content: "thanks" },
    ]);

    consoleErrorSpy.mockRestore();
  });

  it("(Task 3) render_panel is composed into the live tool list even when buildTools contributes none", async () => {
    const stream = fakeStream([textDeltaEvent(0, "hi")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(), // contributes zero registry tools
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi");

    expect(calls).toHaveLength(1);
    const toolNames = asFakeTools(calls[0]?.params.tools ?? []).map((tool) => {
      return tool.name;
    });
    expect(toolNames).toContain(RENDER_PANEL_TOOL_NAME);
  });

  it("(Task 3) render_panel pushes a panel event onto the SAME turn stream, interleaved with toolEvent/delta/done in call order", async () => {
    const panelStream = fakeStream(
      [
        toolUseStartEvent(0, "t1", RENDER_PANEL_TOOL_NAME, {
          spec: panelSpecFixture(),
        }),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: RENDER_PANEL_TOOL_NAME,
            input: { spec: panelSpecFixture() },
          },
        ],
      },
    );

    const finalStream = fakeStream([textDeltaEvent(0, "Pulled it up, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Pulled it up, sir." }],
    });

    let toolResult = "";

    function factory(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield panelStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === RENDER_PANEL_TOOL_NAME;
          });
          toolResult = (await tool?.run({ spec: panelSpecFixture() })) ?? "";

          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
      knownSymbols: ["GBPUSD"],
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "chart GBPUSD vol");

    expect(events).toEqual([
      { type: "toolEvent", tool: RENDER_PANEL_TOOL_NAME, status: "running" },
      { type: "toolEvent", tool: RENDER_PANEL_TOOL_NAME, status: "done" },
      {
        type: "panel",
        panelId: expect.stringMatching(/^panel-/),
        spec: panelSpecFixture(),
      },
      { type: "delta", text: "Pulled it up, sir." },
      { type: "done" },
    ]);
    expect(toolResult).toMatch(/^Rendered panel panel-.+: GBP Volatility$/);
  });

  it("(Task 3) an unknown symbol in the panel spec is rejected via the loop's own knownSymbols, and no panel event is pushed", async () => {
    const badSpec: PanelSpecV1 = {
      v: 1,
      title: "Bogus",
      source: { kind: "fxTicks", symbols: ["ZZZXXX"] },
      transforms: [],
      viz: { kind: "line" },
    };
    const panelStream = fakeStream(
      [
        toolUseStartEvent(0, "t1", RENDER_PANEL_TOOL_NAME, { spec: badSpec }),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: RENDER_PANEL_TOOL_NAME,
            input: { spec: badSpec },
          },
        ],
      },
    );
    const finalStream = fakeStream([textDeltaEvent(0, "No good, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "No good, sir." }],
    });
    let toolResult = "";

    function factory(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield panelStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === RENDER_PANEL_TOOL_NAME;
          });
          toolResult = (await tool?.run({ spec: badSpec })) ?? "";

          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: buildToolsFixture(),
      runnerFactory: factory,
      knownSymbols: ["GBPUSD", "EURUSD"], // ZZZXXX is not in this roster
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "chart ZZZXXX");

    expect(
      events.some((event) => {
        return event.type === "panel";
      }),
    ).toBe(false);
    expect(toolResult).toBe("source.symbols: unknown symbol: ZZZXXX.");
  });
});

// ── fake-runner scripting helpers ──────────────────────────────────────
//
// None of these ever call the real Anthropic SDK/API — every test in this
// file injects `runnerFactory`, the seam `AnthropicAgentLoop` exists for.

function fakeStream(
  events: readonly BetaRawMessageStreamEvent[],
  final: AnthropicFinalMessage,
): AnthropicMessageStream {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<BetaRawMessageStreamEvent> {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: async () => {
      return final;
    },
  };
}

type FactoryParams = Parameters<AnthropicRunnerFactory>[0];

type FactoryOptions = Parameters<AnthropicRunnerFactory>[1];

interface RunnerCall {
  readonly params: FactoryParams;
  readonly options: FactoryOptions;
}

interface FakeTool {
  readonly name: string;
  run(args: unknown): Promise<string>;
}

function asFakeTools(tools: RunnerCall["params"]["tools"]): FakeTool[] {
  return tools as unknown as FakeTool[];
}

interface ScriptedRunner {
  readonly factory: AnthropicRunnerFactory;
  readonly calls: RunnerCall[];
}

/** Scripts a runner that, on every call, yields the same fixed sequence of
 * `AnthropicMessageStream`s and records every call's params/options. */
function scriptedRunner(
  streams: readonly AnthropicMessageStream[],
): ScriptedRunner {
  const calls: RunnerCall[] = [];

  function factory(
    params: FactoryParams,
    options: FactoryOptions,
  ): AnthropicRunner {
    calls.push({ params, options });

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
        for (const stream of streams) {
          yield stream;
        }
      },
      pushMessages: (): void => {},
    };
  }

  return { factory, calls };
}

function throwingRunner(): AnthropicRunnerFactory {
  return () => {
    throw new Error("network exploded — must never reach the client");
  };
}

/** A runner whose single messageStream hangs until `options.signal` aborts,
 * then rejects — mirrors how an aborted fetch/stream rejects a pending read;
 * lets `cancelTurn()` be exercised without any real network call. */
function hangingRunner(): AnthropicRunnerFactory {
  return (_params: FactoryParams, options: FactoryOptions) => {
    const hangingStream: AnthropicMessageStream = {
      [Symbol.asyncIterator]: () => {
        return {
          next: (): Promise<IteratorResult<BetaRawMessageStreamEvent>> => {
            return new Promise((_resolve, reject) => {
              options.signal?.addEventListener("abort", () => {
                reject(new Error("aborted"));
              });
            });
          },
        };
      },
      finalMessage: () => {
        return new Promise(() => {});
      },
    };

    const runner: AnthropicRunner = {
      async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
        yield hangingStream;
      },
      pushMessages: (): void => {},
    };
    return runner;
  };
}

function toolUseStartEvent(
  index: number,
  id: string,
  name: string,
  input: unknown,
): BetaRawMessageStreamEvent {
  return {
    type: "content_block_start",
    index,
    content_block: { type: "tool_use", id, name, input },
  };
}

function toolStopEvent(index: number): BetaRawMessageStreamEvent {
  return { type: "content_block_stop", index };
}

function textDeltaEvent(
  index: number,
  text: string,
): BetaRawMessageStreamEvent {
  return {
    type: "content_block_delta",
    index,
    delta: { type: "text_delta", text },
  };
}

/** Subscribes to one turn, collecting every emitted `JarvisEvent`; `onEvent`
 * runs synchronously as each event arrives (before the turn completes) — the
 * hook the confirm-gate test uses to resolve a confirmation mid-stream, the
 * same way a real client reacts to `confirmRequest`. */
function runTurnCollecting(
  session: AgentSession,
  text: string,
  history: readonly JarvisHistoryEntry[] = [],
  onEvent?: (event: JarvisEvent) => void,
  options?: JarvisTurnOptions,
): Promise<JarvisEvent[]> {
  return new Promise((resolve, reject) => {
    const events: JarvisEvent[] = [];
    session.runTurn(text, history, options).subscribe({
      next: (event: JarvisEvent): void => {
        events.push(event);
        onEvent?.(event);
      },
      error: reject,
      complete: (): void => {
        resolve(events);
      },
    });
  });
}

function fakeGetPriceTool(
  run: (input: unknown) => Promise<string>,
): JarvisToolDefinition {
  return {
    name: "get_price",
    description: "fake get_price for AnthropicAgentLoop tests",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
      additionalProperties: false,
    },
    run,
  };
}

interface GetPriceInput {
  readonly symbol: string;
}

interface ExecuteTradeInput {
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
}

/** A minimal stand-in for the real `execute_trade` tool: it awaits the
 * confirm gate the loop wires in and reports fill/decline exactly like the
 * real one, without pulling in domain simulators — this file tests
 * `AnthropicAgentLoop`'s WIRING of the gate, not `execute_trade`'s own
 * business logic (that's `@rtc/agent-tools`'s own test suite). */
function fakeExecuteTradeTool(
  confirmTrade: ConfirmGate,
  onExecute: () => void,
): JarvisToolDefinition {
  return {
    name: "execute_trade",
    description: "fake execute_trade for AnthropicAgentLoop tests",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        direction: { type: "string" },
        notional: { type: "number" },
      },
      required: ["symbol", "direction", "notional"],
      additionalProperties: false,
    },
    run: async (input: unknown) => {
      const details = input as ExecuteTradeInput;
      const approved = await confirmTrade({
        symbol: details.symbol,
        direction: details.direction,
        notional: details.notional,
        quotedPrice: 1.1,
        ratePrecision: 4,
      });

      if (!approved) {
        return "The user declined the trade — nothing was executed.";
      }

      onExecute();
      return JSON.stringify({ tradeId: "T-1", status: "Filled" });
    },
  };
}

function panelSpecFixture(): PanelSpecV1 {
  return {
    v: 1,
    title: "GBP Volatility",
    source: { kind: "priceHistory", symbols: ["GBPUSD"] },
    transforms: [{ kind: "rollingVol", samples: 20 }],
    viz: { kind: "line" },
  };
}

function buildToolsFixture(
  buildExtra: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[] = () => {
    return [];
  },
): (confirmTrade: ConfirmGate) => readonly JarvisToolDefinition[] {
  return buildExtra;
}
