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
import { firstValueFrom, timeout } from "rxjs";

import { createWsRealPorts } from "@rtc/client-core";
import { WsAdapter } from "@rtc/client-react";
import type { Direction } from "@rtc/domain";
import { PreferencesSimulator } from "@rtc/domain";

import { startServer, stopProcess, waitForHttp } from "./_orchestration.js";

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
  const ws = new WsAdapter(`ws://${HOST}:${PORT}`);
  const ports = createWsRealPorts(ws, {
    preferences: new PreferencesSimulator(),
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

// ── Main ─────────────────────────────────────────────────────────

console.log(
  `full-stack smoke (node socket): starting server on ${HOST}:${PORT}`,
);
const server = startServer(PORT, HOST);
let failed = false;

try {
  await waitForHttp(`http://${HOST}:${PORT}/health`, 30_000);
  await runChecks();
  console.log("full-stack smoke (node socket): PASS");
} catch (err) {
  failed = true;
  console.error("full-stack smoke (node socket): FAIL");
  console.error(err);
} finally {
  await stopProcess(server);
}

process.exit(failed ? 1 : 0);
