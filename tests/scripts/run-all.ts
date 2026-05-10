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
  const playwrightExit = await run("pnpm", ["test:e2e:playwright"]);
  combinedExit = combinedExit | playwrightExit;
  const cypressExit = await run("pnpm", ["test:e2e:cypress"]);
  combinedExit = combinedExit | cypressExit;
} finally {
  await dev.stop();
}
process.exit(combinedExit);
