#!/usr/bin/env tsx
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
import { firstValueFrom, type Observable, timeout } from "rxjs";

import {
  createWsRealPorts,
  HttpAuthAdapter,
  InMemorySessionStore,
  type JarvisAvailability,
} from "@rtc/client-core";
import { WsAdapter } from "@rtc/client-react";
import type { Direction } from "@rtc/domain";
import { PreferencesSimulator } from "@rtc/domain";

import { startServer, stopProcess, waitForHttp } from "./_orchestration.js";
import { loginForToken } from "./loginForToken.js";

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

    // 3. Admin throughput RPC round-trip (the WS path that replaced the old
    //    HTTP /throughput route): get → set 250 → get reflects the new value.
    const initialThroughput = await firstValueFrom(
      ports.admin
        .getThroughput()
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    assert(
      typeof initialThroughput === "number",
      "initial throughput is a number",
    );
    await firstValueFrom(
      ports.admin
        .setThroughput(250)
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    const updatedThroughput = await firstValueFrom(
      ports.admin
        .getThroughput()
        .pipe(timeout({ first: FIRST_VALUE_TIMEOUT_MS })),
    );
    assert(
      updatedThroughput === 250,
      `throughput round-trip (got ${updatedThroughput})`,
    );
    console.log(
      `  ✓ admin: throughput ${initialThroughput} → set 250 → ${updatedThroughput}`,
    );
  } finally {
    ws.dispose();
  }
}

// ── Jarvis gate witness ──────────────────────────────────────────
//
// Drives the SAME real client adapter stack as `runChecks` (WsAdapter +
// createWsRealPorts), against a SECOND real server forced into the soft
// budget gate. `ports.jarvis` is a client-core `WsJarvisAdapter` in this
// mode, which — beyond the `JarvisPort` surface — also exposes
// `availability$(): Observable<JarvisAvailability>`, the same subscribe +
// parse client-core already owns (see WsJarvisAdapter.availability$ and its
// `parseAvailability`/`parseGate`). Asserting against that ALREADY-PARSED
// shape (rather than the raw wire frame) is a better witness than a raw `ws`
// socket would be: it proves the client parser accepts the server's real
// frame, the exact cross-package contract nothing else integration-tests.
// `WsJarvisAdapter` itself isn't exported from client-core's package entry
// point (deliberately — see its own doc comment), so `AvailabilityCapable`
// below narrows the port to the extra method it's known to carry at runtime
// (every `createWsRealPorts` call constructs a real `WsJarvisAdapter`)
// without needing the concrete class.

// Distinct from THREE neighbors also claiming a port in this dir: this
// file's own `PORT` (4123, default), `browser-smoke.ts`'s `SERVER_PORT`
// (4124, default — both run concurrently under run-all.ts's e2e suite) and
// `../scripts/jarvis-live-smoke.ts`'s hardcoded 4125 (manual-only, not part
// of run-all.ts, but still a live claim worth staying clear of).
const GATED_PORT: number = PORT + 3;

interface AvailabilityCapable {
  availability$(): Observable<JarvisAvailability>;
}

/**
 * Boots a second real server forced into the soft budget gate and asserts
 * that `jarvis.availability` carries the narrowed brains list + gate
 * metadata over the real wire — the fullstack witness for the client-core
 * gate-parsing work (see JarvisMachine's gate handling). This connection
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
    RTC_JARVIS_FORCE_GATE: "soft",
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
        JSON.stringify(availability.brains) ===
          JSON.stringify(["scripted", "claude-haiku-4-5"]),
        `gated brains list (got ${JSON.stringify(availability.brains)})`,
      );
      assert(
        availability.defaultBrain === "claude-haiku-4-5",
        `gated defaultBrain (got ${availability.defaultBrain})`,
      );
      assert(availability.gate !== null, "availability carries a gate");
      assert(
        availability.gate?.level === "soft",
        `gate level (got ${availability.gate?.level})`,
      );
      assert(
        availability.gate?.resetsAtMs === 0,
        `gate resetsAtMs on a fresh meter (got ${availability.gate?.resetsAtMs})`,
      );
      assert(
        JSON.stringify(availability.gate?.gated) ===
          JSON.stringify(["claude-sonnet-5", "claude-opus-5"]),
        `gate.gated list (got ${JSON.stringify(availability.gate?.gated)})`,
      );
      console.log(
        "  ✓ jarvis gate: forced soft gate narrows brains + carries gate metadata over the real wire",
      );
    } finally {
      ws.dispose();
    }
  } finally {
    await stopProcess(gatedServer);
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
