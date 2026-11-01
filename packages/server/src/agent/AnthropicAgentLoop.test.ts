import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it, type Mock, vi } from "vitest";

import type { ConfirmGate, JarvisToolDefinition } from "@rtc/agent-tools";
import {
  DEFAULT_JARVIS_BRAIN,
  Direction,
  type JarvisEvent,
  type JarvisHistoryEntry,
  type PanelSpecV1,
} from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import { AnthropicAgentLoop } from "./AnthropicAgentLoop.js";
import type {
  AnthropicFinalMessage,
  AnthropicMessageStream,
  AnthropicRunner,
  AnthropicRunnerFactory,
} from "./AnthropicAgentSession.js";
import type { AgentSession, JarvisTurnOptions } from "./agentLoop.js";
import { DRIVE_APP_TOOL_NAME } from "./driveAppTool.js";
import {
  JARVIS_HISTORY_MAX_MESSAGES,
  JARVIS_MAX_TURNS_PER_SESSION,
} from "./jarvisRunnerConfig.js";
import { RENDER_PANEL_TOOL_NAME } from "./renderPanelTool.js";

describe("AnthropicAgentLoop", () => {
  it("(a) text-only turn reassembles deltas, completes, and grows session history by one user + one assistant message", async () => {
    const first = createFakeStream(
      [textDeltaEvent(0, "Good "), textDeltaEvent(0, "morning, sir.")],
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Good morning, sir." }],
      },
    );

    const second = createFakeStream([textDeltaEvent(0, "Indeed.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Indeed." }],
    });
    let callIndex = 0;
    const calls: RunnerCall[] = [];

    function createRunner(
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
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
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

    const toolCallStream = createFakeStream(
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

    const finalStream = createFakeStream(
      [textDeltaEvent(0, "EURUSD is 1.10000, sir.")],
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "EURUSD is 1.10000, sir." }],
      },
    );

    const calls: RunnerCall[] = [];

    function createRunner(
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

    function createFixtureTools(): readonly JarvisToolDefinition[] {
      return [createFakeGetPriceTool(toolRun)];
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(createFixtureTools),
      runnerFactory: createRunner,
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
    const tradeStream = createFakeStream(
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

    const finalStream = createFakeStream([textDeltaEvent(0, "Done, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Done, sir." }],
    });
    let toolResult = "";

    function createRunner(params: FactoryParams): AnthropicRunner {
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

    function createFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      return [createFakeExecuteTradeTool(confirmTrade, onExecute)];
    }

    function approveOnConfirmRequest(event: JarvisEvent): void {
      if (event.type === "confirmRequest") {
        session.resolveConfirmation(event.confirmationId, true);
      }
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(createFixtureTools),
      runnerFactory: createRunner,
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
    const tradeStream = createFakeStream(
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

    const finalStream = createFakeStream(
      [textDeltaEvent(0, "Standing down, sir.")],
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Standing down, sir." }],
      },
    );
    let toolResult = "";

    function createRunner(params: FactoryParams): AnthropicRunner {
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

    function createFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      return [createFakeExecuteTradeTool(confirmTrade, onExecute)];
    }

    function declineOnConfirmRequest(event: JarvisEvent): void {
      if (event.type === "confirmRequest") {
        session.resolveConfirmation(event.confirmationId, false);
      }
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(createFixtureTools),
      runnerFactory: createRunner,
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
    const stream = createFakeStream([], {
      stop_reason: "refusal",
      content: [],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
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
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: throwingRunner(),
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "hello");

    expect(events).toEqual([
      { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
    ]);
  });

  it("an own brain sends its model id and is booked under the brain", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const { factory, calls } = scriptedRunner([stream]);
    const meter = createMeterSpy();
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });

    await runTurnCollecting(loop.createSession(), "hi", [], undefined, {
      brain: "own:anthropic:claude-sonnet-5",
      meter,
    });

    expect(calls[0]?.params.model).toBe("claude-sonnet-5");
    expect(meter.beginRequest.mock.calls[0]?.[0]).toBe(
      "own:anthropic:claude-sonnet-5",
    );
    expect(meter.record.mock.calls[0]?.[0]).toBe(
      "own:anthropic:claude-sonnet-5",
    );
  });

  it("the effort check reads an own brain's model id", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
    });
    const { factory, calls } = scriptedRunner([stream]);
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });

    await runTurnCollecting(loop.createSession(), "hi", [], undefined, {
      brain: "own:anthropic:claude-opus-5",
      effort: "high",
    });
    await runTurnCollecting(loop.createSession(), "hi", [], undefined, {
      brain: "own:anthropic:claude-haiku-4-5",
      effort: "high",
    });

    expect(calls[0]?.params.output_config).toEqual({ effort: "high" });
    expect(calls[1]?.params.output_config).toBeUndefined();
  });

  it("a cancelled own turn on a thinking brain books the whole output ceiling", async () => {
    const meter = createMeterSpy();
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createAbortableRunnerFactory([
        createMessageStartEvent({
          input_tokens: 100,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }),
        textDeltaEvent(0, LAST_STREAMED_TEXT),
      ]),
    });
    const session = loop.createSession();

    await runTurnCollecting(
      session,
      "hi",
      [],
      cancelOnLastStreamedText(session),
      { brain: "own:anthropic:claude-opus-5", meter },
    );

    expect(meter.record.mock.calls[0]?.[1].outputTokens).toBe(
      REQUEST_CEILING.outputTokens,
    );
  });

  it.each([401, 402, 403])(
    "a %i on an own key fails the turn naming the provider and reports the refusal",
    async (status) => {
      const refused = vi.fn();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const loop = new AnthropicAgentLoop({
        apiKey: "test-key",
        knownSymbols: [],
        buildTools: createToolsFixture(),
        runnerFactory: failingRunner(status, "the provider's own words"),
      });

      const events = await runTurnCollecting(
        loop.createSession(),
        "hi",
        [],
        undefined,
        {
          brain: "own:anthropic:claude-haiku-4-5",
          keyFailure: { providerName: "Anthropic", refused },
        },
      );

      expect(events).toEqual([
        { type: "error", message: "Anthropic refused your key." },
      ]);
      expect(refused).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(error.mock.calls)).not.toContain("own words");
      error.mockRestore();
    },
  );

  it("a 429 on an own key stays the sanitized copy and refuses nothing", async () => {
    const refused = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: failingRunner(429, "slow down"),
    });

    const events = await runTurnCollecting(
      loop.createSession(),
      "hi",
      [],
      undefined,
      {
        brain: "own:anthropic:claude-haiku-4-5",
        keyFailure: { providerName: "Anthropic", refused },
      },
    );

    expect(events).toEqual([
      { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
    ]);
    expect(refused).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("a 401 on the house key names no provider: the house key is the operator's to fix", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: failingRunner(401, "bad key"),
    });

    const events = await runTurnCollecting(loop.createSession(), "hi");

    expect(events).toEqual([
      { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
    ]);
    error.mockRestore();
  });

  it("(f) breaching the per-session turn cap short-circuits with no runnerFactory invocation", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "hi")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
    });
    let callCount = 0;

    function createRunner(): AnthropicRunner {
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
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
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
      knownSymbols: [],
      buildTools: createToolsFixture(),
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
    const tradeStream = createFakeStream(
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

    function createRunner(params: FactoryParams): AnthropicRunner {
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

    function createFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      return [createFakeExecuteTradeTool(confirmTrade, onExecute)];
    }

    function cancelOnConfirmRequest(event: JarvisEvent): void {
      if (event.type === "confirmRequest") {
        session.cancelTurn();
      }
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(createFixtureTools),
      runnerFactory: createRunner,
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
    const stream = createFakeStream([textDeltaEvent(0, "noted")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "noted" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
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
    const stream = createFakeStream([textDeltaEvent(0, "noted")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "noted" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
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
    const stream = createFakeStream([textDeltaEvent(0, "noted")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "noted" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
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
    const firstStream = createFakeStream(
      [textDeltaEvent(0, "still thinking...")],
      {
        stop_reason: "pause_turn",
        content: pausedContent,
      },
    );

    const secondStream = createFakeStream([textDeltaEvent(0, " done now.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "done now." }],
    });
    const pushed: BetaMessageParam[] = [];
    let callCount = 0;

    function createRunner(): AnthropicRunner {
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
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
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
    const stream = createFakeStream(
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
      knownSymbols: [],
      buildTools: createToolsFixture(),
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

    function createFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      capturedConfirmTrade = confirmTrade;
      return [];
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(createFixtureTools),
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
    const stream = createFakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
    });
    const { factory, calls } = scriptedRunner([stream, stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
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
    const stream = createFakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
    });
    const { factory, calls } = scriptedRunner([stream, stream, stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
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
    const stream = createFakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.model).toBe(DEFAULT_JARVIS_BRAIN);
    expect(calls[0]?.params.output_config).toBeUndefined();
  });

  it("(B3a meter) per-iteration usage is recorded into the turn's meter, keyed by the resolved model — a two-iteration turn (pause_turn resume) records twice with distinct usage", async () => {
    const first = createFakeStream([textDeltaEvent(0, "part 1")], {
      stop_reason: "pause_turn",
      content: [{ type: "text", text: "part 1" }],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 1,
      },
    });

    const second = createFakeStream([textDeltaEvent(0, " part 2")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "part 2" }],
      usage: {
        input_tokens: 50,
        output_tokens: 10,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });

    function createRunner(): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield first;
          yield second;
        },
        pushMessages: (): void => {},
      };
    }

    const meter = createMeterSpy();

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi", [], undefined, {
      brain: "claude-sonnet-5",
      meter,
    });

    expect(meter.record).toHaveBeenCalledTimes(2);
    expect(meter.record).toHaveBeenNthCalledWith(1, "claude-sonnet-5", {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      cacheCreationTokens: 1,
    });
    expect(meter.record).toHaveBeenNthCalledWith(2, "claude-sonnet-5", {
      inputTokens: 50,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("(B3a meter) a final message with no `usage` at all records zeros via the `?? 0` defaults, keyed by the default model", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "ok")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
      // usage omitted entirely — mirrors a fixture that doesn't care to set it.
    });
    const { factory } = scriptedRunner([stream]);
    const meter = createMeterSpy();

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi", [], undefined, { meter });

    expect(meter.record).toHaveBeenCalledExactlyOnceWith(DEFAULT_JARVIS_BRAIN, {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("(B3a meter) no meter on the turn → the turn still completes normally, with no error and no crash", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "ok")], {
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
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "hi");

    expect(events).toEqual([{ type: "delta", text: "ok" }, { type: "done" }]);
  });

  it("(B3a meter) a meter whose record throws does not corrupt the turn: it still completes with the full reply, logs server-side, and history still grows for the NEXT turn", async () => {
    const first = createFakeStream([textDeltaEvent(0, "Good morning, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Good morning, sir." }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });

    const second = createFakeStream([textDeltaEvent(0, "Indeed.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Indeed." }],
    });
    let callIndex = 0;
    const calls: RunnerCall[] = [];

    function createRunner(
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

    const record = vi.fn(() => {
      throw new Error("usage meter exploded — must never corrupt the turn");
    });

    const meter: TurnMeter = { ...createMeterSpy(), record };

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
    });
    const session = loop.createSession();

    const events1 = await runTurnCollecting(
      session,
      "good morning",
      [],
      undefined,
      { meter },
    );

    // The turn completes exactly as if the meter had never thrown: the full
    // reply, terminated with "done" — NOT the sanitized "desk link
    // faltered" error the outer catch would have produced had the throw
    // been allowed to propagate there.
    expect(events1).toEqual([
      { type: "delta", text: "Good morning, sir." },
      { type: "done" },
    ]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "AnthropicAgentSession: meter.record threw —",
      expect.stringContaining("Error"),
    );

    // History still grew after the "completed" outcome — proof the throw
    // never reached the outer catch (which would have produced an
    // "errored" outcome, and `runTurn`'s `.then` only appends to history on
    // "completed"). Turn 2's request replays turn 1's user + assistant
    // messages, exactly like the unthrottled case in test (a).
    await runTurnCollecting(session, "thanks", [], undefined, { meter });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.params.messages).toEqual([
      { role: "user", content: "good morning" },
      { role: "assistant", content: "Good morning, sir." },
      { role: "user", content: "thanks" },
    ]);

    consoleErrorSpy.mockRestore();
  });

  it("(B3a mid-turn stop) a budget spent by a request stops the turn before the next one: the reply ends on the switch line, then done, and no second request is made", async () => {
    const toolCallStream = createFakeStream(
      [
        textDeltaEvent(0, "Checking, sir."),
        toolUseStartEvent(1, "t1", "get_price", { symbol: "EURUSD" }),
        toolStopEvent(1),
      ],
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Checking, sir." },
          {
            type: "tool_use",
            id: "t1",
            name: "get_price",
            input: { symbol: "EURUSD" },
          },
        ],
        usage: {
          input_tokens: 3_000,
          output_tokens: 200,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    );

    const finalStream = createFakeStream([textDeltaEvent(0, "1.10000.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "1.10000." }],
    });
    let requests = 0;

    function createRunner(): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          requests += 1;
          yield toolCallStream;
          requests += 1;
          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    let spent = false;
    const record = vi.fn((): void => {
      spent = true;
    });

    const meter: MeterSpy = {
      ...createMeterSpy(),
      record,
      exhausted: () => {
        return spent;
      },
    };

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "price?", [], undefined, {
      brain: "claude-haiku-4-5",
      meter,
    });

    expect(events).toEqual([
      { type: "delta", text: "Checking, sir." },
      { type: "toolEvent", tool: "quote", status: "running" },
      { type: "toolEvent", tool: "quote", status: "done" },
      { type: "delta", text: BUDGET_STOP_NOTICE },
      { type: "done" },
    ]);
    expect(requests).toBe(1);
    expect(record).toHaveBeenCalledExactlyOnceWith("claude-haiku-4-5", {
      inputTokens: 3_000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    // Only the request that was made was reserved; nothing is left open.
    expect(meter.beginRequest).toHaveBeenCalledExactlyOnceWith(
      "claude-haiku-4-5",
      REQUEST_CEILING,
    );
    expect(meter.endRequest).not.toHaveBeenCalled();
  });

  it("(B3a budget check) a meter that throws when asked counts as spent: the turn makes no request", async () => {
    const toolCallStream = createFakeStream(
      [toolUseStartEvent(0, "t1", "get_price", { symbol: "EURUSD" })],
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

    const finalStream = createFakeStream([textDeltaEvent(0, "1.10000.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "1.10000." }],
    });
    const { factory, calls } = scriptedRunner([toolCallStream, finalStream]);
    const meter: TurnMeter = {
      ...createMeterSpy(),
      exhausted: () => {
        throw new Error("budget copy exploded");
      },
    };

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "price?", [], undefined, {
      meter,
    });

    expect(events).toEqual([
      { type: "delta", text: BUDGET_SPENT_NOTICE },
      { type: "done" },
    ]);
    expect(calls).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "AnthropicAgentSession: meter.exhausted threw —",
      "Error",
    );
    consoleErrorSpy.mockRestore();
  });

  it("(B3a mid-turn stop) a turn whose last request spent the budget ends as usual: no switch line when no further request would follow", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "Done, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Done, sir." }],
    });
    const { factory } = scriptedRunner([stream]);
    let spent = false;
    const meter: TurnMeter = {
      ...createMeterSpy(),
      record: (): void => {
        spent = true;
      },
      exhausted: () => {
        return spent;
      },
    };

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "hi", [], undefined, {
      meter,
    });

    expect(events).toEqual([
      { type: "delta", text: "Done, sir." },
      { type: "done" },
    ]);
  });

  it("(B3a budget check) a budget already spent when the turn starts makes no request: the reply is the switch line alone", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "hi")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
    });
    const { factory, calls } = scriptedRunner([stream]);
    const meter: MeterSpy = {
      ...createMeterSpy(),
      exhausted: () => {
        return true;
      },
    };

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "hi", [], undefined, {
      meter,
    });

    expect(events).toEqual([
      { type: "delta", text: BUDGET_SPENT_NOTICE },
      { type: "done" },
    ]);
    expect(calls).toHaveLength(0);
    expect(meter.beginRequest).not.toHaveBeenCalled();
    expect(meter.record).not.toHaveBeenCalled();
  });

  it("(B3a mid-turn stop) a pause_turn whose request spent the budget is not resumed: switch line, done, one request, nothing pushed back", async () => {
    const pausedStream = createFakeStream(
      [textDeltaEvent(0, "Working, sir.")],
      {
        stop_reason: "pause_turn",
        content: [{ type: "text", text: "Working, sir." }],
      },
    );

    const finalStream = createFakeStream([textDeltaEvent(0, " Done.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: " Done." }],
    });
    let requests = 0;
    const pushMessages = vi.fn();

    function createRunner(): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          requests += 1;
          yield pausedStream;
          requests += 1;
          yield finalStream;
        },
        pushMessages,
      };
    }

    let spent = false;
    const meter: TurnMeter = {
      ...createMeterSpy(),
      record: (): void => {
        spent = true;
      },
      exhausted: () => {
        return spent;
      },
    };

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "go", [], undefined, {
      meter,
    });

    expect(events).toEqual([
      { type: "delta", text: "Working, sir." },
      { type: "delta", text: BUDGET_STOP_NOTICE },
      { type: "done" },
    ]);
    expect(requests).toBe(1);
    expect(pushMessages).not.toHaveBeenCalled();
  });

  it("(B3a metering) a request cancelled mid-reply on a brain that streams all it generates (Haiku) is still booked: its input as reported, its output estimated from every text, thinking and tool-input character that streamed", async () => {
    // As the real protocol streams it: usage on `message_start` (output 1),
    // then content, and no `message_delta` before the cancel — that only
    // comes just before `message_stop`.
    const meter = createMeterSpy();
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createAbortableRunnerFactory([
        createMessageStartEvent({
          input_tokens: 1_200,
          output_tokens: 1,
          cache_read_input_tokens: 300,
          cache_creation_input_tokens: null,
        }),
        createThinkingDeltaEvent(0, "t".repeat(40)),
        textDeltaEvent(1, "a".repeat(300)),
        createInputJsonDeltaEvent(2, "j".repeat(40)),
        textDeltaEvent(1, LAST_STREAMED_TEXT),
      ]),
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(
      session,
      "price?",
      [],
      cancelOnLastStreamedText(session),
      { brain: "claude-haiku-4-5", meter },
    );

    expect(events.at(-1)).toEqual({
      type: "error",
      message: CANCELLED_MESSAGE,
    });
    // 40 + 300 + 40 + 20 = 400 characters, at 4 a token.
    expect(meter.record).toHaveBeenCalledExactlyOnceWith("claude-haiku-4-5", {
      inputTokens: 1_200,
      outputTokens: 100,
      cacheReadTokens: 300,
      cacheCreationTokens: 0,
    });
    expect(meter.endRequest).not.toHaveBeenCalled();
  });

  it("(B3a metering) a cancelled request whose reported output exceeds the estimate is booked at what was reported", async () => {
    const meter = createMeterSpy();
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createAbortableRunnerFactory([
        createMessageStartEvent({
          input_tokens: 800,
          output_tokens: 1,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: null,
        }),
        createMessageDeltaEvent(250),
        textDeltaEvent(0, LAST_STREAMED_TEXT),
      ]),
    });
    const session = loop.createSession();

    await runTurnCollecting(
      session,
      "price?",
      [],
      cancelOnLastStreamedText(session),
      { brain: "claude-sonnet-5", meter },
    );

    expect(meter.record).toHaveBeenCalledExactlyOnceWith("claude-sonnet-5", {
      inputTokens: 800,
      outputTokens: 250,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("(B3a metering) a request cancelled before its first event is booked at an input estimate — its messages at 4 characters a token plus the persona and tools prefix — not released", async () => {
    const meter = createMeterSpy();
    let session: AgentSession | undefined;
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createCancellingRunnerFactory({
        events: [],
        cancel: () => {
          session?.cancelTurn();
        },
      }),
    });
    session = loop.createSession();

    const events = await runTurnCollecting(
      session,
      "p".repeat(3_960),
      [],
      undefined,
      { brain: "claude-haiku-4-5", meter },
    );

    expect(events).toEqual([{ type: "error", message: CANCELLED_MESSAGE }]);
    // `[{"role":"user","content":"…"}]` is 30 characters around the 3,960 of
    // text: 3,990 / 4 rounds up to 998, plus the 2,100-token prefix. Nothing
    // streamed, so Haiku's output estimate is 0.
    expect(meter.record).toHaveBeenCalledExactlyOnceWith("claude-haiku-4-5", {
      inputTokens: 3_098,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(meter.endRequest).not.toHaveBeenCalled();
  });

  it("(B3a metering) a request cancelled before its first event after a tool round-trip is estimated from the conversation the runner sends, not the turn's first message", async () => {
    const firstRequest = createFakeStream(
      [toolUseStartEvent(0, "t1", "get_price", { symbol: "EURUSD" })],
      {
        stop_reason: "tool_use",
        content: [],
        usage: {
          input_tokens: 900,
          output_tokens: 40,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    );

    const conversation: readonly BetaMessageParam[] = [
      { role: "user", content: "price?" },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "get_price",
            input: { symbol: "EURUSD" },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "r".repeat(800) },
        ],
      },
    ];
    const meter = createMeterSpy();
    let session: AgentSession | undefined;
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createCancellingRunnerFactory({
        events: [],
        cancel: () => {
          session?.cancelTurn();
        },
        finished: [firstRequest],
        conversation,
      }),
    });
    session = loop.createSession();

    await runTurnCollecting(session, "price?", [], undefined, {
      brain: "claude-haiku-4-5",
      meter,
    });

    expect(meter.record).toHaveBeenNthCalledWith(2, "claude-haiku-4-5", {
      inputTokens:
        Math.ceil(JSON.stringify(conversation).length / 4) +
        PROMPT_PREFIX_TOKENS,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("(B3a metering) a thinking brain cancelled mid-thinking is booked at the per-request output cap: its thinking display is omitted, so nothing it billed streamed", async () => {
    const meter = createMeterSpy();
    let session: AgentSession | undefined;
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createCancellingRunnerFactory({
        events: [
          createMessageStartEvent({
            input_tokens: 1_500,
            output_tokens: 1,
            cache_read_input_tokens: 2_000,
            cache_creation_input_tokens: null,
          }),
          createThinkingDeltaEvent(0, ""),
          createThinkingDeltaEvent(0, ""),
        ],
        cancel: () => {
          session?.cancelTurn();
        },
      }),
    });
    session = loop.createSession();

    await runTurnCollecting(session, "price?", [], undefined, {
      brain: "claude-sonnet-5",
      meter,
    });

    expect(meter.record).toHaveBeenCalledExactlyOnceWith("claude-sonnet-5", {
      inputTokens: 1_500,
      outputTokens: 4_096,
      cacheReadTokens: 2_000,
      cacheCreationTokens: 0,
    });
  });

  it("(B3a metering) a request that fails after it was sent but before it reported usage books nothing and releases its reservation", async () => {
    const stream: AnthropicMessageStream = {
      // biome-ignore lint/correctness/useYield: fails before its first event
      async *[Symbol.asyncIterator](): AsyncGenerator<BetaRawMessageStreamEvent> {
        throw new Error("overloaded");
      },
      finalMessage: () => {
        return new Promise(() => {});
      },
    };
    const { factory } = scriptedRunner([stream]);
    const meter = createMeterSpy();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "hi", [], undefined, {
      brain: "claude-sonnet-5",
      meter,
    });

    expect(events.at(-1)).toEqual({
      type: "error",
      message: DESK_LINK_FALTERED_MESSAGE,
    });
    expect(meter.record).not.toHaveBeenCalled();
    expect(meter.endRequest).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it("(B3a metering) a cancel while a trade awaits confirmation releases the next request's reservation: the runner hands over a stream on the aborted signal, which the SDK never sends", async () => {
    const tradeInput = {
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 1_000_000,
    };

    const tradeStream = createFakeStream(
      [
        toolUseStartEvent(0, "t1", "execute_trade", tradeInput),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [],
        usage: {
          input_tokens: 900,
          output_tokens: 60,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    );

    const unsentStream: AnthropicMessageStream = {
      // biome-ignore lint/correctness/useYield: an aborted request has no events
      async *[Symbol.asyncIterator](): AsyncGenerator<BetaRawMessageStreamEvent> {
        throw new Error("Request was aborted.");
      },
      finalMessage: () => {
        return new Promise(() => {});
      },
    };

    function createRunner(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield tradeStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === "execute_trade";
          });

          // As the SDK runner does: run the tool, then hand over the next
          // request's stream.
          await tool?.run(tradeInput);
          yield unsentStream;
        },
        pushMessages: (): void => {},
      };
    }

    function createFixtureTools(
      confirmTrade: ConfirmGate,
    ): readonly JarvisToolDefinition[] {
      return [createFakeExecuteTradeTool(confirmTrade, () => {})];
    }

    const meter = createMeterSpy();
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(createFixtureTools),
      runnerFactory: createRunner,
    });
    const session = loop.createSession();

    await runTurnCollecting(
      session,
      "buy 1m EURUSD",
      [],
      (event: JarvisEvent): void => {
        if (event.type === "confirmRequest") {
          session.cancelTurn();
        }
      },
      { brain: "claude-sonnet-5", meter },
    );

    expect(meter.beginRequest).toHaveBeenCalledTimes(2);
    expect(meter.record).toHaveBeenCalledExactlyOnceWith("claude-sonnet-5", {
      inputTokens: 900,
      outputTokens: 60,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(meter.endRequest).toHaveBeenCalledTimes(1);
  });

  it("(B3a metering) the estimate counts only the cancelled request's own content, not an earlier request's", async () => {
    const firstRequest = createFakeStream(
      [
        textDeltaEvent(0, "a".repeat(400)),
        toolUseStartEvent(1, "t1", "get_price", { symbol: "EURUSD" }),
        toolStopEvent(1),
      ],
      {
        stop_reason: "tool_use",
        content: [],
        usage: {
          input_tokens: 900,
          output_tokens: 120,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    );
    const meter = createMeterSpy();
    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createAbortableRunnerFactory(
        [
          createMessageStartEvent({
            input_tokens: 1_000,
            output_tokens: 1,
            cache_read_input_tokens: null,
            cache_creation_input_tokens: null,
          }),
          textDeltaEvent(0, LAST_STREAMED_TEXT),
        ],
        [firstRequest],
      ),
    });
    const session = loop.createSession();

    await runTurnCollecting(
      session,
      "price?",
      [],
      cancelOnLastStreamedText(session),
      { brain: "claude-haiku-4-5", meter },
    );

    expect(meter.record).toHaveBeenNthCalledWith(2, "claude-haiku-4-5", {
      inputTokens: 1_000,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("(B3a metering) a request that errors before any content is booked with message_start's input and output", async () => {
    const stream: AnthropicMessageStream = {
      async *[Symbol.asyncIterator](): AsyncGenerator<BetaRawMessageStreamEvent> {
        yield createMessageStartEvent({
          input_tokens: 2_000,
          output_tokens: 1,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: 500,
        });
        throw new Error("connection reset");
      },
      finalMessage: () => {
        return new Promise(() => {});
      },
    };
    const { factory } = scriptedRunner([stream]);
    const meter = createMeterSpy();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "price?", [], undefined, {
      brain: "claude-haiku-4-5",
      meter,
    });

    expect(events.at(-1)).toEqual({
      type: "error",
      message: DESK_LINK_FALTERED_MESSAGE,
    });
    expect(meter.record).toHaveBeenCalledExactlyOnceWith("claude-haiku-4-5", {
      inputTokens: 2_000,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheCreationTokens: 500,
    });
    consoleErrorSpy.mockRestore();
  });

  it("(B3a metering) a request that errors mid-reply is booked with its output estimated from what streamed", async () => {
    const stream: AnthropicMessageStream = {
      async *[Symbol.asyncIterator](): AsyncGenerator<BetaRawMessageStreamEvent> {
        yield createMessageStartEvent({
          input_tokens: 2_000,
          output_tokens: 1,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: null,
        });
        yield textDeltaEvent(0, "x".repeat(81));
        throw new Error("connection reset");
      },
      finalMessage: () => {
        return new Promise(() => {});
      },
    };
    const { factory } = scriptedRunner([stream]);
    const meter = createMeterSpy();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "price?", [], undefined, {
      brain: "claude-haiku-4-5",
      meter,
    });

    // 81 characters round UP to 21 tokens: an estimate never under-books.
    expect(meter.record).toHaveBeenCalledExactlyOnceWith("claude-haiku-4-5", {
      inputTokens: 2_000,
      outputTokens: 21,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    consoleErrorSpy.mockRestore();
  });

  it("(B3a metering) a request that fails before it reports any usage books nothing and releases its reservation", async () => {
    function createRunner(): AnthropicRunner {
      return {
        [Symbol.asyncIterator]: (): AsyncIterator<AnthropicMessageStream> => {
          return {
            next: (): Promise<IteratorResult<AnthropicMessageStream>> => {
              return Promise.reject(new Error("connection refused"));
            },
          };
        },
        pushMessages: (): void => {},
      };
    }

    const meter = createMeterSpy();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi", [], undefined, { meter });

    expect(meter.beginRequest).toHaveBeenCalledTimes(1);
    expect(meter.record).not.toHaveBeenCalled();
    expect(meter.endRequest).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it("(B3a metering) every request is reserved before it is made, and a reservation for a request the runner never sends is released", async () => {
    // The runner stops after a tool_use, as `max_iterations` does: the turn
    // reserved a next request that never went out.
    const toolCallStream = createFakeStream(
      [toolUseStartEvent(0, "t1", "get_price", { symbol: "EURUSD" })],
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
    const { factory } = scriptedRunner([toolCallStream]);
    const meter = createMeterSpy();

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(),
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "price?", [], undefined, { meter });

    expect(meter.beginRequest).toHaveBeenCalledTimes(2);
    expect(meter.record).toHaveBeenCalledTimes(1);
    expect(meter.endRequest).toHaveBeenCalledTimes(1);
    const [firstReservation] = meter.beginRequest.mock.invocationCallOrder;
    const [booking] = meter.record.mock.invocationCallOrder;
    expect(firstReservation).toBeLessThan(booking ?? 0);
  });

  it("(Task 3) render_panel is composed into the live tool list even when buildTools contributes none", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "hi")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(), // contributes zero registry tools
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
    const panelStream = createFakeStream(
      [
        toolUseStartEvent(0, "t1", RENDER_PANEL_TOOL_NAME, {
          spec: createPanelSpecFixture(),
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
            input: { spec: createPanelSpecFixture() },
          },
        ],
      },
    );

    const finalStream = createFakeStream(
      [textDeltaEvent(0, "Pulled it up, sir.")],
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Pulled it up, sir." }],
      },
    );

    let toolResult = "";

    function createRunner(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield panelStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === RENDER_PANEL_TOOL_NAME;
          });
          toolResult =
            (await tool?.run({ spec: createPanelSpecFixture() })) ?? "";

          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
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
        spec: createPanelSpecFixture(),
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

    const panelStream = createFakeStream(
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

    const finalStream = createFakeStream([textDeltaEvent(0, "No good, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "No good, sir." }],
    });
    let toolResult = "";

    function createRunner(params: FactoryParams): AnthropicRunner {
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
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
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

  it("(Task 3) drive_app is composed into the live tool list even when buildTools contributes none", async () => {
    const stream = createFakeStream([textDeltaEvent(0, "hi")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
    });
    const { factory, calls } = scriptedRunner([stream]);

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      knownSymbols: [],
      buildTools: createToolsFixture(), // contributes zero registry tools
      runnerFactory: factory,
    });
    const session = loop.createSession();

    await runTurnCollecting(session, "hi");

    expect(calls).toHaveLength(1);
    const toolNames = asFakeTools(calls[0]?.params.tools ?? []).map((tool) => {
      return tool.name;
    });
    expect(toolNames).toContain(DRIVE_APP_TOOL_NAME);
  });

  it("(Task 3) drive_app pushes a command event onto the SAME turn stream, interleaved with toolEvent/delta/done in call order", async () => {
    const driveInput = createDriveBatchInputFixture();

    const driveStream = createFakeStream(
      [
        toolUseStartEvent(0, "t1", DRIVE_APP_TOOL_NAME, driveInput),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: DRIVE_APP_TOOL_NAME,
            input: driveInput,
          },
        ],
      },
    );

    const finalStream = createFakeStream([textDeltaEvent(0, "Done, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Done, sir." }],
    });

    let toolResult = "";

    function createRunner(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield driveStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === DRIVE_APP_TOOL_NAME;
          });
          toolResult = (await tool?.run(driveInput)) ?? "";

          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
      knownSymbols: [],
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "open equities");

    expect(events).toEqual([
      { type: "toolEvent", tool: DRIVE_APP_TOOL_NAME, status: "running" },
      { type: "toolEvent", tool: DRIVE_APP_TOOL_NAME, status: "done" },
      {
        type: "command",
        batch: { v: 1, commands: driveInput.commands },
      },
      { type: "delta", text: "Done, sir." },
      { type: "done" },
    ]);
    expect(toolResult).toBe("Drove the app, sir — applied: 1 command(s).");
  });

  it("(Task 3) an invalid drive batch is rejected via the tool's own parseDriveBatch, and no command event is pushed", async () => {
    const badInput = { commands: [{ kind: "teleport" }] };

    const driveStream = createFakeStream(
      [
        toolUseStartEvent(0, "t1", DRIVE_APP_TOOL_NAME, badInput),
        toolStopEvent(0),
      ],
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: DRIVE_APP_TOOL_NAME,
            input: badInput,
          },
        ],
      },
    );

    const finalStream = createFakeStream([textDeltaEvent(0, "No good, sir.")], {
      stop_reason: "end_turn",
      content: [{ type: "text", text: "No good, sir." }],
    });
    let toolResult = "";

    function createRunner(params: FactoryParams): AnthropicRunner {
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
          yield driveStream;

          const tool = asFakeTools(params.tools).find((candidate) => {
            return candidate.name === DRIVE_APP_TOOL_NAME;
          });
          toolResult = (await tool?.run(badInput)) ?? "";

          yield finalStream;
        },
        pushMessages: (): void => {},
      };
    }

    const loop = new AnthropicAgentLoop({
      apiKey: "test-key",
      buildTools: createToolsFixture(),
      runnerFactory: createRunner,
      knownSymbols: [],
    });
    const session = loop.createSession();

    const events = await runTurnCollecting(session, "teleport me");

    expect(
      events.some((event) => {
        return event.type === "command";
      }),
    ).toBe(false);
    expect(toolResult).toBe('commands[0].kind: unknown kind "teleport"');
  });
});

// ── fake-runner scripting helpers ──────────────────────────────────────
//
// None of these ever call the real Anthropic SDK/API — every test in this
// file injects `runnerFactory`, the seam `AnthropicAgentLoop` exists for.

function createFakeStream(
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

/** A runner that fails like the SDK does on an HTTP error status. */
function failingRunner(
  status: number,
  message: string,
): AnthropicRunnerFactory {
  class APIError extends Error {
    readonly status = status;
  }

  return () => {
    throw new APIError(message);
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

function createFakeGetPriceTool(
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
function createFakeExecuteTradeTool(
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

function createPanelSpecFixture(): PanelSpecV1 {
  return {
    v: 1,
    title: "GBP Volatility",
    source: { kind: "priceHistory", symbols: ["GBPUSD"] },
    transforms: [{ kind: "rollingVol", samples: 20 }],
    viz: { kind: "line" },
  };
}

/** A `drive_app` tool CALL input — the model-facing envelope (no `v`; see
 * `driveAppTool.ts`'s `buildInputSchema` doc comment). */
interface DriveAppInputFixture {
  readonly commands: unknown[];
}

/**
 * Not a `DriveBatchV1` itself. Single-command so the loop-composition test's
 * `applied: 1` assertion is unambiguous.
 */
function createDriveBatchInputFixture(): DriveAppInputFixture {
  return { commands: [{ kind: "switchTab", tab: "equities" }] };
}

interface MeterSpy extends TurnMeter {
  readonly beginRequest: Mock<TurnMeter["beginRequest"]>;
  readonly record: Mock<TurnMeter["record"]>;
  readonly endRequest: Mock<TurnMeter["endRequest"]>;
}

/** A turn meter that records every request and is never spent. */
function createMeterSpy(): MeterSpy {
  return {
    beginRequest: vi.fn<TurnMeter["beginRequest"]>(),
    record: vi.fn<TurnMeter["record"]>(),
    endRequest: vi.fn<TurnMeter["endRequest"]>(),
    exhausted: () => {
      return false;
    },
  };
}

interface MessageStartUsageFixture {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_input_tokens: number | null;
  readonly cache_creation_input_tokens: number | null;
}

/** A `message_start` carrying only the usage the meter reads. */
function createMessageStartEvent(
  usage: MessageStartUsageFixture,
): BetaRawMessageStreamEvent {
  return {
    type: "message_start",
    message: { usage },
  } as unknown as BetaRawMessageStreamEvent;
}

function createThinkingDeltaEvent(
  index: number,
  thinking: string,
): BetaRawMessageStreamEvent {
  return {
    type: "content_block_delta",
    index,
    delta: { type: "thinking_delta", thinking, estimated_tokens: null },
  };
}

function createInputJsonDeltaEvent(
  index: number,
  partialJson: string,
): BetaRawMessageStreamEvent {
  return {
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: partialJson },
  };
}

/** A runner whose last request streams `events`, then hangs until the turn's
 * signal aborts and rejects — how a real request reacts to a cancel. Any
 * `finished` streams are requests that completed before it. */
function createAbortableRunnerFactory(
  events: readonly BetaRawMessageStreamEvent[],
  finished: readonly AnthropicMessageStream[] = [],
): AnthropicRunnerFactory {
  return (_params: FactoryParams, options: FactoryOptions): AnthropicRunner => {
    const signal = options.signal;
    const stream: AnthropicMessageStream = {
      async *[Symbol.asyncIterator](): AsyncGenerator<BetaRawMessageStreamEvent> {
        for (const event of events) {
          yield event;
        }

        await new Promise<never>((_resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error("aborted"));
          }

          signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      },
      finalMessage: () => {
        return new Promise(() => {});
      },
    };

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
        for (const done of finished) {
          yield done;
        }

        yield stream;
      },
      pushMessages: (): void => {},
    };
  };
}

interface CancellingRunnerFixture {
  /** What the last request streams before the cancel. */
  readonly events: readonly BetaRawMessageStreamEvent[];
  /** Cancels the turn. */
  readonly cancel: () => void;
  /** Requests that completed before the last one. */
  readonly finished?: readonly AnthropicMessageStream[];
  /** The runner's current conversation, as the real runner's `params`
   * expose it; left out, the runner has no `params`. */
  readonly conversation?: readonly BetaMessageParam[];
}

/** Like `createAbortableRunnerFactory`, but the last request cancels the
 * turn itself once its `events` have streamed — a stop pressed at a moment
 * no client event marks (before the first event, or mid-thinking). */
function createCancellingRunnerFactory(
  fixture: CancellingRunnerFixture,
): AnthropicRunnerFactory {
  return (_params: FactoryParams, options: FactoryOptions): AnthropicRunner => {
    const signal = options.signal;
    const stream: AnthropicMessageStream = {
      async *[Symbol.asyncIterator](): AsyncGenerator<BetaRawMessageStreamEvent> {
        for (const event of fixture.events) {
          yield event;
        }

        fixture.cancel();

        if (signal?.aborted) {
          throw new Error("aborted");
        }
      },
      finalMessage: () => {
        return new Promise(() => {});
      },
    };

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<AnthropicMessageStream> {
        for (const done of fixture.finished ?? []) {
          yield done;
        }

        yield stream;
      },
      pushMessages: (): void => {},
      ...(fixture.conversation === undefined
        ? {}
        : { params: { messages: fixture.conversation } }),
    };
  };
}

/** Cancels the turn the moment the stream's last text reaches the client,
 * as a person pressing stop mid-reply would. */
function cancelOnLastStreamedText(
  session: AgentSession,
): (event: JarvisEvent) => void {
  return (event: JarvisEvent): void => {
    if (event.type === "delta" && event.text === LAST_STREAMED_TEXT) {
      session.cancelTurn();
    }
  };
}

/** A `message_delta` whose cumulative output count is `outputTokens`. */
function createMessageDeltaEvent(
  outputTokens: number,
): BetaRawMessageStreamEvent {
  return {
    type: "message_delta",
    delta: { stop_reason: null, stop_sequence: null },
    usage: {
      output_tokens: outputTokens,
      input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    },
  } as unknown as BetaRawMessageStreamEvent;
}

function createToolsFixture(
  buildExtra: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[] = () => {
    return [];
  },
): (confirmTrade: ConfirmGate) => readonly JarvisToolDefinition[] {
  return buildExtra;
}

const REFUSAL_MESSAGE = "I'm afraid I can't assist with that, sir.";

const DESK_LINK_FALTERED_MESSAGE =
  "The desk link faltered, sir — do try again.";

const SESSION_CAP_MESSAGE =
  "We've had quite the session, sir — do reconnect for a fresh one.";

const CANCELLED_MESSAGE = "Cancelled, sir.";

/** 20 characters; the abort tests cancel when it streams. */
const LAST_STREAMED_TEXT = "b".repeat(20);

/** The persona and tools prefix a cancelled request's input estimate adds. */
const PROMPT_PREFIX_TOKENS = 2_100;

const BUDGET_SPENT_NOTICE =
  "Today's AI budget is used — switching to the scripted brain.";

const BUDGET_STOP_NOTICE = `\n\n${BUDGET_SPENT_NOTICE}`;

/** The worst case a request is reserved at: 15k input tokens and the
 * per-request output cap. */
const REQUEST_CEILING = {
  inputTokens: 15_000,
  outputTokens: 4_096,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};
