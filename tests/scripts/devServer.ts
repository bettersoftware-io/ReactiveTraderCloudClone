import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export interface DevServerHandle {
  stop(): Promise<void>;
}

// Overridable per-suite via RTC_DEV_PORT so parallel browser runners can each
// own a dev server on a distinct port; defaults to 3000 for standalone runs.
export const DEV_PORT = Number(process.env.RTC_DEV_PORT ?? 3000);
// Set to "1" by the orchestrator (run-all.ts) around its child runners to opt
// into reusing the single shared dev server it started. Absent it, startDevServer
// refuses to reuse a server it didn't start (see the throw there).
export const SHARED_DEV_SERVER_ENV = "RTC_DEV_SERVER_SHARED";
// Use 127.0.0.1 explicitly: Vite ≥6 binds the dev server to ::1 only on hosts
// where `localhost` resolves to IPv6 first, while Node fetch defaults to IPv4.
const DEV_BASE_URL = `http://127.0.0.1:${DEV_PORT}`;
// Resolve the monorepo root (two levels up from tests/scripts/)
const MONOREPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");

async function pingPort(): Promise<boolean> {
  try {
    const response = await fetch(DEV_BASE_URL, { method: "HEAD" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitForPort(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingPort()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server on :${DEV_PORT} not reachable after ${timeoutMs}ms`);
}

export async function startDevServer(): Promise<DevServerHandle> {
  if (await pingPort()) {
    // Something is already serving :3000. Only reuse it when the orchestrator
    // (run-all.ts) has explicitly claimed ownership of a shared simulator-mode
    // server via SHARED_DEV_SERVER_ENV — that's the one case where sharing is
    // intentional. In every other case, refuse: silently reusing an unknown
    // server (a leftover from a killed run, a hand-started `pnpm dev`, or one
    // in WS-real mode) runs the tests against the wrong app/mode and produces
    // confusing, hard-to-diagnose failures. Fail loudly instead.
    if (process.env[SHARED_DEV_SERVER_ENV] === "1") {
      return { stop: async () => {} };
    }
    throw new Error(
      `Port ${DEV_PORT} is already in use, but this runner expects to start its own ` +
        `dev server (simulator mode). Refusing to reuse an unknown server — it may be a ` +
        `stale process or the wrong connection mode, which causes misleading test failures.\n\n` +
        `Free the port and re-run:\n` +
        `  pnpm --filter @rtc/tests port:free\n\n` +
        `(That helper works on both macOS and Linux — it probes for lsof, ss, or ` +
        `fuser, whichever your machine has.)\n\n` +
        `(To share one dev server across all runners on purpose, use \`pnpm test:e2e\`.)`,
    );
  }
  const child: ChildProcess = spawn(
    "pnpm",
    ["--filter", "@rtc/client", "dev"],
    {
      stdio: "ignore",
      // Detached → the child leads its own process group, so stop() can kill the
      // whole group. The child is a `pnpm` wrapper that spawns Vite as its own
      // child; signalling only the wrapper leaves Vite orphaned on the port.
      detached: true,
      cwd: MONOREPO_ROOT,
      // Omit NODE_OPTIONS so the spawned Vite process does not inherit tsx hooks
      env: { ...process.env, PORT: String(DEV_PORT), NODE_OPTIONS: "" },
    },
  );
  await waitForPort(30_000);
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        const pid = child.pid;
        if (child.exitCode !== null || pid === undefined) {
          resolve();
          return;
        }
        // Kill the process group (negative pid) so Vite dies with its wrapper.
        const killGroup = (signal: NodeJS.Signals) => {
          try {
            process.kill(-pid, signal);
          } catch {
            // group already gone
          }
        };
        const killTimer = setTimeout(() => killGroup("SIGKILL"), 5_000);
        child.once("exit", () => {
          clearTimeout(killTimer);
          resolve();
        });
        killGroup("SIGTERM");
      }),
  };
}
