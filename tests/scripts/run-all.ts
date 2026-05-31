#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { startDevServer } from "../support/devServer";

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
    child.on("exit", (c) => resolve(c ?? 1));
  });
}

const dev = await startDevServer();
let combinedExit = 0;
try {
  // Browser + presenter peers run the client against in-process simulators,
  // sharing one dev server (simulator mode, no VITE_SERVER_URL).
  combinedExit |= await run("pnpm", ["test:e2e:playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-playwright"]);
  combinedExit |= await run("pnpm", ["test:e2e:cypress"]);
  combinedExit |= await run("pnpm", ["test:e2e:raw-cypress"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-real"]);
  combinedExit |= await run("pnpm", ["test:presenter:cucumber-fake"]);
  combinedExit |= await run("pnpm", ["test:presenter:vitest-fake"]);
  combinedExit |= await run("pnpm", ["test:presenter:vitest-plain"]);
} finally {
  await dev.stop();
}

// Full-stack smokes are self-contained: each boots its own real server (and,
// for the browser smoke, its own client) on dedicated ports, so they run after
// the shared simulator dev server is torn down.
combinedExit |= await run("pnpm", ["test:e2e:fullstack-node"]);
combinedExit |= await run("pnpm", ["test:e2e:fullstack-browser"]);

process.exit(combinedExit);
