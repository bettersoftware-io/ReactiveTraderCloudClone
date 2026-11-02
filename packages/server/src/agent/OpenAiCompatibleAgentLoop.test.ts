import type { Subscription } from "rxjs";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";

import type {
  ConfirmGate,
  JarvisConfirmDetails,
  JarvisToolDefinition,
} from "@rtc/agent-tools";
import {
  Direction,
  type JarvisEvent,
  type JarvisHistoryEntry,
  type JarvisOwnBrain,
  type PanelSpecV1,
} from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import type { AgentSession, JarvisTurnOptions } from "./agentLoop.js";
import { JARVIS_SYSTEM_PROMPT } from "./jarvisPersona.js";
import {
  JARVIS_HISTORY_MAX_MESSAGES,
  JARVIS_MAX_TURNS_PER_SESSION,
} from "./jarvisRunnerConfig.js";
import {
  BUDGET_SPENT_NOTICE,
  BUDGET_STOP_NOTICE,
  CANCELLED_MESSAGE,
  DESK_LINK_FALTERED_MESSAGE,
  JARVIS_RUNNER_MAX_ITERATIONS,
  REFUSAL_MESSAGE,
  RUNWAY_EXHAUSTED_NOTICE,
  SESSION_CAP_MESSAGE,
  TRUNCATION_NOTICE,
} from "./jarvisTurnCopy.js";
import {
  OpenAiCompatibleAgentLoop,
  type OpenAiCompatibleConfig,
} from "./OpenAiCompatibleAgentLoop.js";
import { RENDER_PANEL_TOOL_NAME } from "./renderPanelTool.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("OpenAiCompatibleAgentLoop", () => {
  describe("a reply", () => {
    it("streams delta.content as delta events, ends done, and grows the session's history", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["Good ", "morning, sir."]),
        replyWithText(["Indeed."]),
      ]);
      const session = createSession({ fetchFn });

      const events = await runTurnCollecting(session, "good morning");

      expect(events).toEqual([
        { type: "delta", text: "Good " },
        { type: "delta", text: "morning, sir." },
        { type: "done" },
      ]);

      await runTurnCollecting(session, "thanks");

      expect(requests).toHaveLength(2);
      expect(requests[1]?.body.messages).toEqual([
        { role: "system", content: JARVIS_SYSTEM_PROMPT },
        { role: "user", content: "good morning" },
        { role: "assistant", content: "Good morning, sir." },
        { role: "user", content: "thanks" },
      ]);
    });

    it("posts one streaming request to {baseUrl}/chat/completions with the key, no redirects, usage on, and the desk tools as functions", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["ok"]),
      ]);
      const getPrice = createFakeGetPriceTool(vi.fn());
      const session = createSession({
        fetchFn,
        buildTools: () => {
          return [getPrice];
        },
      });

      await runTurnCollecting(session, "hi");

      const request = firstOf(requests);

      expect(request.url).toBe(
        "https://llm.example.test/api/v1/chat/completions",
      );
      expect(request.init.method).toBe("POST");
      expect(request.init.redirect).toBe("error");
      expect(request.headers.get("authorization")).toBe("Bearer sk-own-test");
      expect(request.headers.get("content-type")).toBe("application/json");
      expect(request.headers.get("x-title")).toBe("Reactive Trader");
      expect(request.body).toMatchObject({
        model: "claude-haiku-4-5",
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: 4_096,
        usage: { include: true },
      });
      expect(request.body).not.toHaveProperty("max_tokens");
      expect(
        request.body.tools.map((tool) => {
          return tool.function.name;
        }),
      ).toEqual(["drive_app", "get_price", RENDER_PANEL_TOOL_NAME]);
      expect(request.body.tools).toContainEqual({
        type: "function",
        function: {
          name: getPrice.name,
          description: getPrice.description,
          parameters: getPrice.inputSchema,
        },
      });
    });

    it("sends the token limit under the configured name, and extra body fields cannot replace the request's own", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["ok"]),
      ]);

      const session = createSession({
        fetchFn,
        config: createConfigFixture({
          tokenLimitParam: "max_tokens",
          extraBody: { model: "other-model", stream: false, top_p: 0.5 },
          headers: { Authorization: "Bearer house-key" },
        }),
      });

      await runTurnCollecting(session, "hi");

      const request = firstOf(requests);

      expect(request.body).toMatchObject({
        model: "claude-haiku-4-5",
        stream: true,
        max_tokens: 4_096,
        top_p: 0.5,
      });
      expect(request.body).not.toHaveProperty("max_completion_tokens");
      expect(request.headers.get("authorization")).toBe("Bearer sk-own-test");
    });

    it("sends no reasoning_effort, even when the turn names an effort", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["ok"]),
      ]);

      await runTurnCollecting(createSession({ fetchFn }), "hi", [], undefined, {
        brain: BRAIN,
        effort: "high",
      });

      expect(firstOf(requests).body).not.toHaveProperty("reasoning_effort");
      expect(firstOf(requests).body).not.toHaveProperty("effort");
    });

    it("takes its key and host from the connection, never from the environment", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-house");
      vi.stubEnv("OPENAI_BASE_URL", "https://gateway.example.test");
      vi.stubEnv("OPENROUTER_API_KEY", "sk-or-house");
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["ok"]),
      ]);

      await runTurnCollecting(createSession({ fetchFn }), "hi");

      const request = firstOf(requests);

      expect(request.url).toBe(
        "https://llm.example.test/api/v1/chat/completions",
      );
      expect(request.headers.get("authorization")).toBe("Bearer sk-own-test");
    });

    it("a turn whose brain is not a listed model makes no request", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["ok"]),
      ]);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const session = createSession({ fetchFn });

      const unlisted = await runTurnCollecting(session, "hi", [], undefined, {
        brain: "own:openai:gpt-unlisted",
      });
      const none = await runTurnCollecting(session, "hi", [], undefined, {});

      expect(unlisted).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(none).toEqual(unlisted);
      expect(requests).toHaveLength(0);
      expect(error).toHaveBeenCalled();
    });
  });

  describe("tool calls", () => {
    it("accumulates tool-call deltas by index, brackets them running then done, runs them through the desk and feeds the results back as tool messages", async () => {
      const toolRun = vi.fn(async (input: unknown) => {
        return `quote for ${(input as GetPriceInput).symbol}`;
      });

      const { fetchFn, requests } = createScriptedFetch([
        replyWith([
          createToolCallDeltaChunk(0, {
            id: "call_a",
            name: "get_price",
            arguments: "",
          }),
          createToolCallDeltaChunk(0, { arguments: '{"sym' }),
          createToolCallDeltaChunk(1, {
            id: "call_b",
            name: "get_price",
            arguments: '{"symbol":',
          }),
          createToolCallDeltaChunk(0, { arguments: 'bol":"EURUSD"}' }),
          createToolCallDeltaChunk(1, { arguments: '"GBPUSD"}' }),
          createFinishChunk("tool_calls"),
        ]),
        replyWithText(["Both quoted, sir."]),
      ]);

      const session = createSession({
        fetchFn,
        buildTools: () => {
          return [createFakeGetPriceTool(toolRun)];
        },
      });

      const events = await runTurnCollecting(session, "quote both");

      expect(events).toEqual([
        { type: "toolEvent", tool: "quote", status: "running" },
        { type: "toolEvent", tool: "quote", status: "running" },
        { type: "toolEvent", tool: "quote", status: "done" },
        { type: "toolEvent", tool: "quote", status: "done" },
        { type: "delta", text: "Both quoted, sir." },
        { type: "done" },
      ]);
      expect(toolRun.mock.calls).toEqual([
        [{ symbol: "EURUSD" }],
        [{ symbol: "GBPUSD" }],
      ]);
      expect(requests[1]?.body.messages.slice(2)).toEqual([
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_a",
              type: "function",
              function: {
                name: "get_price",
                arguments: '{"symbol":"EURUSD"}',
              },
            },
            {
              id: "call_b",
              type: "function",
              function: {
                name: "get_price",
                arguments: '{"symbol":"GBPUSD"}',
              },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_a", content: "quote for EURUSD" },
        { role: "tool", tool_call_id: "call_b", content: "quote for GBPUSD" },
      ]);
    });

    it("unparseable tool arguments go back to the model as a tool error and do not fail the turn", async () => {
      const toolRun = vi.fn(async () => {
        return "unused";
      });

      const { fetchFn, requests } = createScriptedFetch([
        replyWith([
          createToolCallDeltaChunk(0, {
            id: "call_a",
            name: "get_price",
            arguments: '{"symbol": EUR',
          }),
          createFinishChunk("tool_calls"),
        ]),
        replyWithText(["Let me try that again, sir."]),
      ]);

      const session = createSession({
        fetchFn,
        buildTools: () => {
          return [createFakeGetPriceTool(toolRun)];
        },
      });

      const events = await runTurnCollecting(session, "quote EUR");

      expect(toolRun).not.toHaveBeenCalled();
      expect(events.at(-1)).toEqual({ type: "done" });
      expect(
        events.some((event) => {
          return event.type === "error";
        }),
      ).toBe(false);
      expect(requests[1]?.body.messages.at(-1)).toEqual({
        role: "tool",
        tool_call_id: "call_a",
        content: expect.stringMatching(/^Error: /),
      });
    });

    it("a call to a tool the desk does not have goes back to the model as a tool error", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithToolCall("call_a", "launch_rockets", {}),
        replyWithText(["I can't do that, sir."]),
      ]);

      await runTurnCollecting(createSession({ fetchFn }), "launch");

      expect(requests[1]?.body.messages.at(-1)).toEqual({
        role: "tool",
        tool_call_id: "call_a",
        content: "Error: Tool 'launch_rockets' not found",
      });
    });

    it("render_panel pushes a panel event onto the same turn stream, after its tool event", async () => {
      const { fetchFn } = createScriptedFetch([
        replyWithToolCall("call_p", RENDER_PANEL_TOOL_NAME, {
          spec: createPanelSpecFixture(),
        }),
        replyWithText(["Pulled it up, sir."]),
      ]);
      const session = createSession({ fetchFn, knownSymbols: ["GBPUSD"] });

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
    });

    it("the execute_trade confirm gate blocks until answered, and a cancel releases it", async () => {
      // Approved: the turn waits on the gate, then goes on.
      const approvedExecute = vi.fn();
      const approved = createScriptedFetch([
        replyWithToolCall("call_t", "execute_trade", TRADE_INPUT),
        replyWithText(["Done, sir."]),
      ]);

      const approvedSession = createSession({
        fetchFn: approved.fetchFn,
        buildTools: (
          confirmTrade: ConfirmGate,
        ): readonly JarvisToolDefinition[] => {
          return [createFakeExecuteTradeTool(confirmTrade, approvedExecute)];
        },
      });
      const confirmation = createDeferred<string>();
      let approvedTurnEnded = false;

      const approvedTurn = runTurnCollecting(
        approvedSession,
        "buy 1m EURUSD",
        [],
        (event) => {
          if (event.type === "confirmRequest") {
            confirmation.resolve(event.confirmationId);
          }
        },
      ).then((events) => {
        approvedTurnEnded = true;

        return events;
      });

      const confirmationId = await confirmation.promise;
      await flushMicrotasks();

      expect(approvedTurnEnded).toBe(false);
      expect(approved.requests).toHaveLength(1);
      expect(approvedExecute).not.toHaveBeenCalled();

      approvedSession.resolveConfirmation(confirmationId, true);
      const approvedEvents = await approvedTurn;

      expect(approvedExecute).toHaveBeenCalledTimes(1);
      expect(approved.requests).toHaveLength(2);
      expect(approved.requests[1]?.body.messages.at(-1)).toEqual({
        role: "tool",
        tool_call_id: "call_t",
        content: JSON.stringify({ tradeId: "T-1", status: "Filled" }),
      });
      expect(approvedEvents.at(-1)).toEqual({ type: "done" });

      // Cancelled while the gate waits: it answers no, nothing executes, and
      // the next request's reservation is released, never sent.
      const cancelledExecute = vi.fn();
      const meter = createMeterSpy();
      const cancelled = createScriptedFetch([
        replyWithToolCall("call_t", "execute_trade", TRADE_INPUT),
        replyWithText(["never sent"]),
      ]);

      const cancelledSession = createSession({
        fetchFn: cancelled.fetchFn,
        buildTools: (
          confirmTrade: ConfirmGate,
        ): readonly JarvisToolDefinition[] => {
          return [createFakeExecuteTradeTool(confirmTrade, cancelledExecute)];
        },
      });

      const cancelledEvents = await runTurnCollecting(
        cancelledSession,
        "buy 1m EURUSD",
        [],
        (event) => {
          if (event.type === "confirmRequest") {
            cancelledSession.cancelTurn();
          }
        },
        { brain: BRAIN, meter },
      );

      expect(cancelledExecute).not.toHaveBeenCalled();
      expect(cancelled.requests).toHaveLength(1);
      expect(cancelledEvents.at(-1)).toEqual({
        type: "error",
        message: CANCELLED_MESSAGE,
      });
      expect(meter.beginRequest).toHaveBeenCalledTimes(2);
      expect(meter.record).toHaveBeenCalledTimes(1);
      expect(meter.endRequest).toHaveBeenCalledTimes(1);
    });

    it("a confirmation asked for after a cancel answers no at once, so a tool that waits before its gate still ends the turn", async () => {
      vi.useFakeTimers();
      const answers: boolean[] = [];
      const { fetchFn, requests } = createScriptedFetch([
        replyWithToolCall("call_t", "execute_trade", TRADE_INPUT),
        replyWithText(["never sent"]),
      ]);

      const session = createSession({
        fetchFn,
        buildTools: (
          confirmTrade: ConfirmGate,
        ): readonly JarvisToolDefinition[] => {
          return [
            createSlowTradeTool(confirmTrade, answers, () => {
              session.cancelTurn();
            }),
          ];
        },
      });

      const turn = runTurnCollecting(session, "buy 1m EURUSD");
      await vi.advanceTimersByTimeAsync(QUOTE_DELAY_MS);
      const events = await turn;

      expect(answers).toEqual([false]);
      expect(
        events.some((event) => {
          return event.type === "confirmRequest";
        }),
      ).toBe(false);
      expect(events.at(-1)).toEqual({
        type: "error",
        message: CANCELLED_MESSAGE,
      });
      expect(requests).toHaveLength(1);
    });

    it("a confirmation asked for after the socket closed answers no at once", async () => {
      vi.useFakeTimers();
      const answers: boolean[] = [];
      const { fetchFn, requests } = createScriptedFetch([
        replyWithToolCall("call_t", "execute_trade", TRADE_INPUT),
        replyWithText(["never sent"]),
      ]);
      const events: JarvisEvent[] = [];
      const socket: OpenSocketFixture = {};
      const session = createSession({
        fetchFn,
        buildTools: (
          confirmTrade: ConfirmGate,
        ): readonly JarvisToolDefinition[] => {
          return [
            createSlowTradeTool(confirmTrade, answers, () => {
              // The socket closes while the quote is being taken.
              socket.subscription?.unsubscribe();
            }),
          ];
        },
      });

      socket.subscription = session
        .runTurn("buy 1m EURUSD", [], OPTIONS)
        .subscribe({
          next: (event: JarvisEvent): void => {
            events.push(event);
          },
        });

      await vi.advanceTimersByTimeAsync(QUOTE_DELAY_MS);

      expect(answers).toEqual([false]);
      expect(
        events.some((event) => {
          return event.type === "confirmRequest";
        }),
      ).toBe(false);
      expect(requests).toHaveLength(1);
    });
  });

  describe("how a reply ends", () => {
    it('finish_reason "length" appends the truncation notice, then done', async () => {
      const { fetchFn } = createScriptedFetch([
        replyWith([createTextChunk("Partial"), createFinishChunk("length")]),
      ]);

      const events = await runTurnCollecting(createSession({ fetchFn }), "go");

      expect(events).toEqual([
        { type: "delta", text: "Partial" },
        { type: "delta", text: TRUNCATION_NOTICE },
        { type: "done" },
      ]);
    });

    it('finish_reason "content_filter" ends the turn on the refusal error', async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWith([createTextChunk("I"), createFinishChunk("content_filter")]),
        replyWithText(["fine"]),
      ]);
      const session = createSession({ fetchFn });

      const events = await runTurnCollecting(session, "say something awful");

      expect(events).toEqual([
        { type: "delta", text: "I" },
        { type: "error", message: REFUSAL_MESSAGE },
      ]);

      // A refused turn is not kept in the session's history.
      await runTurnCollecting(session, "never mind");

      expect(requests[1]?.body.messages).toEqual([
        { role: "system", content: JARVIS_SYSTEM_PROMPT },
        { role: "user", content: "never mind" },
      ]);
    });

    it("a model that keeps calling tools is cut off at the iteration cap, with the runway notice", async () => {
      const toolRun = vi.fn(async () => {
        return "1.10000";
      });

      const { fetchFn, requests } = createScriptedFetch([
        replyWithToolCall("call_a", "get_price", { symbol: "EURUSD" }),
      ]);

      const session = createSession({
        fetchFn,
        buildTools: () => {
          return [createFakeGetPriceTool(toolRun)];
        },
      });

      const events = await runTurnCollecting(session, "loop forever");

      expect(requests).toHaveLength(JARVIS_RUNNER_MAX_ITERATIONS);
      expect(toolRun).toHaveBeenCalledTimes(JARVIS_RUNNER_MAX_ITERATIONS);
      expect(events.slice(-2)).toEqual([
        { type: "delta", text: RUNWAY_EXHAUSTED_NOTICE },
        { type: "done" },
      ]);
    });

    it("an error object mid-stream ends the turn with the sanitized copy", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const { fetchFn } = createScriptedFetch([
        replyWith([
          createTextChunk("Hel"),
          { error: { message: "upstream said SECRET-BODY-TEXT", code: 502 } },
          // Nothing after the error is relayed, however the stream goes on.
          createTextChunk("lo"),
          createFinishChunk("stop"),
        ]),
      ]);

      const events = await runTurnCollecting(createSession({ fetchFn }), "hi");

      expect(events).toEqual([
        { type: "delta", text: "Hel" },
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(error.mock.calls).toEqual([
        [
          "OpenAiCompatibleAgentSession: turn failed —",
          "the stream carried an error",
        ],
      ]);
    });

    it('OpenRouter\'s finish_reason "error" is a failure, not a clean reply', async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { fetchFn } = createScriptedFetch([
        replyWith([createTextChunk("Hel"), createFinishChunk("error")]),
      ]);

      const events = await runTurnCollecting(createSession({ fetchFn }), "hi");

      expect(events).toEqual([
        { type: "delta", text: "Hel" },
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
    });

    it("a stream that ends without a finish reason is a failure, not a clean reply", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const meter = createMeterSpy();
      const { fetchFn, requests } = createScriptedFetch([
        replyWith([createTextChunk("Hello")]),
        replyWithText(["Again."]),
      ]);
      const session = createSession({ fetchFn });

      const events = await runTurnCollecting(session, "hi", [], undefined, {
        brain: BRAIN,
        meter,
      });

      expect(events).toEqual([
        { type: "delta", text: "Hello" },
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      // It generated before it failed, so it is booked at an estimate.
      expect(meter.record).toHaveBeenCalledExactlyOnceWith(BRAIN, {
        inputTokens: Math.ceil(bodyLengthOf(firstOf(requests)) / 4),
        outputTokens: Math.ceil("Hello".length / 4),
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });

      await runTurnCollecting(session, "again");

      expect(requests[1]?.body.messages).toEqual([
        { role: "system", content: JARVIS_SYSTEM_PROMPT },
        { role: "user", content: "again" },
      ]);
    });
  });

  describe("the budget", () => {
    it("a budget already spent when the turn starts makes no request: the reply is the switch line alone", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["never sent"]),
      ]);
      const meter = createMeterSpy([true]);

      const events = await runTurnCollecting(
        createSession({ fetchFn }),
        "hi",
        [],
        undefined,
        { brain: BRAIN, meter },
      );

      expect(events).toEqual([
        { type: "delta", text: BUDGET_SPENT_NOTICE },
        { type: "done" },
      ]);
      expect(requests).toHaveLength(0);
      expect(meter.beginRequest).not.toHaveBeenCalled();
    });

    it("a budget spent by a request stops the turn before the next one, and its tools never run", async () => {
      const toolRun = vi.fn(async () => {
        return "1.10000";
      });

      const { fetchFn, requests } = createScriptedFetch([
        replyWithToolCall("call_a", "get_price", { symbol: "EURUSD" }),
        replyWithText(["never sent"]),
      ]);
      const meter = createMeterSpy([false, true]);

      const events = await runTurnCollecting(
        createSession({
          fetchFn,
          buildTools: () => {
            return [createFakeGetPriceTool(toolRun)];
          },
        }),
        "quote",
        [],
        undefined,
        { brain: BRAIN, meter },
      );

      expect(events).toEqual([
        { type: "toolEvent", tool: "quote", status: "running" },
        { type: "toolEvent", tool: "quote", status: "done" },
        { type: "delta", text: BUDGET_STOP_NOTICE },
        { type: "done" },
      ]);
      expect(requests).toHaveLength(1);
      expect(toolRun).not.toHaveBeenCalled();
    });

    it("a meter that throws when asked counts as spent: the turn makes no request", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["never sent"]),
      ]);

      const meter: TurnMeter = {
        ...createMeterSpy(),
        exhausted: () => {
          throw new Error("store exploded");
        },
      };

      const events = await runTurnCollecting(
        createSession({ fetchFn }),
        "hi",
        [],
        undefined,
        { brain: BRAIN, meter },
      );

      expect(events).toEqual([
        { type: "delta", text: BUDGET_SPENT_NOTICE },
        { type: "done" },
      ]);
      expect(requests).toHaveLength(0);
      expect(error).toHaveBeenCalledWith(
        "OpenAiCompatibleAgentSession: meter.exhausted threw —",
        "Error",
      );
    });

    it("every request is reserved at the listed ceiling before it is made, and booked with what it reported", async () => {
      const meter = createMeterSpy();
      const { fetchFn, requests } = createScriptedFetch([
        replyWithToolCall(
          "call_a",
          "get_price",
          { symbol: "EURUSD" },
          createUsageChunk({ prompt: 100, completion: 20 }),
        ),
        replyWithText(
          ["EURUSD is 1.1, sir."],
          createUsageChunk({ prompt: 200, completion: 30, cost: 0.0042 }),
        ),
      ]);
      const fetchSpy = vi.fn(fetchFn);

      await runTurnCollecting(
        createSession({
          fetchFn: fetchSpy,
          buildTools: () => {
            return [
              createFakeGetPriceTool(
                vi.fn(async () => {
                  return "1.1";
                }),
              ),
            ];
          },
        }),
        "quote",
        [],
        undefined,
        { brain: BRAIN, meter },
      );

      expect(requests).toHaveLength(2);
      expect(meter.beginRequest.mock.calls).toEqual([
        [BRAIN, REQUEST_CEILING],
        [BRAIN, REQUEST_CEILING],
      ]);
      expect(meter.record.mock.calls).toEqual([
        [
          BRAIN,
          {
            inputTokens: 100,
            outputTokens: 20,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
        ],
        [
          BRAIN,
          {
            inputTokens: 200,
            outputTokens: 30,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            reportedCostUsd: 0.0042,
          },
        ],
      ]);
      // Reserve, send, book — for each request in turn.
      const order = [
        meter.beginRequest.mock.invocationCallOrder[0],
        fetchSpy.mock.invocationCallOrder[0],
        meter.record.mock.invocationCallOrder[0],
        meter.beginRequest.mock.invocationCallOrder[1],
        fetchSpy.mock.invocationCallOrder[1],
        meter.record.mock.invocationCallOrder[1],
      ];
      expect(order).toEqual(
        [...order].sort((a, b) => {
          return (a ?? 0) - (b ?? 0);
        }),
      );
      expect(meter.endRequest).not.toHaveBeenCalled();
    });

    it("a reply that reports no usage is still booked, at an estimate, before the next request is reserved", async () => {
      const meter = createMeterSpy();
      const { fetchFn, requests } = createScriptedFetch([
        replyWithToolCall(
          "call_a",
          "get_price",
          { symbol: "EURUSD" },
          NO_USAGE_CHUNK,
        ),
        replyWith([createTextChunk("abcdefghi"), createFinishChunk("stop")]),
      ]);

      await runTurnCollecting(
        createSession({
          fetchFn,
          buildTools: () => {
            return [
              createFakeGetPriceTool(
                vi.fn(async () => {
                  return "1.1";
                }),
              ),
            ];
          },
        }),
        "quote",
        [],
        undefined,
        { brain: BRAIN, meter },
      );

      expect(meter.record.mock.calls).toEqual([
        [
          BRAIN,
          {
            inputTokens: Math.ceil(bodyLengthOf(firstOf(requests)) / 4),
            // The tool call's 19 characters of arguments.
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
        ],
        [
          BRAIN,
          {
            inputTokens: Math.ceil(String(requests[1]?.init.body).length / 4),
            outputTokens: 3,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
        ],
      ]);
      expect(meter.record.mock.invocationCallOrder[0]).toBeLessThan(
        meter.beginRequest.mock.invocationCallOrder[1] ?? 0,
      );
    });

    it("a request the provider turns away before it streams books nothing and releases its reservation", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const meter = createMeterSpy();
      const { fetchFn } = createScriptedFetch([replyWithStatus(500)]);

      await runTurnCollecting(createSession({ fetchFn }), "hi", [], undefined, {
        brain: BRAIN,
        meter,
      });

      expect(meter.beginRequest).toHaveBeenCalledTimes(1);
      expect(meter.record).not.toHaveBeenCalled();
      expect(meter.endRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancel", () => {
    it("a cancel mid-reply aborts the fetch, books the request at an estimate, and ends on the cancellation line", async () => {
      const meter = createMeterSpy();
      const { fetchFn, requests } = createScriptedFetch([
        replyWithHangingStream([createTextChunk(LAST_STREAMED_TEXT)]),
      ]);
      const session = createSession({ fetchFn });

      const events = await runTurnCollecting(
        session,
        "talk",
        [],
        (event) => {
          if (event.type === "delta" && event.text === LAST_STREAMED_TEXT) {
            session.cancelTurn();
          }
        },
        { brain: BRAIN, meter },
      );

      expect(events).toEqual([
        { type: "delta", text: LAST_STREAMED_TEXT },
        { type: "error", message: CANCELLED_MESSAGE },
      ]);
      expect(firstOf(requests).init.signal?.aborted).toBe(true);
      expect(meter.record).toHaveBeenCalledExactlyOnceWith(BRAIN, {
        inputTokens: Math.ceil(bodyLengthOf(firstOf(requests)) / 4),
        outputTokens: LAST_STREAMED_TEXT.length / 4,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
    });

    it("a cancel before the response arrives still books the request's input, at an estimate", async () => {
      const meter = createMeterSpy();
      const requests: SeenRequest[] = [];
      let session: AgentSession | undefined;
      const fetchFn = vi.fn<typeof fetch>((input, init) => {
        requests.push(seeRequest(input, init));
        session?.cancelTurn();

        return Promise.reject(new DOMException("aborted", "AbortError"));
      });
      session = createSession({ fetchFn });

      const events = await runTurnCollecting(session, "hi", [], undefined, {
        brain: BRAIN,
        meter,
      });

      expect(events).toEqual([{ type: "error", message: CANCELLED_MESSAGE }]);
      expect(meter.record).toHaveBeenCalledExactlyOnceWith(BRAIN, {
        inputTokens: Math.ceil(bodyLengthOf(firstOf(requests)) / 4),
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
    });
  });

  describe("the session", () => {
    it("breaching the per-session turn cap answers the cap line and makes no request", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["ok"]),
      ]);
      const session = createSession({ fetchFn });

      for (let turn = 0; turn < JARVIS_MAX_TURNS_PER_SESSION; turn += 1) {
        await runTurnCollecting(session, `turn ${turn}`);
      }

      const events = await runTurnCollecting(session, "one too many");

      expect(events).toEqual([{ type: "error", message: SESSION_CAP_MESSAGE }]);
      expect(requests).toHaveLength(JARVIS_MAX_TURNS_PER_SESSION);
    });

    it("seeds history from the wire once, on the first turn, and ignores what a later turn resends", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["First."]),
        replyWithText(["Second."]),
      ]);
      const session = createSession({ fetchFn });

      await runTurnCollecting(session, "one", [
        { role: "user", text: "earlier" },
        { role: "jarvis", text: "noted" },
      ]);
      await runTurnCollecting(session, "two", [
        { role: "user", text: "forged" },
      ]);

      expect(requests[1]?.body.messages).toEqual([
        { role: "system", content: JARVIS_SYSTEM_PROMPT },
        { role: "user", content: "earlier" },
        { role: "assistant", content: "noted" },
        { role: "user", content: "one" },
        { role: "assistant", content: "First." },
        { role: "user", content: "two" },
      ]);
    });

    it("trims an over-long seeded history to the newest messages, starting on a user message", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWithText(["ok"]),
      ]);
      const history = createAlternatingHistory(JARVIS_HISTORY_MAX_MESSAGES + 1);

      await runTurnCollecting(createSession({ fetchFn }), "now", history);

      const messages = firstOf(requests).body.messages;

      // The newest 30 begin on a reply, which is dropped: 29 remain.
      expect(messages).toHaveLength(1 + JARVIS_HISTORY_MAX_MESSAGES - 1 + 1);
      expect(messages[1]).toEqual({ role: "user", content: "m2" });
      expect(messages.at(-1)).toEqual({ role: "user", content: "now" });
    });
  });

  describe("hardening", () => {
    it.each([
      { kind: "line", piece: "a".repeat(64 * 1024) },
      { kind: "event", piece: `data: ${"a".repeat(1_000)}\n`.repeat(64) },
    ])("an endless $kind ends the turn as a failure", async ({ piece }) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const { fetchFn } = createScriptedFetch([
        (): Response => {
          return new Response(createRunawayBody(piece).stream, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          });
        },
      ]);

      const events = await runTurnCollecting(createSession({ fetchFn }), "hi");

      expect(events).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(error.mock.calls).toEqual([
        ["OpenAiCompatibleAgentSession: turn failed —", "RangeError"],
      ]);
    });

    it("a cancel during the last allowed request's tools ends on the cancellation line, not the runway notice", async () => {
      let runs = 0;
      let session: AgentSession | undefined;
      const { fetchFn, requests } = createScriptedFetch([
        replyWithToolCall("call_a", "get_price", { symbol: "EURUSD" }),
      ]);
      session = createSession({
        fetchFn,
        buildTools: () => {
          return [
            createFakeGetPriceTool(async () => {
              runs += 1;

              if (runs === JARVIS_RUNNER_MAX_ITERATIONS) {
                session?.cancelTurn();
              }

              return "1.1";
            }),
          ];
        },
      });

      const events = await runTurnCollecting(session, "loop");

      expect(runs).toBe(JARVIS_RUNNER_MAX_ITERATIONS);
      expect(events.at(-1)).toEqual({
        type: "error",
        message: CANCELLED_MESSAGE,
      });
      expect(events).not.toContainEqual({
        type: "delta",
        text: RUNWAY_EXHAUSTED_NOTICE,
      });

      // A cancelled turn is not kept in the session's history.
      await runTurnCollecting(session, "next");

      expect(requests[JARVIS_RUNNER_MAX_ITERATIONS]?.body.messages).toEqual([
        { role: "system", content: JARVIS_SYSTEM_PROMPT },
        { role: "user", content: "next" },
      ]);
    });

    it("a response that never arrives times out as a failure, not a cancel, and releases its reservation", async () => {
      vi.useFakeTimers();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const meter = createMeterSpy();
      const refused = vi.fn();
      const fetchFn = vi.fn<typeof fetch>((_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        });
      });
      const events: JarvisEvent[] = [];
      let ended = false;

      createSession({ fetchFn })
        .runTurn("hi", [], {
          brain: BRAIN,
          meter,
          keyFailure: { providerName: "OpenAI", refused },
        })
        .subscribe({
          next: (event: JarvisEvent): void => {
            events.push(event);
          },
          complete: (): void => {
            ended = true;
          },
        });

      await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS - 1);

      expect(ended).toBe(false);
      expect(events).toEqual([]);

      await vi.advanceTimersByTimeAsync(1);

      expect(ended).toBe(true);
      expect(events).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(refused).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(1);
      expect(meter.record).not.toHaveBeenCalled();
      expect(meter.endRequest).toHaveBeenCalledTimes(1);
    });

    it("a reported cost is booked at no more than four times the request's listed ceiling", async () => {
      const meter = createMeterSpy();
      const { fetchFn } = createScriptedFetch([
        replyWithText(
          ["ok"],
          createUsageChunk({ prompt: 10, completion: 5, cost: 1e308 }),
        ),
      ]);

      await runTurnCollecting(createSession({ fetchFn }), "hi", [], undefined, {
        brain: BRAIN,
        meter,
      });

      // Haiku's listed ceiling: 15,000 in at $1 and 4,096 out at $5 per
      // million, $0.03548; four of them.
      expect(meter.record.mock.calls[0]?.[1].reportedCostUsd).toBeCloseTo(
        0.14192,
        10,
      );
    });

    it("a reply's tool calls past the cap are not run, and each is answered with a tool error", async () => {
      const toolRun = vi.fn(async () => {
        return "1.1";
      });

      const calls = Array.from({ length: 10 }, (_unused, index) => {
        return createToolCallDeltaChunk(index, {
          id: `call_${index}`,
          name: "get_price",
          arguments: JSON.stringify({ symbol: `S${index}` }),
        });
      });

      const { fetchFn, requests } = createScriptedFetch([
        replyWith([...calls, createFinishChunk("tool_calls")]),
        replyWithText(["Done."]),
      ]);

      await runTurnCollecting(
        createSession({
          fetchFn,
          buildTools: () => {
            return [createFakeGetPriceTool(toolRun)];
          },
        }),
        "quote ten",
      );

      const toolMessages = toolMessagesOf(requests[1]);

      expect(toolRun).toHaveBeenCalledTimes(TOOL_CALLS_PER_REPLY);
      expect(toolMessages).toHaveLength(10);
      expect(
        toolMessages.slice(0, TOOL_CALLS_PER_REPLY).every((message) => {
          return message.content === "1.1";
        }),
      ).toBe(true);
      expect(
        toolMessages.slice(TOOL_CALLS_PER_REPLY).every((message) => {
          return message.content.startsWith("Error: ");
        }),
      ).toBe(true);
    });

    it("tool call ids are made unique: a duplicate, and one that collides with the fallback for a call with none", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWith([
          createToolCallDeltaChunk(0, {
            id: "call_2",
            name: "get_price",
            arguments: '{"symbol":"A"}',
          }),
          createToolCallDeltaChunk(1, {
            id: "call_2",
            name: "get_price",
            arguments: '{"symbol":"B"}',
          }),
          createToolCallDeltaChunk(2, {
            name: "get_price",
            arguments: '{"symbol":"C"}',
          }),
          createFinishChunk("tool_calls"),
        ]),
        replyWithText(["Done."]),
      ]);

      await runTurnCollecting(
        createSession({
          fetchFn,
          buildTools: () => {
            return [
              createFakeGetPriceTool(
                vi.fn(async () => {
                  return "1.1";
                }),
              ),
            ];
          },
        }),
        "quote three",
      );

      const toolIds = toolMessagesOf(requests[1]).map((message) => {
        return message.tool_call_id;
      });
      const assistant = requests[1]?.body.messages.at(-4) as AssistantFixture;

      expect(new Set(toolIds).size).toBe(3);
      expect(
        assistant.tool_calls.map((call) => {
          return call.id;
        }),
      ).toEqual(toolIds);
    });

    it("a call with no name is answered with a tool error and is never sent back nameless", async () => {
      const { fetchFn, requests } = createScriptedFetch([
        replyWith([
          createToolCallDeltaChunk(0, { id: "call_a", arguments: "{}" }),
          createFinishChunk("tool_calls"),
        ]),
        replyWithText(["Hm."]),
      ]);

      const events = await runTurnCollecting(createSession({ fetchFn }), "go");

      const assistant = requests[1]?.body.messages.at(-2) as AssistantFixture;

      expect(assistant.tool_calls[0]?.function.name).not.toBe("");
      expect(toolMessagesOf(requests[1])).toEqual([
        {
          role: "tool",
          tool_call_id: "call_a",
          content: "Error: the call named no tool, so nothing ran.",
        },
      ]);
      expect(
        events.some((event) => {
          return event.type === "toolEvent";
        }),
      ).toBe(false);
    });

    it("a 429 body is read only a few KiB deep: one too long to decide stays the sanitized copy", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const refused = vi.fn();
      const body = createRunawayBody("a".repeat(1_024), {
        prefix: '{"error":{"type":"insufficient_quota","pad":"',
      });

      const fetchFn = vi.fn<typeof fetch>(() => {
        return Promise.resolve(
          new Response(body.stream, {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
        );
      });

      const events = await runTurnCollecting(
        createSession({ fetchFn }),
        "hi",
        [],
        undefined,
        { brain: BRAIN, keyFailure: { providerName: "OpenAI", refused } },
      );

      expect(events).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(refused).not.toHaveBeenCalled();
      expect(body.pulledChars()).toBeLessThanOrEqual(64 * 1024);
    });
  });

  describe("failures", () => {
    it.each([401, 402, 403])(
      "a %i refuses the key: the provider-named error, then refused()",
      async (status) => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const refused = vi.fn();
        const { fetchFn } = createScriptedFetch([
          replyWithStatus(status, {
            error: { message: "SECRET-BODY-TEXT", code: status },
          }),
        ]);

        const events = await runTurnCollecting(
          createSession({ fetchFn }),
          "hi",
          [],
          undefined,
          {
            brain: BRAIN,
            keyFailure: { providerName: "OpenRouter", refused },
          },
        );

        expect(events).toEqual([
          { type: "error", message: "OpenRouter refused your key." },
        ]);
        expect(refused).toHaveBeenCalledTimes(1);
        expect(inspectCalls(error)).not.toContain("SECRET-BODY-TEXT");
        expect(inspectCalls(error)).not.toContain(OWN_KEY);
      },
    );

    it.each([
      { type: "insufficient_quota", code: null },
      { type: "requests", code: "insufficient_quota" },
    ])(
      "OpenAI's 429 out of quota refuses the key (type $type, code $code)",
      async (fields) => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const refused = vi.fn();
        const { fetchFn } = createScriptedFetch([
          replyWithStatus(429, {
            error: { message: "SECRET-BODY-TEXT", ...fields },
          }),
        ]);

        const events = await runTurnCollecting(
          createSession({ fetchFn }),
          "hi",
          [],
          undefined,
          { brain: BRAIN, keyFailure: { providerName: "OpenAI", refused } },
        );

        expect(events).toEqual([
          { type: "error", message: "OpenAI refused your key." },
        ]);
        expect(refused).toHaveBeenCalledTimes(1);
        expect(inspectCalls(error)).not.toContain("insufficient_quota");
        expect(inspectCalls(error)).not.toContain("SECRET-BODY-TEXT");
      },
    );

    it("any other 429 stays the sanitized copy and refuses nothing", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const refused = vi.fn();
      const { fetchFn } = createScriptedFetch([
        replyWithStatus(429, {
          error: { type: "requests", code: "rate_limit_exceeded" },
        }),
      ]);

      const events = await runTurnCollecting(
        createSession({ fetchFn }),
        "hi",
        [],
        undefined,
        { brain: BRAIN, keyFailure: { providerName: "OpenAI", refused } },
      );

      expect(events).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(refused).not.toHaveBeenCalled();
    });

    it("a refusal status on a turn with no key sink stays the sanitized copy", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { fetchFn } = createScriptedFetch([replyWithStatus(401)]);

      const events = await runTurnCollecting(createSession({ fetchFn }), "hi");

      expect(events).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
    });

    it("a 500 is the sanitized copy, and the log carries its status and nothing of the body", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const refused = vi.fn();
      const { fetchFn } = createScriptedFetch([
        replyWithStatus(500, { error: { message: "SECRET-BODY-TEXT" } }),
      ]);

      const events = await runTurnCollecting(
        createSession({ fetchFn }),
        "hi",
        [],
        undefined,
        { brain: BRAIN, keyFailure: { providerName: "OpenAI", refused } },
      );

      expect(events).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(refused).not.toHaveBeenCalled();
      expect(error.mock.calls).toEqual([
        ["OpenAiCompatibleAgentSession: turn failed —", "status 500"],
      ]);
    });

    it("a network failure is the sanitized copy, logged by its error name alone", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchFn = vi.fn<typeof fetch>(() => {
        return Promise.reject(new TypeError("fetch failed: SECRET-BODY-TEXT"));
      });

      const events = await runTurnCollecting(createSession({ fetchFn }), "hi");

      expect(events).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(error.mock.calls).toEqual([
        ["OpenAiCompatibleAgentSession: turn failed —", "TypeError"],
      ]);
    });
  });

  describe("OpenRouter's answers", () => {
    it("a 403 that flags the input for moderation fails the turn with the generic copy, and the key is not refused", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const refused = vi.fn();
      const { fetchFn } = createScriptedFetch([
        replyWithStatus(403, createModerationErrorFixture()),
      ]);

      const events = await runTurnCollecting(
        createSession({ fetchFn }),
        "hi",
        [],
        undefined,
        { brain: BRAIN, keyFailure: { providerName: "OpenRouter", refused } },
      );

      expect(events).toEqual([
        { type: "error", message: DESK_LINK_FALTERED_MESSAGE },
      ]);
      expect(refused).not.toHaveBeenCalled();
      expect(inspectCalls(error)).not.toContain("SECRET-FLAGGED-TEXT");
    });

    it("a 403 with no moderation flag still refuses the key", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const refused = vi.fn();
      const { fetchFn } = createScriptedFetch([
        replyWithStatus(403, {
          error: { code: 403, message: "Key limit exceeded" },
        }),
      ]);

      const events = await runTurnCollecting(
        createSession({ fetchFn }),
        "hi",
        [],
        undefined,
        { brain: BRAIN, keyFailure: { providerName: "OpenRouter", refused } },
      );

      expect(events).toEqual([
        { type: "error", message: "OpenRouter refused your key." },
      ]);
      expect(refused).toHaveBeenCalledTimes(1);
    });

    it("a reported cost below the listed price books the listed price: on a key of the person's own at OpenRouter (BYOK) the cost is OpenRouter's fee alone", async () => {
      const meter = createMeterSpy();
      const { fetchFn } = createScriptedFetch([
        replyWithText(
          ["ok"],
          createUsageChunk({ prompt: 12_000, completion: 1_500, cost: 0 }),
        ),
      ]);

      await runTurnCollecting(createSession({ fetchFn }), "hi", [], undefined, {
        brain: BRAIN,
        meter,
      });

      // Haiku's list: 12,000 in at $1 and 1,500 out at $5 per million.
      expect(meter.record.mock.calls[0]?.[1].reportedCostUsd).toBeCloseTo(
        0.0195,
        12,
      );
    });

    it("BYOK's upstream inference cost is added to the reported cost", async () => {
      const meter = createMeterSpy();
      const { fetchFn } = createScriptedFetch([
        replyWithText(
          ["ok"],
          createUsageChunk({
            prompt: 100,
            completion: 10,
            cost: 0.001,
            upstreamCost: 0.04,
          }),
        ),
      ]);

      await runTurnCollecting(createSession({ fetchFn }), "hi", [], undefined, {
        brain: BRAIN,
        meter,
      });

      expect(meter.record.mock.calls[0]?.[1].reportedCostUsd).toBeCloseTo(
        0.041,
        12,
      );
    });

    it("a dearer endpoint books the cost it reported, above the listed price", async () => {
      const meter = createMeterSpy();
      const { fetchFn } = createScriptedFetch([
        replyWithText(
          ["ok"],
          createUsageChunk({ prompt: 100, completion: 10, cost: 0.05 }),
        ),
      ]);

      await runTurnCollecting(createSession({ fetchFn }), "hi", [], undefined, {
        brain: BRAIN,
        meter,
      });

      expect(meter.record.mock.calls[0]?.[1].reportedCostUsd).toBe(0.05);
    });

    it("a reply past its size cap ends the request as a failure, and what streamed is booked", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const meter = createMeterSpy();
      // 100 chunks of 1,000 characters: far past what 4,096 tokens make.
      const { fetchFn } = createScriptedFetch([
        replyWith(
          Array.from({ length: 100 }, () => {
            return createTextChunk("x".repeat(1_000));
          }),
        ),
      ]);

      const events = await runTurnCollecting(
        createSession({ fetchFn }),
        "hi",
        [],
        undefined,
        { brain: BRAIN, meter },
      );

      const deltas = events.filter((event) => {
        return event.type === "delta";
      });

      expect(events.at(-1)).toEqual({
        type: "error",
        message: DESK_LINK_FALTERED_MESSAGE,
      });
      expect(deltas.length).toBeLessThanOrEqual(REPLY_CAP_CHARS / 1_000);
      expect(meter.record).toHaveBeenCalledTimes(1);
    });

    it("tool-call names count toward a reply's size cap, before more announcements go out", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      // One call, renamed in chunk after chunk: past the cap in names alone.
      const { fetchFn } = createScriptedFetch([
        replyWith([
          ...Array.from({ length: 100 }, () => {
            return createToolCallDeltaChunk(0, { name: "n".repeat(1_000) });
          }),
          createFinishChunk("tool_calls"),
        ]),
      ]);

      const events = await runTurnCollecting(createSession({ fetchFn }), "hi");

      expect(events.at(-1)).toEqual({
        type: "error",
        message: DESK_LINK_FALTERED_MESSAGE,
      });
    });

    it("a reply announcing more distinct tool calls than the cap allows fails before their frames go out", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { fetchFn } = createScriptedFetch([
        replyWith([
          ...Array.from({ length: 1_000 }, (_unused, index) => {
            return createToolCallDeltaChunk(index, { name: "get_price" });
          }),
          createFinishChunk("tool_calls"),
        ]),
      ]);

      const events = await runTurnCollecting(createSession({ fetchFn }), "hi");
      const announced = events.filter((event) => {
        return event.type === "toolEvent";
      });

      expect(events.at(-1)).toEqual({
        type: "error",
        message: DESK_LINK_FALTERED_MESSAGE,
      });
      expect(announced.length).toBeLessThanOrEqual(REPLY_TOOL_CALL_INDEXES_MAX);
    });

    it("tool-call arguments count toward a reply's size cap", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const toolRun = vi.fn(async () => {
        return "1.1";
      });

      const { fetchFn, requests } = createScriptedFetch([
        replyWith([
          createToolCallDeltaChunk(0, {
            id: "call_a",
            name: "get_price",
            arguments: "",
          }),
          ...Array.from({ length: 100 }, () => {
            return createToolCallDeltaChunk(0, {
              arguments: " ".repeat(1_000),
            });
          }),
          createFinishChunk("tool_calls"),
        ]),
        replyWithText(["never asked for"]),
      ]);

      const events = await runTurnCollecting(
        createSession({
          fetchFn,
          buildTools: () => {
            return [createFakeGetPriceTool(toolRun)];
          },
        }),
        "hi",
      );

      expect(events.at(-1)).toEqual({
        type: "error",
        message: DESK_LINK_FALTERED_MESSAGE,
      });
      expect(toolRun).not.toHaveBeenCalled();
      expect(requests).toHaveLength(1);
    });
  });
});

// ── fake-fetch scripting helpers ───────────────────────────────────────
//
// None of these reach a network: every test injects `fetchFn`.

interface ChatToolFixture {
  readonly type: string;
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: unknown;
  };
}

interface ChatRequestFixture {
  readonly model: string;
  readonly messages: readonly unknown[];
  readonly tools: readonly ChatToolFixture[];
  readonly stream: boolean;
  readonly [field: string]: unknown;
}

interface SeenRequest {
  readonly url: string;
  readonly init: RequestInit;
  readonly headers: Headers;
  readonly body: ChatRequestFixture;
}

type FetchReply = (request: SeenRequest) => Response | Promise<Response>;

interface ScriptedFetch {
  readonly fetchFn: typeof fetch;
  readonly requests: SeenRequest[];
}

interface UsageFixture {
  readonly prompt: number;
  readonly completion: number;
  readonly cost?: number;
  /** OpenRouter's `cost_details.upstream_inference_cost` (BYOK). */
  readonly upstreamCost?: number;
}

interface ToolCallFragment {
  readonly id?: string;
  readonly name?: string;
  readonly arguments?: string;
}

interface TradeInputFixture {
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
}

interface GetPriceInput {
  readonly symbol: string;
}

interface SessionFixtureOptions {
  readonly fetchFn: typeof fetch;
  readonly config?: OpenAiCompatibleConfig;
  readonly buildTools?: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[];
  readonly knownSymbols?: readonly string[];
}

interface MeterSpy extends TurnMeter {
  readonly beginRequest: Mock<TurnMeter["beginRequest"]>;
  readonly record: Mock<TurnMeter["record"]>;
  readonly endRequest: Mock<TurnMeter["endRequest"]>;
}

interface ToolMessageFixture {
  readonly role: string;
  readonly tool_call_id: string;
  readonly content: string;
}

interface AssistantFixture {
  readonly tool_calls: readonly {
    readonly id: string;
    readonly function: { readonly name: string };
  }[];
}

interface RunawayBodyOptions {
  readonly prefix?: string;
}

interface RunawayBody {
  readonly stream: ReadableStream<Uint8Array>;
  readonly pulledChars: () => number;
}

interface OpenSocketFixture {
  subscription?: Subscription;
}

interface Settler<T> {
  settle?: (value: T) => void;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function createSession(options: SessionFixtureOptions): AgentSession {
  return new OpenAiCompatibleAgentLoop({
    config: options.config ?? createConfigFixture(),
    key: OWN_KEY,
    buildTools:
      options.buildTools ??
      ((): readonly JarvisToolDefinition[] => {
        return [];
      }),
    knownSymbols: options.knownSymbols ?? [],
    fetchFn: options.fetchFn,
  }).createSession();
}

function createConfigFixture(
  overrides: Partial<OpenAiCompatibleConfig> = {},
): OpenAiCompatibleConfig {
  return {
    baseUrl: "https://llm.example.test/api/v1",
    headers: { "X-Title": "Reactive Trader" },
    tokenLimitParam: "max_completion_tokens",
    extraBody: { usage: { include: true } },
    ...overrides,
  };
}

function seeRequest(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
): SeenRequest {
  const seenInit = init ?? {};

  return {
    url: input instanceof Request ? input.url : String(input),
    init: seenInit,
    headers: new Headers(seenInit.headers),
    body: JSON.parse(String(seenInit.body)) as ChatRequestFixture,
  };
}

/** Answers each request with the next reply; once they run out, the last
 * one answers every further request. */
function createScriptedFetch(replies: readonly FetchReply[]): ScriptedFetch {
  const requests: SeenRequest[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const request = seeRequest(input, init);
    const reply = replies[Math.min(requests.length, replies.length - 1)];
    requests.push(request);

    if (reply === undefined) {
      throw new Error("no reply scripted");
    }

    return reply(request);
  });

  return { fetchFn, requests };
}

function encodeSse(chunks: readonly unknown[], done: boolean): string {
  const lines = chunks.map((chunk) => {
    return `data: ${JSON.stringify(chunk)}\n\n`;
  });

  return lines.join("") + (done ? "data: [DONE]\n\n" : "");
}

function replyWith(chunks: readonly unknown[]): FetchReply {
  return () => {
    return new Response(encodeSse(chunks, true), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
}

function replyWithText(
  parts: readonly string[],
  usage: unknown = createUsageChunk({ prompt: 10, completion: 5 }),
): FetchReply {
  return replyWith([
    ...parts.map(createTextChunk),
    createFinishChunk("stop"),
    usage,
  ]);
}

function replyWithToolCall(
  id: string,
  name: string,
  input: unknown,
  usage: unknown = createUsageChunk({ prompt: 10, completion: 5 }),
): FetchReply {
  return replyWith([
    createToolCallDeltaChunk(0, {
      id,
      name,
      arguments: JSON.stringify(input),
    }),
    createFinishChunk("tool_calls"),
    usage,
  ]);
}

function replyWithStatus(status: number, body: unknown = {}): FetchReply {
  return () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

/** Streams `chunks`, then never closes: only the turn's abort ends it. */
function replyWithHangingStream(chunks: readonly unknown[]): FetchReply {
  return () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller: ReadableStreamDefaultController<Uint8Array>): void {
        controller.enqueue(new TextEncoder().encode(encodeSse(chunks, false)));
      },
    });

    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
}

function createTextChunk(text: string): unknown {
  return {
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  };
}

function createFinishChunk(reason: string): unknown {
  return { choices: [{ index: 0, delta: {}, finish_reason: reason }] };
}

function createUsageChunk(usage: UsageFixture): unknown {
  return {
    choices: [],
    usage: {
      prompt_tokens: usage.prompt,
      completion_tokens: usage.completion,
      total_tokens: usage.prompt + usage.completion,
      ...(usage.cost === undefined ? {} : { cost: usage.cost }),
      ...(usage.upstreamCost === undefined
        ? {}
        : { cost_details: { upstream_inference_cost: usage.upstreamCost } }),
    },
  };
}

/** OpenRouter's 403 for input its moderation flagged. */
function createModerationErrorFixture(): unknown {
  return {
    error: {
      code: 403,
      message:
        "Your chosen model requires moderation and your input was flagged",
      metadata: {
        reasons: ["violence"],
        flagged_input: "SECRET-FLAGGED-TEXT",
        provider_name: "Example",
        model_slug: "example/model",
      },
    },
  };
}

function createToolCallDeltaChunk(
  index: number,
  fragment: ToolCallFragment,
): unknown {
  return {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index,
              ...(fragment.id === undefined
                ? {}
                : { id: fragment.id, type: "function" }),
              function: {
                ...(fragment.name === undefined ? {} : { name: fragment.name }),
                ...(fragment.arguments === undefined
                  ? {}
                  : { arguments: fragment.arguments }),
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
}

function firstOf(requests: readonly SeenRequest[]): SeenRequest {
  const first = requests[0];

  if (first === undefined) {
    throw new Error("expected a request");
  }

  return first;
}

function bodyLengthOf(request: SeenRequest): number {
  return String(request.init.body).length;
}

function inspectCalls(spy: Mock): string {
  return JSON.stringify(spy.mock.calls);
}

function createAlternatingHistory(length: number): JarvisHistoryEntry[] {
  return Array.from({ length }, (_unused, index) => {
    return { role: index % 2 === 0 ? "user" : "jarvis", text: `m${index}` };
  });
}

/** Subscribes to one turn, collecting every emitted `JarvisEvent`; `onEvent`
 * runs synchronously as each event arrives, the way a client reacts. */
function runTurnCollecting(
  session: AgentSession,
  text: string,
  history: readonly JarvisHistoryEntry[] = [],
  onEvent?: (event: JarvisEvent) => void,
  options: JarvisTurnOptions = OPTIONS,
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

function createDeferred<T>(): Deferred<T> {
  const holder: Settler<T> = {};
  const promise = new Promise<T>((settle) => {
    holder.settle = settle;
  });

  return {
    promise,
    resolve: (value: T): void => {
      holder.settle?.(value);
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

/** A turn meter that records every request; `exhaustedAnswers` are what it
 * says when asked, in order, the last repeating (never spent by default). */
function createMeterSpy(exhaustedAnswers: readonly boolean[] = []): MeterSpy {
  let asked = 0;

  return {
    beginRequest: vi.fn<TurnMeter["beginRequest"]>(),
    record: vi.fn<TurnMeter["record"]>(),
    endRequest: vi.fn<TurnMeter["endRequest"]>(),
    exhausted: (): boolean => {
      const answer =
        exhaustedAnswers[Math.min(asked, exhaustedAnswers.length - 1)];
      asked += 1;

      return answer ?? false;
    },
  };
}

function createFakeGetPriceTool(
  run: (input: unknown) => Promise<string>,
): JarvisToolDefinition {
  return {
    name: "get_price",
    description: "fake get_price for OpenAiCompatibleAgentLoop tests",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
      additionalProperties: false,
    },
    run,
  };
}

const TRADE_SCHEMA = {
  type: "object",
  properties: {
    symbol: { type: "string" },
    direction: { type: "string" },
    notional: { type: "number" },
  },
  required: ["symbol", "direction", "notional"],
  additionalProperties: false,
};

/** A minimal stand-in for `execute_trade`: it awaits the confirm gate the
 * desk wires in and reports a fill or a decline like the real one. */
function createFakeExecuteTradeTool(
  confirmTrade: ConfirmGate,
  onExecute: () => void,
): JarvisToolDefinition {
  return {
    name: "execute_trade",
    description: "fake execute_trade for OpenAiCompatibleAgentLoop tests",
    inputSchema: TRADE_SCHEMA,
    run: async () => {
      const approved = await confirmTrade(TRADE_DETAILS);

      if (!approved) {
        return "The user declined the trade — nothing was executed.";
      }

      onExecute();

      return JSON.stringify({ tradeId: "T-1", status: "Filled" });
    },
  };
}

/** An `execute_trade` whose quote takes `QUOTE_DELAY_MS` before its gate, as
 * the real one's does; `onStarted` runs as it begins, `answers` gets what the
 * gate said. */
function createSlowTradeTool(
  confirmTrade: ConfirmGate,
  answers: boolean[],
  onStarted: () => void,
): JarvisToolDefinition {
  return {
    name: "execute_trade",
    description: "slow fake execute_trade for OpenAiCompatibleAgentLoop tests",
    inputSchema: TRADE_SCHEMA,
    run: async () => {
      onStarted();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, QUOTE_DELAY_MS);
      });
      const approved = await confirmTrade(TRADE_DETAILS);
      answers.push(approved);

      return approved ? "filled" : "declined";
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

const OWN_KEY = "sk-own-test";

/** A chunk in the usage chunk's place that reports none. */
const NO_USAGE_CHUNK = { choices: [] };

/** The loop is provider-blind, so a listed Anthropic model stands in for the
 * OpenRouter and OpenAI ones; its prices are the ones the cost tests use. */
const BRAIN: JarvisOwnBrain = "own:anthropic:claude-haiku-4-5";

const OPTIONS: JarvisTurnOptions = { brain: BRAIN };

/** The most generated characters one reply may stream: four times what the
 * turn's token limit makes at the estimate of four characters a token. */
const REPLY_CAP_CHARS = 4 * 4_096 * 4;

/** The most distinct tool calls one reply may announce: four times the
 * calls a reply may run. */
const REPLY_TOOL_CALL_INDEXES_MAX = 4 * 8;

const TRADE_INPUT: TradeInputFixture = {
  symbol: "EURUSD",
  direction: Direction.Buy,
  notional: 1_000_000,
};

const TRADE_DETAILS: JarvisConfirmDetails = {
  ...TRADE_INPUT,
  quotedPrice: 1.1,
  ratePrecision: 4,
};

/** How long the slow trade tool's quote takes before its gate. */
const QUOTE_DELAY_MS = 1_000;

/** 20 characters; the cancel test stops the turn when it streams. */
const LAST_STREAMED_TEXT = "b".repeat(20);

/** The worst case a request is reserved at: 15k input tokens and the
 * per-request output cap. */
const REQUEST_CEILING = {
  inputTokens: 15_000,
  outputTokens: 4_096,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

function toolMessagesOf(
  request: SeenRequest | undefined,
): ToolMessageFixture[] {
  return (request?.body.messages ?? []).filter((message) => {
    return (message as ToolMessageFixture).role === "tool";
  }) as ToolMessageFixture[];
}

/** A body that sends `prefix`, then repeats `piece` on every pull up to
 * 8 MiB, counting what it sent. */
function createRunawayBody(
  piece: string,
  options: RunawayBodyOptions = {},
): RunawayBody {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(piece);
  const limit = 8 * 1024 * 1024;
  let pulled = 0;
  let started = false;

  return {
    stream: new ReadableStream<Uint8Array>({
      pull(controller: ReadableStreamDefaultController<Uint8Array>): void {
        if (!started && options.prefix !== undefined) {
          started = true;
          pulled += options.prefix.length;
          controller.enqueue(encoder.encode(options.prefix));

          return;
        }

        if (pulled >= limit) {
          controller.close();

          return;
        }

        pulled += bytes.length;
        controller.enqueue(bytes);
      },
    }),
    pulledChars: (): number => {
      return pulled;
    },
  };
}

/** How long a request may wait for its response: the Anthropic SDK's own
 * default, ten minutes. */
const RESPONSE_TIMEOUT_MS = 600_000;

/** The most tool calls one reply may have run. */
const TOOL_CALLS_PER_REPLY = 8;
