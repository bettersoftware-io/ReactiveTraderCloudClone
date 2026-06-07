#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { startDevServer, SHARED_DEV_SERVER_ENV } from "./devServer";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: with-server <cmd> [args...]");
  process.exit(2);
}

// Start the one dev server this runner owns (on RTC_DEV_PORT, default 3000),
// then tell the child — and any of its own workers that call startDevServer
// (e.g. cucumber's per-worker BeforeAll hooks) — that reusing it is intentional.
// The flag is set only in the child env, never our own, so OUR startDevServer
// above always starts a real server and never silently adopts a stale one.
const dev = await startDevServer();
const code = await new Promise<number>((resolve) => {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, [SHARED_DEV_SERVER_ENV]: "1" },
  });
  child.on("exit", (c) => resolve(c ?? 1));
});
await dev.stop();
process.exit(code);
