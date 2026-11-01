#!/usr/bin/env node
/**
 * Full-stack smoke test (Node socket).
 *
 * Boots the REAL server (packages/server) on a fixed local port and drives the
 * REAL client WebSocket stack (WsAdapter + WsReal* port adapters) against it
 * over a real WebSocket connection — no browser, no mocks. This is the only
 * test that exercises client-adapter ↔ wire ↔ server ↔ domain end to end; the
 * eight-runner suite runs the client against in-process simulators and never
 * touches the server.
 *
 * Happy path: subscribe to pricing and receive a tick; execute a trade and
 * receive an ack. Exits non-zero on any failure.
 */
import { filter, firstValueFrom, type Observable, timeout } from "rxjs";

import {
  createWsRealPorts,
  HttpAuthAdapter,
  InMemorySessionStore,
  pairConnectionPorts,
  WsAdapter,
  WsConnectionEventsAdapter,
} from "@rtc/client-adapters";
import type { AppPorts, CoreFactory, JarvisAvailability } from "@rtc/core-api";
import {
  ConnectionStatus,
  type Direction,
  PreferencesSimulator,
} from "@rtc/domain";

import { startServer, stopProcess, waitForHttp } from "./_orchestration.ts";
import { runAccountsJourney } from "./accounts-journey.ts";
import { loginForToken } from "./loginForToken.ts";

// Direction is a `const enum` in @rtc/domain, inaccessible under
// verbatimModuleSyntax; use the underlying string literal (same pattern as
// tests/presenter/scenarios/_shared/fxTrading.ts).
const DIR_BUY = "Buy" as unknown as Direction;

// Node < 22 exposes WebSocket only behind a flag; polyfill from `ws` if absent.
interface GlobalWithWebSocket {
  WebSocket?: unknown;
}

if (typeof (globalThis as GlobalWithWebSocket).WebSocket === "undefined") {
  const { WebSocket } = await import("ws");
  (globalThis as GlobalWithWebSocket).WebSocket = WebSocket;
}

const HOST = "127.0.0.1";
const PORT = Number(process.env.FULLSTACK_PORT ?? 4123);
// Upper bound on how long any single stream/RPC may take to produce its first
// value. A smoke test must always terminate: if the real stack stops emitting
// (e.g. a dropped subscription), fail loudly here instead of hanging forever.
const FIRST_VALUE_TIMEOUT_MS = 15_000;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    throw new Error(`assertion failed: ${message}`);
  }
}

async function runChecks(): Promise<void> {
  // The WS upgrade is token-gated (packages/server/src/http/loginHandler.ts
  // authorizeUpgrade — no open-when-empty fallback), so a real POST /login
  // round-trip must happen before the socket connects. The server is started
  // with AUTH_SECRET + AUTH_USERS="demo:demo" (see ./_orchestration.ts).
  const httpBase = `http://${HOST}:${PORT}`;
  const login = await loginForToken(httpBase);
  const sessionStore = new InMemorySessionStore();
  sessionStore.write({
    token: login.token,
    user: login.user,
    username: "demo",
    exp: login.exp,
  });

  const ws = new WsAdapter(`ws://${HOST}:${PORT}`, () => {
    return sessionStore.read()?.token;
  });

  const ports = createWsRealPorts(ws, {
    preferences: new PreferencesSimulator(),
    auth: new HttpAuthAdapter(httpBase),
    sessionStore,
  });

  try {
    // 1. Pricing stream: subscribe → receive a live tick from the real server.
    const tick = await firstValueFrom(
      ports.pricing
        .getPriceUpdates("EURUSD")
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    assert(
      tick.symbol === "EURUSD",
      `pricing tick symbol (got ${tick.symbol})`,
    );
    assert(typeof tick.bid === "number", "pricing tick bid is a number");
    assert(typeof tick.ask === "number", "pricing tick ask is a number");
    assert(typeof tick.mid === "number", "pricing tick mid is a number");
    console.log(
      `  ✓ pricing: received tick for ${tick.symbol} (mid=${tick.mid})`,
    );

    // 2. Trade execution RPC: request → ack with a real trade.
    const trade = await firstValueFrom(
      ports.execution
        .executeTrade({
          currencyPair: "EURUSD",
          spotRate: 1.1,
          direction: DIR_BUY,
          notional: 1_000_000,
          dealtCurrency: "EUR",
        })
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    assert(typeof trade.tradeId === "number", "trade has a numeric tradeId");
    assert(trade.currencyPair === "EURUSD", "trade currencyPair echoed");
    assert(trade.direction === DIR_BUY, "trade direction echoed");
    console.log(
      `  ✓ execution: trade ${trade.tradeId} ${trade.status} for ${trade.currencyPair}`,
    );

    // 3. Ops throughput RPC round-trip (the WS path that replaced the old
    //    HTTP /throughput route): get → set 250 → get reflects the new value.
    const initialThroughput = await firstValueFrom(
      ports.ops
        .getThroughput()
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    assert(
      typeof initialThroughput === "number",
      "initial throughput is a number",
    );
    await firstValueFrom(
      ports.ops
        .setThroughput(250)
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    const updatedThroughput = await firstValueFrom(
      ports.ops
        .getThroughput()
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    assert(
      updatedThroughput === 250,
      `throughput round-trip (got ${updatedThroughput})`,
    );
    console.log(
      `  ✓ ops: throughput ${initialThroughput} → set 250 → ${updatedThroughput}`,
    );
  } finally {
    ws.dispose();
  }
}

/**
 * S1/S14 witness: a frame above `WS_MAX_PAYLOAD_BYTES` closes ONLY that
 * socket (code 1009) and the server keeps serving — proven by a fresh
 * `/health` round-trip afterwards. Before B1 the oversized frame was
 * accepted (100 MiB default) and, once capped, would have crashed the
 * process through the unhandled `error` event.
 */
async function runOversizedFrameSmoke(): Promise<void> {
  const httpBase = `http://${HOST}:${PORT}`;
  const login = await loginForToken(httpBase);
  const { WebSocket } = await import("ws");
  const raw = new WebSocket(`ws://${HOST}:${PORT}/?access=${login.token}`);

  const closeCode = await new Promise<number>((resolve, reject) => {
    const guard = setTimeout(() => {
      reject(new Error("oversized frame: socket was not closed"));
    }, FIRST_VALUE_TIMEOUT_MS);
    raw.on("open", () => {
      raw.send("x".repeat(300 * 1024));
    });
    raw.on("close", (code: number) => {
      clearTimeout(guard);
      resolve(code);
    });
    raw.on("error", () => {
      // The server-side close races a client-side error on some platforms;
      // the close code is what we assert on.
    });
  });

  assert(closeCode === 1009, `oversized frame close code (got ${closeCode})`);
  await waitForHttp(`${httpBase}/health`, 5_000);
  console.log(
    "  ✓ limits: 300 KiB frame closed with 1009, server still healthy",
  );
}

/**
 * S2/S3/§9.2 witnesses over the real HTTP edge. Runs LAST on `PORT`: its
 * ten failed logins reach BAN_STRIKES for 127.0.0.1, so nothing on this
 * server can log in afterwards (the gate smoke uses its own server).
 */
async function runEdgeGuardSmoke(): Promise<void> {
  const httpBase = `http://${HOST}:${PORT}`;

  // S2 — a 5 KiB login body is refused with 413 before it is parsed.
  const big = await postLogin(httpBase, {
    username: "demo",
    password: "x".repeat(5 * 1024),
  });
  assert(big.status === 413, `oversized login body status (got ${big.status})`);

  // S3 + §9.2 — failed logins, each claiming a fresh X-Forwarded-For. Were
  // that header honoured, each attempt would land in its own rate-limit
  // bucket and its own strike entry and the loop would see 401 forever.
  // Keyed on the socket address they share, the 401s (one strike each) and
  // then the rate-limit 429s (two strikes each) reach BAN_STRIKES within a
  // few attempts and the caller is told it is banned. The exact count
  // depends on how many logins the earlier checks already spent.
  const outcomes: string[] = [];
  let banned: Response | undefined;

  for (let i = 0; i < 20 && banned === undefined; i += 1) {
    const attempt = await postLogin(
      httpBase,
      { username: "demo", password: "wrong" },
      { "X-Forwarded-For": `203.0.113.${i}` },
    );
    const body = (await attempt.json()) as LoginErrorBody;
    outcomes.push(`${attempt.status}:${body.error ?? "?"}`);

    if (body.error === "banned") {
      banned = attempt;
    }
  }

  assert(
    banned !== undefined,
    `caller was never banned (outcomes: ${outcomes.join(" ")})`,
  );
  assert(
    outcomes.includes("401:invalid_credentials"),
    `expected at least one 401 before the ban (outcomes: ${outcomes.join(" ")})`,
  );
  assert(banned.status === 429, `banned login status (got ${banned.status})`);
  assert(
    Number(banned.headers.get("retry-after")) > 0,
    "banned login carries Retry-After",
  );
  console.log(
    `  ✓ edge: 413 on a 5 KiB login body; ${outcomes.length} failures behind spoofed X-Forwarded-For end in a ban`,
  );
}

interface LoginErrorBody {
  readonly error?: string;
}

function postLogin(
  httpBase: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${httpBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ── Jarvis gate witness ──────────────────────────────────────────
//
// Drives the SAME real client adapter stack as `runChecks` (WsAdapter +
// createWsRealPorts), against a SECOND real server forced into the soft
// budget gate. `ports.jarvis` is a client-adapters `WsJarvisAdapter` in this
// mode, which — beyond the `JarvisPort` surface — also exposes
// `availability$(): Observable<JarvisAvailability>`, the same subscribe +
// parse client-adapters already owns (see WsJarvisAdapter.availability$ and its
// `parseAvailability`/`parseGate`). Asserting against that ALREADY-PARSED
// shape (rather than the raw wire frame) is a better witness than a raw `ws`
// socket would be: it proves the client parser accepts the server's real
// frame, the exact cross-package contract nothing else integration-tests.
// `WsJarvisAdapter` itself isn't exported from client-adapters's package entry
// point (deliberately — see its own doc comment), so `AvailabilityCapable`
// below narrows the port to the extra method it's known to carry at runtime
// (every `createWsRealPorts` call constructs a real `WsJarvisAdapter`)
// without needing the concrete class.

// Distinct from the neighbors also claiming a port in this dir: this
// file's own `PORT` (4123, default), `browser-smoke.ts`'s `SERVER_PORT`
// (4124 React, 4127 Solid) and `hybrid-smoke.ts`'s (4125 React, 4128 Solid),
// all concurrent under run-all.ts's e2e suite, and
// `../scripts/jarvis-live-smoke.ts`'s hardcoded 4125 (manual-only, not part
// of run-all.ts, but still a live claim worth staying clear of). 4126 is THIS
// file's own gated port, which the Solid browser run once collided with.
const GATED_PORT: number = PORT + 3;

interface AvailabilityCapable {
  availability$(): Observable<JarvisAvailability>;
}

/**
 * Boots a second real server with every budget forced spent
 * (`RTC_JARVIS_FORCE_GATE=exhausted`) and asserts that `jarvis.availability`
 * carries the narrowed brains list + gate metadata over the real wire — the
 * fullstack witness for the client-adapters gate-parsing work (see
 * JarvisMachine's gate handling). The roster login is an operator, offered
 * every brain, so the gate takes all three real models away. This connection
 * only subscribes (`availability$()` sends `jarvis.subscribe` internally,
 * nothing more); it sends no `jarvis.chat` turn, so the dummy
 * `ANTHROPIC_API_KEY` below can never trigger a real Anthropic call.
 */
async function runGateSmoke(): Promise<void> {
  const gatedServer = startServer(GATED_PORT, HOST, {
    RTC_JARVIS_FAKE: "",
    // Not a real secret — this smoke never sends a chat turn, so no
    // Anthropic call can ever fire. Only present so createJarvisLoops takes
    // its dual-loop (ANTHROPIC_API_KEY truthy) branch and offers the full
    // brain roster for the gate to narrow.
    ANTHROPIC_API_KEY: "e2e-dummy",
    RTC_JARVIS_FORCE_GATE: "exhausted",
  });

  try {
    const httpBase = `http://${HOST}:${GATED_PORT}`;
    await waitForHttp(`${httpBase}/health`, 30_000);

    const login = await loginForToken(httpBase);
    const sessionStore = new InMemorySessionStore();
    sessionStore.write({
      token: login.token,
      user: login.user,
      username: "demo",
      exp: login.exp,
    });

    const ws = new WsAdapter(`ws://${HOST}:${GATED_PORT}`, () => {
      return sessionStore.read()?.token;
    });

    const ports = createWsRealPorts(ws, {
      preferences: new PreferencesSimulator(),
      auth: new HttpAuthAdapter(httpBase),
      sessionStore,
    });

    try {
      const availability = await firstValueFrom(
        (ports.jarvis as unknown as AvailabilityCapable)
          .availability$()
          .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
      );

      assert(
        JSON.stringify(availability.brains) === JSON.stringify(["scripted"]),
        `gated brains list (got ${JSON.stringify(availability.brains)})`,
      );
      assert(
        availability.defaultBrain === "scripted",
        `gated defaultBrain (got ${availability.defaultBrain})`,
      );
      assert(availability.gate !== null, "availability carries a gate");
      assert(
        availability.gate?.level === "hard",
        `gate level (got ${availability.gate?.level})`,
      );
      assert(
        (availability.gate?.resetsAtMs ?? 0) > Date.now(),
        `gate resetsAtMs is the next UTC midnight (got ${availability.gate?.resetsAtMs})`,
      );
      assert(
        JSON.stringify(availability.gate?.gated) ===
          JSON.stringify([
            "claude-haiku-4-5",
            "claude-sonnet-5",
            "claude-opus-5",
          ]),
        `gate.gated list (got ${JSON.stringify(availability.gate?.gated)})`,
      );
      console.log(
        "  ✓ jarvis gate: a forced-exhausted budget narrows brains + carries gate metadata over the real wire",
      );
    } finally {
      ws.dispose();
    }

    // The adapter drops `budget` until the clients read it (B3b), so the
    // frame is read off a raw socket.
    const budget = await readAvailabilityBudget(GATED_PORT, login.token);

    assert(
      budget !== undefined && budget.limitUsd === null,
      `roster login's budget has no personal limit (got ${JSON.stringify(budget)})`,
    );
    assert(
      budget?.exhausted === "forced",
      `budget exhausted reason (got ${budget?.exhausted})`,
    );
    console.log(
      "  ✓ jarvis budget: the roster login is operator tier (no personal limit) on JARVIS_AVAILABILITY",
    );
  } finally {
    await stopProcess(gatedServer);
  }
}

// ── Own-key witness ──────────────────────────────────────────────
//
// The first proof of the `index.ts` wiring for bring-your-own keys. Under
// `RTC_JARVIS_FAKE=1` the server verifies with `fakeVerifyOwnKey` (a key
// starting `fake-good` is accepted, any other refused, no provider call) and
// builds an accepted key's loop with a `ScriptedAgentLoop`. Everything is read
// off a raw socket, as the server sent it, so the check that no frame carries
// the key text covers every frame of the exchange.

const OWN_BRAIN = "own:anthropic:claude-haiku-4-5";
const REFUSED_KEY = "not-a-good-key-MARKER-refused";
const ACCEPTED_KEY = "fake-good-MARKER-accepted";

interface OwnKeyFrame {
  readonly type?: string;
  readonly payload?: {
    readonly brains?: readonly string[];
    readonly ownKey?: { readonly status?: string };
    readonly turnId?: string;
    readonly brain?: string;
  };
}

interface RecordingSocket {
  send(type: string, payload?: unknown): void;
  nextFrame(
    accept: (frame: OwnKeyFrame) => boolean,
    what: string,
  ): Promise<OwnKeyFrame>;
  allText(): string;
  close(): void;
}

/** One raw socket that keeps every frame the server sends, as text. */
async function openRecordingSocket(
  port: number,
  token: string,
): Promise<RecordingSocket> {
  const { WebSocket } = await import("ws");
  const raw = new WebSocket(`ws://${HOST}:${port}/?access=${token}`);
  const seen: string[] = [];
  const frames: OwnKeyFrame[] = [];
  const waiters: Array<() => void> = [];

  raw.on("message", (data: unknown) => {
    const text = String(data);

    seen.push(text);
    frames.push(JSON.parse(text) as OwnKeyFrame);

    for (const wake of waiters.splice(0)) {
      wake();
    }
  });

  await new Promise<void>((resolve, reject) => {
    raw.on("open", () => {
      resolve();
    });
    raw.on("error", reject);
  });

  let cursor = 0;

  return {
    send: (type: string, payload?: unknown): void => {
      raw.send(JSON.stringify({ type, payload }));
    },
    nextFrame: async (
      accept: (frame: OwnKeyFrame) => boolean,
      what: string,
    ): Promise<OwnKeyFrame> => {
      const deadline = Date.now() + FIRST_VALUE_TIMEOUT_MS;

      for (;;) {
        while (cursor < frames.length) {
          const frame = frames[cursor++];

          if (frame !== undefined && accept(frame)) {
            return frame;
          }
        }

        const left = deadline - Date.now();

        if (left <= 0) {
          throw new Error(`no ${what} in time`);
        }

        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left);

          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
    allText: () => {
      return seen.join("\n");
    },
    close: () => {
      raw.close();
    },
  };
}

function isAvailabilityWithKey(
  status: string,
): (frame: OwnKeyFrame) => boolean {
  return (frame: OwnKeyFrame): boolean => {
    return (
      frame.type === "jarvis.availability" &&
      frame.payload?.ownKey?.status === status
    );
  };
}

/**
 * Own keys over the real socket, with the server's fake verifier: a key not
 * starting `fake-good` reads `refused`, one that does reads `accepted`, an
 * accepted key puts an own brain on the availability frame, a `jarvis.chat` on
 * that brain completes, and no frame ever contains either key's text.
 */
async function runOwnKeySmoke(): Promise<void> {
  const httpBase = `http://${HOST}:${PORT}`;
  const login = await loginForToken(httpBase);
  const socket = await openRecordingSocket(PORT, login.token);

  try {
    socket.send("jarvis.subscribe", {});
    await socket.nextFrame((frame) => {
      return frame.type === "jarvis.availability";
    }, "first jarvis.availability");

    socket.send("jarvis.key", {
      action: "set",
      provider: "anthropic",
      key: REFUSED_KEY,
      capUsd: 1,
    });
    await socket.nextFrame(
      isAvailabilityWithKey("refused"),
      "availability reading refused",
    );
    console.log("  ✓ own key: a key not starting fake-good reads refused");

    socket.send("jarvis.key", {
      action: "set",
      provider: "anthropic",
      key: ACCEPTED_KEY,
      capUsd: 1,
    });
    const accepted = await socket.nextFrame(
      isAvailabilityWithKey("accepted"),
      "availability reading accepted",
    );

    assert(
      accepted.payload?.brains?.includes(OWN_BRAIN) === true,
      `accepted key offers an own brain (got ${JSON.stringify(accepted.payload?.brains)})`,
    );
    console.log(
      "  ✓ own key: a key starting fake-good reads accepted and offers an own brain",
    );

    const turnId = crypto.randomUUID();

    socket.send("jarvis.chat", {
      text: "Where is EURUSD?",
      turnId,
      brain: OWN_BRAIN,
    });
    const brainFrame = await socket.nextFrame((frame) => {
      return frame.type === "jarvis.brain" && frame.payload?.turnId === turnId;
    }, "jarvis.brain for the own-brain turn");

    assert(
      brainFrame.payload?.brain === OWN_BRAIN,
      `the turn was served on the own brain (got ${brainFrame.payload?.brain})`,
    );
    await socket.nextFrame((frame) => {
      if (frame.type === "jarvis.error" && frame.payload?.turnId === turnId) {
        throw new Error("own-brain turn errored");
      }

      return frame.type === "jarvis.done" && frame.payload?.turnId === turnId;
    }, "jarvis.done for the own-brain turn");
    console.log("  ✓ own key: a jarvis.chat on the own brain completes");

    const wire = socket.allText();

    assert(
      !wire.includes(REFUSED_KEY) && !wire.includes(ACCEPTED_KEY),
      "no frame contains the key text",
    );
    console.log("  ✓ own key: no frame the server sent contains the key text");
  } finally {
    socket.close();
  }
}

/** The fields of `JARVIS_AVAILABILITY`'s `budget` this smoke reads. */
interface BudgetFrameFields {
  readonly limitUsd: number | null;
  readonly exhausted: string | null;
}

interface AvailabilityFrame {
  readonly type?: string;
  readonly payload?: { readonly budget?: BudgetFrameFields };
}

/** Subscribes on a raw socket and returns the first `JARVIS_AVAILABILITY`
 * frame's `budget`, as the server sent it. */
async function readAvailabilityBudget(
  port: number,
  token: string,
): Promise<BudgetFrameFields | undefined> {
  const { WebSocket } = await import("ws");
  const raw = new WebSocket(`ws://${HOST}:${port}/?access=${token}`);

  try {
    return await new Promise<BudgetFrameFields | undefined>(
      (resolve, reject) => {
        const guard = setTimeout(() => {
          reject(new Error("no jarvis.availability frame in time"));
        }, FIRST_VALUE_TIMEOUT_MS);

        raw.on("open", () => {
          raw.send(JSON.stringify({ type: "jarvis.subscribe" }));
        });
        raw.on("message", (data: unknown) => {
          const frame = JSON.parse(String(data)) as AvailabilityFrame;

          if (frame.type === "jarvis.availability") {
            clearTimeout(guard);
            resolve(frame.payload?.budget);
          }
        });
        raw.on("error", (error: Error) => {
          clearTimeout(guard);
          reject(error);
        });
      },
    );
  } finally {
    raw.close();
  }
}

// ── Hot-swap witness ─────────────────────────────────────────────
//
// The web clients build their ports once per page and swap the application
// core in place, so in live mode ONE WsAdapter serves every core. A swap must
// not open a second socket or drop the session. This composes the RxJS, async
// and Effect cores one after another over the SAME ports object and asserts
// each later core inherits the first one's session, connection and trade.

/**
 * Counts every socket the adapter opens. Installed over the global the way a
 * browser page would see it, and restored by the caller.
 */
interface CountingWebSocket {
  readonly ctor: typeof WebSocket;
  opened(): number;
}

function createCountingWebSocket(base: typeof WebSocket): CountingWebSocket {
  let opened = 0;

  class Counted extends base {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      opened += 1;
    }
  }

  return {
    ctor: Counted,
    opened: () => {
      return opened;
    },
  };
}

async function runHotSwapSmoke(): Promise<void> {
  const httpBase = `http://${HOST}:${PORT}`;
  const login = await loginForToken(httpBase);
  const sessionStore = new InMemorySessionStore();
  sessionStore.write({
    token: login.token,
    user: login.user,
    username: "demo",
    exp: login.exp,
  });

  const counter = createCountingWebSocket(globalThis.WebSocket);
  const realWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = counter.ctor;

  const ws = new WsAdapter(
    `ws://${HOST}:${PORT}`,
    () => {
      return sessionStore.read()?.token;
    },
    { autoConnect: false },
  );

  const ports: AppPorts = {
    ...createWsRealPorts(ws, {
      preferences: new PreferencesSimulator(),
      auth: new HttpAuthAdapter(httpBase),
      sessionStore,
    }),
    ...pairConnectionPorts(new WsConnectionEventsAdapter(ws).events()),
    transport: ws,
  };

  const rxjsCore: CoreFactory = await import("@rtc/client-core-rxjs");
  const asyncCore: CoreFactory = await import("@rtc/client-core-async");
  const effectCore: CoreFactory = await import("@rtc/client-core-effect");

  try {
    // First core: sign in is already stored; trade once.
    const first = rxjsCore.createApp(ports);
    const pairs = await firstValueFrom(
      first.presenters.currencyPairs.pairs$.pipe(
        filter((p) => {
          return p.length > 0;
        }),
        timeout({ first: FIRST_VALUE_TIMEOUT_MS }),
      ),
    );

    const price = await firstValueFrom(
      first.presenters.priceStream
        .price$(pairs[0])
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );

    const executed = await firstValueFrom(
      first.presenters.execution
        .execute({
          pair: pairs[0],
          direction: DIR_BUY,
          price,
          notional: 1_234_567,
        })
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    const tradeId = executed.trade.tradeId;
    assert(typeof tradeId === "number", "first core executed a trade");
    await first.dispose();

    for (const [name, core] of [
      ["async", asyncCore],
      ["effect", effectCore],
    ] as const) {
      const app = core.createApp(ports);

      try {
        const auth = await firstValueFrom(
          app.presenters.auth.state$.pipe(
            filter((s) => {
              return s.status === "authenticated";
            }),
            timeout({ first: FIRST_VALUE_TIMEOUT_MS }),
          ),
        );
        assert(
          auth.status === "authenticated",
          `${name} core is authenticated with no new login`,
        );
        await firstValueFrom(
          app.presenters.connection.status$.pipe(
            filter((s) => {
              return s === ConnectionStatus.CONNECTED;
            }),
            timeout({ first: FIRST_VALUE_TIMEOUT_MS }),
          ),
        );
        const trades = await firstValueFrom(
          app.presenters.blotter.trades$.pipe(
            filter((t) => {
              return t.some((x) => {
                return x.tradeId === tradeId;
              });
            }),
            timeout({ first: FIRST_VALUE_TIMEOUT_MS }),
          ),
        );
        assert(
          trades.some((x) => {
            return x.tradeId === tradeId;
          }),
          `${name} core's blotter holds trade ${tradeId}`,
        );
      } finally {
        await app.dispose();
      }
    }

    assert(
      counter.opened() === 1,
      `one socket across three cores (opened ${counter.opened()})`,
    );
    console.log(
      `  ✓ hot swap: rxjs → async → effect over one WsAdapter — authenticated, connected, trade ${tradeId} in every blotter, ${counter.opened()} socket opened`,
    );
  } finally {
    ws.dispose();
    globalThis.WebSocket = realWebSocket;
  }
}

// ── Main ─────────────────────────────────────────────────────────

console.log(
  `full-stack smoke (node socket): starting server on ${HOST}:${PORT}`,
);
const server = startServer(PORT, HOST);
let failed = false;

try {
  await waitForHttp(`http://${HOST}:${PORT}/health`, 30_000);
  await runChecks();
  await runHotSwapSmoke();
  // Before the edge guard below, whose ban takes this address's logins away.
  await runOwnKeySmoke();
  await runAccountsJourney(`http://${HOST}:${PORT}`, `ws://${HOST}:${PORT}`);
  await runOversizedFrameSmoke();
  await runEdgeGuardSmoke();
  await runGateSmoke();
  console.log("full-stack smoke (node socket): PASS");
} catch (err) {
  failed = true;
  console.error("full-stack smoke (node socket): FAIL");
  console.error(err);
} finally {
  await stopProcess(server);
}

process.exit(failed ? 1 : 0);
