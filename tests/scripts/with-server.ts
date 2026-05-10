#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { startDevServer } from "../support/devServer";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: with-server <cmd> [args...]");
  process.exit(2);
}

const dev = await startDevServer();
const code = await new Promise<number>((resolve) => {
  const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
  child.on("exit", (c) => resolve(c ?? 1));
});
await dev.stop();
process.exit(code);
