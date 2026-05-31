#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { startDevServer, SHARED_DEV_SERVER_ENV } from "../support/devServer";

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
    child.on("exit", (c) => resolve(c ?? 1));
  });
}

// Start (or fail fast on a foreign :3000) the one server we own, THEN signal
// child runners that reusing it is intentional. The flag is set only after our
// own startDevServer so the orchestrator itself never silently adopts a stale
// server either.
const dev = await startDevServer();
process.env[SHARED_DEV_SERVER_ENV] = "1";
let combinedExit = 0;
try {
  // Browser + presenter peers run the client against in-process simulators,
  // sharing one dev server (simulator mode, no VITE_SERVER_URL).
  combinedExit |= await run("pnpm", ["test:browser:playwright"]);
  combinedExit |= await run("pnpm", ["test:browser:raw-playwright"]);
  combinedExit |= await run("pnpm", ["test:browser:cypress"]);
  combinedExit |= await run("pnpm", ["test:browser:raw-cypress"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-real"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-fake"]);
  combinedExit |= await run("pnpm", ["test:presenter:vitest-fake"]);
  combinedExit |= await run("pnpm", ["test:presenter:vitest-plain"]);
} finally {
  delete process.env[SHARED_DEV_SERVER_ENV];
  await dev.stop();
}

// Full-stack smokes are self-contained: each boots its own real server (and,
// for the browser smoke, its own client) on dedicated ports, so they run after
// the shared simulator dev server is torn down.
combinedExit |= await run("pnpm", ["test:fullstack:node"]);
combinedExit |= await run("pnpm", ["test:fullstack:browser"]);

process.exit(combinedExit);
