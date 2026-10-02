#!/usr/bin/env tsx
/**
 * Hybrid data-source smoke (browser) — hardening spec §8.
 *
 * Boots the REAL server (e2e roster `demo:demo`) and the REAL client as a
 * HYBRID page: the Vite dev server gets VITE_SERVER_URL pointed at the server
 * AND a VITE_DEMO_AUTH roster of `demo:mcdc2026`, so the client's composition
 * root wires the routing auth port (`createRoutingAuthPort`). The SAME
 * username therefore has one local and one server password, which is exactly
 * what credential-match routing must tell apart. The Playwright spec in
 * fullstack/hybrid/ pins the one security property of the hybrid build: demo
 * credentials are verified in the browser and never reach the server, while
 * server credentials reload once into the live composition.
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
const SERVER_PORT = Number(process.env.FULLSTACK_PORT ?? 4125);
const CLIENT_PORT = Number(process.env.FULLSTACK_CLIENT_PORT ?? 3101);

/**
 * The bundle's demo roster for this run. Deliberately ONLY `demo`, whose
 * server password is `demo` (see startServer's AUTH_USERS): the local and the
 * server entry share a username and differ in password, so a wrong routing
 * criterion (username membership instead of credential match) fails the spec.
 */
const DEMO_ROSTER = { demo: "mcdc2026" };

function runPlaywright(): Promise<number> {
  return new Promise((resolve) => {
    const args = [
      "--filter",
      "@rtc/tests",
      "exec",
      "playwright",
      "test",
      "--config",
      "fullstack/hybrid/playwright.config.ts",
    ];

    // FULLSTACK_HEADED (set by the :headed script) runs the real browser
    // visibly against the real backend, so the mode-change reload can be watched.
    if (process.env.FULLSTACK_HEADED) {
      args.push("--headed");
    }

    const child = spawn("pnpm", args, {
      cwd: MONOREPO_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        FULLSTACK_CLIENT_PORT: String(CLIENT_PORT),
        // The spec needs the REAL server's origin to tell its requests and
        // sockets apart from the Vite dev server's own.
        FULLSTACK_PORT: String(SERVER_PORT),
        NODE_OPTIONS: "",
      },
    });
    child.on("exit", (code) => {
      return resolve(code ?? 1);
    });
  });
}

console.log(
  `hybrid smoke (browser): server :${SERVER_PORT}, client :${CLIENT_PORT}`,
);
const server = startServer(SERVER_PORT, HOST);
const client = startClient(CLIENT_PORT, `ws://${HOST}:${SERVER_PORT}`, {
  VITE_DEMO_AUTH: JSON.stringify(DEMO_ROSTER),
});
let exitCode = 0;

try {
  await waitForHttp(`http://${HOST}:${SERVER_PORT}/health`, 30_000);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`, 60_000);
  exitCode = await runPlaywright();
  console.log(
    exitCode === 0
      ? "hybrid smoke (browser): PASS"
      : "hybrid smoke (browser): FAIL",
  );
} catch (err) {
  exitCode = 1;
  console.error("hybrid smoke (browser): FAIL");
  console.error(err);
} finally {
  await Promise.all([stopProcess(client), stopProcess(server)]);
}

process.exit(exitCode);
