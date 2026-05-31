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
import { firstValueFrom } from "rxjs";
import { WsAdapter, createWsRealPorts } from "@rtc/client";
import type { Direction } from "@rtc/domain";
import { startServer, stopProcess, waitForHttp } from "./_orchestration.js";

// Direction is a `const enum` in @rtc/domain, inaccessible under
// verbatimModuleSyntax; use the underlying string literal (same pattern as
// tests/scenarios/presenter/_shared/fxTrading.ts).
const DIR_BUY = "Buy" as unknown as Direction;

// Node < 22 exposes WebSocket only behind a flag; polyfill from `ws` if absent.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  const { WebSocket } = await import("ws");
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

const HOST = "127.0.0.1";
const PORT = Number(process.env.FULLSTACK_PORT ?? 4123);

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${message}`);
}

async function runChecks(): Promise<void> {
  const ws = new WsAdapter(`ws://${HOST}:${PORT}`);
  const ports = createWsRealPorts(ws);
  try {
    // 1. Pricing stream: subscribe → receive a live tick from the real server.
    const tick = await firstValueFrom(ports.pricing.getPriceUpdates("EURUSD"));
    assert(tick.symbol === "EURUSD", `pricing tick symbol (got ${tick.symbol})`);
    assert(typeof tick.bid === "number", "pricing tick bid is a number");
    assert(typeof tick.ask === "number", "pricing tick ask is a number");
    assert(typeof tick.mid === "number", "pricing tick mid is a number");
    console.log(`  ✓ pricing: received tick for ${tick.symbol} (mid=${tick.mid})`);

    // 2. Trade execution RPC: request → ack with a real trade.
    const trade = await firstValueFrom(
      ports.execution.executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1.1,
        direction: DIR_BUY,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      }),
    );
    assert(typeof trade.tradeId === "number", "trade has a numeric tradeId");
    assert(trade.currencyPair === "EURUSD", "trade currencyPair echoed");
    assert(trade.direction === DIR_BUY, "trade direction echoed");
    console.log(`  ✓ execution: trade ${trade.tradeId} ${trade.status} for ${trade.currencyPair}`);
  } finally {
    ws.dispose();
  }
}

// ── Main ─────────────────────────────────────────────────────────

console.log(`full-stack smoke (node socket): starting server on ${HOST}:${PORT}`);
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
