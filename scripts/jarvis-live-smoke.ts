#!/usr/bin/env tsx
/**
 * Manual, key-gated live smoke test for the Anthropic-backed Jarvis loop
 * (`AnthropicAgentLoop` / `AnthropicAgentSession`, packages/server/src/agent).
 *
 * NOT run by CI (no `ANTHROPIC_API_KEY` there, and every turn below is a
 * REAL, metered API call) — this is a human-invoked tool
 * (`pnpm jarvis:smoke:live`) for exercising the real loop end to end before
 * shipping a change that touches it. Refuses immediately, before spawning
 * anything, when `ANTHROPIC_API_KEY` is unset.
 *
 * It boots the REAL server from source (mirrors `startServer` /
 * `stopProcess` in tests/fullstack/_orchestration.ts: detached child,
 * process-group kill on teardown) on a scratch port, logs in for a real
 * session token (mirrors tests/fullstack/loginForToken.ts), then drives the
 * `jarvis.*` wire protocol over a raw `WebSocket` — no client package, no
 * mocks:
 *
 *   1. `jarvis.subscribe` → assert `jarvis.availability` reports `true`.
 *   2. One quote turn ("Where is EURUSD?") — streamed events printed
 *      compactly (aggregated delta text, `[tool:status]` lines, the
 *      terminal done/error frame).
 *   3. One trade turn ("Buy 1M EURUSD") that DECLINES the confirmation
 *      (`jarvis.confirm { approved: false }` as soon as a confirmRequest
 *      arrives) — asserts the declined tool-result still produces a reply.
 *   4. A FRESH WebSocket connection (same login token, new server-side
 *      `AgentSession` — `jarvisEffects`' `jarvisSessionEffect` mints one per
 *      socket) carrying turns 1-3 as wire `history`, stretched with synthetic
 *      filler so the server's own 20-entry wire cap
 *      (`JARVIS_WIRE_HISTORY_MAX_ENTRIES` in jarvis.effects.ts) truncates it
 *      into an assistant-first array *before* it ever reaches
 *      `AnthropicAgentSession`.
 *
 * Turn 4 exists specifically to exercise, against the real API, the two
 * mechanisms the Task 6 reviewer flagged as "documented but cannot verify
 * without a live key": `AnthropicAgentSession.capMessages`'s assistant-first
 * `400` guard, and `JARVIS_HISTORY_MAX_MESSAGES` token-pressure trimming.
 * Both need a FRESH connection to matter: `AnthropicAgentSession` only
 * consults the wire's `history` param on a session's first turn (once its own
 * `this.history` is non-empty, later turns use that instead — see the doc
 * comment on `runTurn`) — reusing turns 1-3's connection for turn 4 would
 * make the constructed `history` payload below silently ignored, so this
 * check would pass even with the guard deleted. A fresh connection = a fresh
 * session = the wire history is genuinely consulted, which is exactly the
 * reconnect-mid-conversation scenario the guard's own doc comment describes.
 * The fixture itself is engineered so the guard strips exactly two leading
 * "jarvis" entries (not one) — see `buildReconnectHistoryFixture`'s comment
 * for why an even count matters: an odd count would leave a kept array that
 * ends on "user", and appending the new turn's own user message would then
 * trip the Anthropic API's *separate* "roles must alternate" 400 — a
 * different failure this check must not be confused by.
 *
 * This is deliberately dependency-free (no `@rtc/*` import): the
 * `CLIENT_MSG` / `SERVER_MSG` / `JarvisEvent` wire vocabulary below is a
 * narrow, hand-mirrored slice of packages/shared/src/protocol/messages.ts
 * and packages/shared/src/jarvis/jarvisEvent.ts, so this script never needs
 * `@rtc/shared` built first — see those files if the two drift.
 *
 * Exits non-zero on refusal, on any hard error (a turn timing out, the
 * overall 120s budget expiring), or when any assertion fails. Always prints
 * a final PASS/FAIL summary.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Env gate — runs before anything else spawns or connects ────────

const ANTHROPIC_API_KEY: string | undefined = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error(
    "jarvis-live-smoke: ANTHROPIC_API_KEY is not set — refusing to run.\n" +
      "This script makes REAL, metered calls against the Anthropic API via\n" +
      "the server's AnthropicAgentLoop. Set ANTHROPIC_API_KEY in your shell\n" +
      "and re-run: ANTHROPIC_API_KEY=sk-ant-... pnpm jarvis:smoke:live",
  );
  process.exit(1);
}

// ── Wire vocabulary (hand-mirrored — see header comment) ───────────

const CLIENT_MSG = {
  JARVIS_CHAT: "jarvis.chat",
  JARVIS_CONFIRM: "jarvis.confirm",
  JARVIS_SUBSCRIBE: "jarvis.subscribe",
} as const;

const SERVER_MSG = {
  JARVIS_DELTA: "jarvis.delta",
  JARVIS_TOOL_EVENT: "jarvis.toolEvent",
  JARVIS_CONFIRM_REQUEST: "jarvis.confirmRequest",
  JARVIS_DONE: "jarvis.done",
  JARVIS_ERROR: "jarvis.error",
  JARVIS_AVAILABILITY: "jarvis.availability",
} as const;

interface HistoryEntry {
  readonly role: "user" | "jarvis";
  readonly text: string;
}

interface ConfirmRequestPayload {
  readonly turnId: string;
  readonly confirmationId: string;
  readonly symbol: string;
  readonly direction: string;
  readonly notional: number;
  readonly quotedPrice: number;
  readonly ratePrecision: number;
}

interface LoginResponse {
  readonly token: string;
  readonly exp: number;
}

interface AvailabilityFramePayload {
  readonly available: boolean;
}

interface DeltaFramePayload {
  readonly turnId: string;
  readonly text: string;
}

interface ToolEventFramePayload {
  readonly turnId: string;
  readonly tool: string;
  readonly status: string;
}

interface DoneFramePayload {
  readonly turnId: string;
}

interface ErrorFramePayload {
  readonly turnId: string;
  readonly message: string;
}

interface ChatPayload {
  readonly text: string;
  readonly turnId: string;
  readonly history?: readonly HistoryEntry[];
}

// ── Config ───────────────────────────────────────────────────────

const HOST = "127.0.0.1";
// Fixed rather than env-configurable (unlike the fullstack smokes'
// FULLSTACK_PORT): this is a manual, one-at-a-time tool, and a fixed scratch
// port distinct from node-smoke's 4123 / browser-smoke's 4124 is enough to
// avoid collisions without adding another turbo.json passthrough var.
const PORT = 4125;
const AUTH_SECRET = "jarvis-live-smoke-secret";
const AUTH_USERS = "demo:demo";
const TURN_TIMEOUT_MS = 60_000;
const OVERALL_TIMEOUT_MS = 120_000;

const MONOREPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..");

// ── Process orchestration (mirrors tests/fullstack/_orchestration.ts) ──

function startServer(): ChildProcess {
  return spawn(
    "pnpm",
    ["--filter", "@rtc/server", "exec", "tsx", "src/index.ts"],
    {
      cwd: MONOREPO_ROOT,
      stdio: "ignore",
      // Detached so stopServer can kill the whole group (the real server
      // runs as a grandchild of this `pnpm` wrapper, which doesn't forward
      // signals).
      detached: true,
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: HOST,
        NODE_OPTIONS: "",
        AUTH_SECRET,
        AUTH_USERS,
        ANTHROPIC_API_KEY,
        // Force the real Anthropic branch of createAgentLoop even if the
        // caller's shell has RTC_JARVIS_FAKE=1 exported from an unrelated
        // dev session — this script exists specifically to exercise the
        // Anthropic loop, not the scripted stand-in.
        RTC_JARVIS_FAKE: "",
      },
    },
  );
}

function stopServer(child: ChildProcess | undefined): Promise<void> {
  return new Promise((resolve) => {
    const pid = child?.pid;

    if (!child || child.exitCode !== null || pid === undefined) {
      resolve();
      return;
    }

    const groupPid = pid;

    function killGroup(signal: NodeJS.Signals): void {
      try {
        process.kill(-groupPid, signal);
      } catch {
        // group already gone
      }
    }

    const kill = setTimeout(() => {
      killGroup("SIGKILL");
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(kill);
      resolve();
    });
    killGroup("SIGTERM");
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" });

      if (res.status < 500) {
        return;
      }
    } catch {
      // not up yet
    }

    await sleep(250);
  }

  throw new Error(`${url} not reachable after ${timeoutMs}ms`);
}

async function loginForToken(httpBaseUrl: string): Promise<LoginResponse> {
  const response = await fetch(`${httpBaseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "demo", password: "demo" }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `POST ${httpBaseUrl}/login failed: ${response.status} ${bodyText}`,
    );
  }

  return (await response.json()) as LoginResponse;
}

// ── Wire frame bus ───────────────────────────────────────────────

interface WireFrame {
  readonly type: string;
  readonly payload?: unknown;
}

type FrameHandler = (payload: unknown) => void;

interface FrameBus {
  on(type: string, handler: FrameHandler): () => void;
}

function createFrameBus(ws: WebSocket): FrameBus {
  const handlers = new Map<string, Set<FrameHandler>>();

  ws.addEventListener("message", (event: MessageEvent) => {
    let frame: WireFrame;

    try {
      frame = JSON.parse(String(event.data)) as WireFrame;
    } catch {
      return;
    }

    const set = handlers.get(frame.type);

    if (!set) {
      return;
    }

    for (const handler of set) {
      handler(frame.payload);
    }
  });

  function on(type: string, handler: FrameHandler): () => void {
    let set = handlers.get(type);

    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }

    const activeSet = set;
    activeSet.add(handler);

    return (): void => {
      activeSet.delete(handler);
    };
  }

  return { on };
}

function sendFrame(ws: WebSocket, type: string, payload?: unknown): void {
  ws.send(JSON.stringify(payload === undefined ? { type } : { type, payload }));
}

function openSocket(url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`WebSocket open timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve(ws);
      },
      { once: true },
    );
    ws.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("WebSocket failed to open"));
      },
      { once: true },
    );
  });
}

// ── Availability handshake ──────────────────────────────────────

function checkAvailability(bus: FrameBus, ws: WebSocket): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unregister();
      reject(new Error("timed out waiting for jarvis.availability"));
    }, 15_000);

    const unregister = bus.on(SERVER_MSG.JARVIS_AVAILABILITY, (payload) => {
      const { available } = payload as AvailabilityFramePayload;
      clearTimeout(timer);
      unregister();
      resolve(available);
    });

    sendFrame(ws, CLIENT_MSG.JARVIS_SUBSCRIBE);
  });
}

// ── Chat turns ───────────────────────────────────────────────────

interface ChatTurnOutcome {
  readonly replyText: string;
  readonly toolEvents: readonly string[];
  readonly confirmationSeen: boolean;
  readonly terminal: "done" | "error";
  readonly errorMessage?: string;
}

function buildChatPayload(
  text: string,
  turnId: string,
  history: readonly HistoryEntry[],
): ChatPayload {
  return history.length > 0 ? { text, turnId, history } : { text, turnId };
}

/**
 * Runs one `jarvis.chat` turn to completion, printing streamed events
 * compactly: tool events live as `[tool:status]`, then the aggregated reply
 * text and terminal frame once `done`/`error` lands. `onConfirmRequest`, if
 * given, is invoked synchronously when a `confirmRequest` frame arrives —
 * the trade turn below uses it to decline.
 */
function runChatTurn(
  bus: FrameBus,
  ws: WebSocket,
  label: string,
  text: string,
  history: readonly HistoryEntry[],
  onConfirmRequest?: (payload: ConfirmRequestPayload) => void,
): Promise<ChatTurnOutcome> {
  const turnId = crypto.randomUUID();

  console.log(`\n--- turn: ${label} ---`);
  console.log(`  > ${text}`);

  return new Promise((resolve, reject) => {
    let replyText = "";
    const toolEvents: string[] = [];
    let confirmationSeen = false;

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `chat turn "${label}" timed out after ${TURN_TIMEOUT_MS}ms (turnId=${turnId})`,
        ),
      );
    }, TURN_TIMEOUT_MS);

    const unsubDelta = bus.on(SERVER_MSG.JARVIS_DELTA, (payload) => {
      const p = payload as DeltaFramePayload;

      if (p.turnId === turnId) {
        replyText += p.text;
      }
    });

    const unsubTool = bus.on(SERVER_MSG.JARVIS_TOOL_EVENT, (payload) => {
      const p = payload as ToolEventFramePayload;

      if (p.turnId !== turnId) {
        return;
      }

      const line = `[${p.tool}:${p.status}]`;
      toolEvents.push(line);
      console.log(`  ${line}`);
    });

    const unsubConfirm = bus.on(
      SERVER_MSG.JARVIS_CONFIRM_REQUEST,
      (payload) => {
        const p = payload as ConfirmRequestPayload;

        if (p.turnId !== turnId) {
          return;
        }

        confirmationSeen = true;
        console.log(
          `  [confirmRequest] ${p.direction} ${p.notional} ${p.symbol} @ ${p.quotedPrice.toFixed(p.ratePrecision)} (id=${p.confirmationId})`,
        );
        onConfirmRequest?.(p);
      },
    );

    const unsubDone = bus.on(SERVER_MSG.JARVIS_DONE, (payload) => {
      const p = payload as DoneFramePayload;

      if (p.turnId !== turnId) {
        return;
      }

      clearTimeout(timer);
      cleanup();
      console.log(`  < ${replyText}`);
      console.log("  [done]");
      resolve({ replyText, toolEvents, confirmationSeen, terminal: "done" });
    });

    const unsubError = bus.on(SERVER_MSG.JARVIS_ERROR, (payload) => {
      const p = payload as ErrorFramePayload;

      if (p.turnId !== turnId) {
        return;
      }

      clearTimeout(timer);
      cleanup();
      console.log(`  [error] ${p.message}`);
      resolve({
        replyText,
        toolEvents,
        confirmationSeen,
        terminal: "error",
        errorMessage: p.message,
      });
    });

    function cleanup(): void {
      unsubDelta();
      unsubTool();
      unsubConfirm();
      unsubDone();
      unsubError();
    }

    sendFrame(
      ws,
      CLIENT_MSG.JARVIS_CHAT,
      buildChatPayload(text, turnId, history),
    );
  });
}

// ── Reconnect history fixture (check 4) ─────────────────────────

/**
 * Builds the wire `history` for check 4's fresh-connection quote turn.
 * Deliberately 21 entries — one more than `JARVIS_WIRE_HISTORY_MAX_ENTRIES`
 * (20, see jarvis.effects.ts) — so the server's own `truncateHistory` drops
 * exactly the leading synthetic entry below and hands
 * `AnthropicAgentSession` a 20-entry array whose first TWO entries are
 * "jarvis" (assistant).
 *
 * Two leading assistant entries, not one: `capMessages`' guard
 * (`while (capped[0]?.role === "assistant") capped.shift()`) removes both,
 * leaving an 18-entry kept array. 18 is EVEN, so — since it starts on
 * "user" — it still ends on "jarvis" (an alternating sequence flips role
 * every step; odd length flips the edges, even length doesn't). That matters
 * because `AnthropicAgentSession.runTurn` appends the new turn's OWN "user"
 * message straight onto whatever capMessages returns: if the guard had only
 * had ONE leading assistant entry to strip, the kept array would be
 * ODD-length and would end on "user" — and appending another "user" message
 * after that would trip the Anthropic API's separate "roles must alternate"
 * 400 (confirmed live behavior, not just this repo's own guard), which is a
 * DIFFERENT failure than the one this check exists to rule out. Ending on
 * "jarvis" keeps the tail valid so a 400 here can only mean the
 * assistant-first guard itself regressed.
 *
 * The real conversation from checks 2-3 (turns 1 and 3 below) closes out the
 * array, so the fixture is a superset of real Jarvis output, not a purely
 * synthetic one.
 */
function buildReconnectHistoryFixture(
  quoteReplyText: string,
  tradeReplyText: string,
): HistoryEntry[] {
  const fixture: HistoryEntry[] = [
    // Dropped entirely by the server's own 20-entry wire cap — exists only
    // to push this array to 21 entries so the cap's slice(-20) removes
    // exactly this one entry and nothing else.
    { role: "user", text: "(stale pre-cap context, expected to be dropped)" },
    // Survive the cap and land at the front of the kept 20-entry window —
    // the assistant-first array `capMessages`' guard exists for.
    { role: "jarvis", text: "(stray reply A — pre-guard artifact)" },
    { role: "jarvis", text: "(stray reply B — pre-guard artifact)" },
  ];

  for (let i = 0; i < 7; i += 1) {
    fixture.push({ role: "user", text: `(filler question ${i})` });
    fixture.push({ role: "jarvis", text: `(filler reply ${i})` });
  }

  fixture.push(
    { role: "user", text: "Where is EURUSD?" },
    { role: "jarvis", text: quoteReplyText },
    { role: "user", text: "Buy 1M EURUSD" },
    { role: "jarvis", text: tradeReplyText },
  );

  return fixture;
}

// ── Checks ───────────────────────────────────────────────────────

interface CheckResult {
  readonly name: string;
  readonly pass: boolean;
}

function check(results: CheckResult[], name: string, pass: boolean): void {
  results.push({ name, pass });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}`);
}

function printSummary(
  results: readonly CheckResult[],
  hardError: unknown,
): void {
  console.log("\n=== jarvis-live-smoke summary ===");

  for (const result of results) {
    console.log(`  [${result.pass ? "PASS" : "FAIL"}] ${result.name}`);
  }

  if (hardError !== undefined) {
    console.log(`  [FAIL] run aborted: ${String(hardError)}`);
  }

  const failed =
    hardError !== undefined ||
    results.some((r) => {
      return !r.pass;
    });
  console.log(failed ? "jarvis-live-smoke: FAIL" : "jarvis-live-smoke: PASS");
}

// ── Main ─────────────────────────────────────────────────────────

async function runAllChecks(results: CheckResult[]): Promise<void> {
  const httpBase = `http://${HOST}:${PORT}`;

  await waitForHealth(`${httpBase}/health`, 30_000);
  const login = await loginForToken(httpBase);
  const wsUrl = `ws://${HOST}:${PORT}/?access=${encodeURIComponent(login.token)}`;

  const ws1 = await openSocket(wsUrl, 15_000);
  const bus1 = createFrameBus(ws1);
  let quoteReplyText = "";
  let tradeReplyText = "";

  try {
    // 1. Availability handshake.
    const available = await checkAvailability(bus1, ws1);
    check(
      results,
      "availability: jarvis.subscribe reports available=true",
      available,
    );

    // 2. Quote turn.
    const quote = await runChatTurn(bus1, ws1, "quote", "Where is EURUSD?", []);
    check(
      results,
      "quote turn: terminated with done and a non-empty reply",
      quote.terminal === "done" && quote.replyText.length > 0,
    );
    quoteReplyText = quote.replyText;

    // 3. Trade turn — decline the confirmation as soon as it arrives.
    const trade = await runChatTurn(
      bus1,
      ws1,
      "trade (declined)",
      "Buy 1M EURUSD",
      [
        { role: "user", text: "Where is EURUSD?" },
        { role: "jarvis", text: quoteReplyText },
      ],
      (payload) => {
        sendFrame(ws1, CLIENT_MSG.JARVIS_CONFIRM, {
          confirmationId: payload.confirmationId,
          approved: false,
        });
      },
    );
    check(
      results,
      "trade turn: model requested confirmation (confirmRequest observed)",
      trade.confirmationSeen,
    );
    check(
      results,
      "trade turn: declined tool-result still produced a done reply",
      trade.terminal === "done" && trade.replyText.length > 0,
    );
    tradeReplyText = trade.replyText;
  } finally {
    ws1.close();
  }

  // 4. Reconnect (fresh WebSocket = fresh server-side AgentSession) and send
  // a quote turn carrying a wire history built to force an assistant-first
  // array through the 20-entry wire cap — see buildReconnectHistoryFixture's
  // doc comment. Reuses the same login token; a new session never needs a
  // fresh one.
  const ws2 = await openSocket(wsUrl, 15_000);
  const bus2 = createFrameBus(ws2);

  try {
    const reconnectHistory = buildReconnectHistoryFixture(
      quoteReplyText,
      tradeReplyText,
    );

    const followUp = await runChatTurn(
      bus2,
      ws2,
      "quote on fresh session with assistant-first-forcing history",
      "Where is EURUSD now?",
      reconnectHistory,
    );
    check(
      results,
      "reconnect history turn: fresh session with a wire-cap-forced " +
        "assistant-first history still terminated with done (capMessages guard held)",
      followUp.terminal === "done" && followUp.replyText.length > 0,
    );
  } finally {
    ws2.close();
  }
}

function withOverallTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`jarvis-live-smoke: overall run exceeded ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function main(): Promise<void> {
  console.log(`jarvis-live-smoke: starting server on ${HOST}:${PORT}`);
  const server = startServer();
  const results: CheckResult[] = [];
  let hardError: unknown;

  try {
    await withOverallTimeout(runAllChecks(results), OVERALL_TIMEOUT_MS);
  } catch (err) {
    hardError = err;
  } finally {
    await stopServer(server);
  }

  printSummary(results, hardError);
  const failed =
    hardError !== undefined ||
    results.some((r) => {
      return !r.pass;
    });
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error("jarvis-live-smoke: unexpected fatal error", err);
  process.exit(1);
});
