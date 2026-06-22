#!/usr/bin/env tsx
import { spawn } from "node:child_process";

import { SHARED_DEV_SERVER_ENV, startDevServer } from "./devServer";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: with-server <cmd> [args...]");
  process.exit(2);
}

// Start the one dev server this runner owns. It may land on a later port than
// the preferred RTC_DEV_PORT (taken ports get skipped), so pass the ACTUAL port
// down to the child as RTC_DEV_PORT — that's what the test runner reads for its
// baseURL — and set the shared flag so the child (and any of its own workers,
// e.g. cucumber's per-worker BeforeAll hooks) reuse this server instead of
// starting their own. The flag is set only in the child env, never ours.
const dev = await startDevServer();
console.log(`[with-server] dev server ready on :${dev.port}`);

let code = 1;
try {
  code = await new Promise<number>((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        RTC_DEV_PORT: String(dev.port),
        [SHARED_DEV_SERVER_ENV]: "1",
      },
    });
    child.on("exit", (c) => resolve(c ?? 1));
    child.on("error", () => resolve(1));
  });
} finally {
  // Always tear the dev server down — even if the child throws/exits abnormally
  // — so a failed suite never leaves an orphaned Vite holding the port.
  await dev.stop();
}
process.exit(code);
