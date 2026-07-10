#!/usr/bin/env tsx
/**
 * Full-stack smoke test (browser).
 *
 * Boots the REAL server and the REAL client (Vite dev server with
 * VITE_SERVER_URL pointed at the server, so the client's composition root wires
 * its WsReal adapters instead of the simulators), then runs the Playwright spec
 * in fullstack/browser/ which asserts that live prices render in the UI. This is
 * the most faithful test — browser → React → presenter → socket → server →
 * domain — and the only one that puts the real backend behind the real DOM.
 *
 * Exits non-zero if the server, client, or Playwright run fails.
 */
import { spawn } from "node:child_process";

import {
  MONOREPO_ROOT,
  startClient,
  startServer,
  stopProcess,
  waitForHttp,
} from "./_orchestration.js";

const HOST = "127.0.0.1";
const SERVER_PORT = Number(process.env.FULLSTACK_PORT ?? 4124);
const CLIENT_PORT = Number(process.env.FULLSTACK_CLIENT_PORT ?? 3100);

function runPlaywright(): Promise<number> {
  return new Promise((resolve) => {
    const args = [
      "--filter",
      "@rtc/tests",
      "exec",
      "playwright",
      "test",
      "--config",
      "fullstack/browser/playwright.config.ts",
    ];

    // FULLSTACK_HEADED (set by the :headed script) runs the real browser
    // visibly against the real backend, so the full stack can be watched live.
    if (process.env.FULLSTACK_HEADED) {
      args.push("--headed");
    }

    const child = spawn("pnpm", args, {
      cwd: MONOREPO_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        FULLSTACK_CLIENT_PORT: String(CLIENT_PORT),
        NODE_OPTIONS: "",
      },
    });
    child.on("exit", (code) => {
      return resolve(code ?? 1);
    });
  });
}

console.log(
  `full-stack smoke (browser): server :${SERVER_PORT}, client :${CLIENT_PORT}`,
);
const server = startServer(SERVER_PORT, HOST);
const client = startClient(CLIENT_PORT, `ws://${HOST}:${SERVER_PORT}`);
let exitCode = 0;

try {
  await waitForHttp(`http://${HOST}:${SERVER_PORT}/health`, 30_000);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`, 60_000);
  exitCode = await runPlaywright();
  console.log(
    exitCode === 0
      ? "full-stack smoke (browser): PASS"
      : "full-stack smoke (browser): FAIL",
  );
} catch (err) {
  exitCode = 1;
  console.error("full-stack smoke (browser): FAIL");
  console.error(err);
} finally {
  await Promise.all([stopProcess(client), stopProcess(server)]);
}

process.exit(exitCode);
