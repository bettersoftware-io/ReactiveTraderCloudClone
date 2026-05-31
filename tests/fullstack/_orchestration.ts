/**
 * Shared process orchestration for the full-stack smokes.
 *
 * Both smokes boot the REAL server (packages/server) and connect the REAL
 * client to it — the node smoke over a raw socket, the browser smoke through a
 * Vite dev server with VITE_SERVER_URL pointed at the server so the client's
 * composition root wires its WsReal adapters instead of the simulators.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const MONOREPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Start the real backend (from source via the server's own tsx). */
export function startServer(port: number, host = "127.0.0.1"): ChildProcess {
  return spawn(
    "pnpm",
    ["--filter", "@rtc/server", "exec", "tsx", "src/index.ts"],
    {
      cwd: MONOREPO_ROOT,
      stdio: "ignore",
      // Detached so stopProcess can kill the whole group (the real server runs as
      // a grandchild of this `pnpm` wrapper, which doesn't forward signals).
      detached: true,
      env: { ...process.env, PORT: String(port), HOSTNAME: host, NODE_OPTIONS: "" },
    },
  );
}

/**
 * Start the Vite client dev server with VITE_SERVER_URL set, so the client
 * connects to the real backend instead of running its in-process simulators.
 */
export function startClient(
  clientPort: number,
  serverUrl: string,
): ChildProcess {
  return spawn(
    "pnpm",
    ["--filter", "@rtc/client", "dev"],
    {
      cwd: MONOREPO_ROOT,
      stdio: "ignore",
      // Detached so stopProcess can kill the whole group (Vite is a grandchild of
      // this `pnpm` wrapper, which doesn't forward signals).
      detached: true,
      env: {
        ...process.env,
        PORT: String(clientPort),
        VITE_SERVER_URL: serverUrl,
        // Don't leak the parent tsx loader into the Vite child.
        NODE_OPTIONS: "",
      },
    },
  );
}

/** Poll an HTTP URL until it responds < 500, or throw after timeout. */
export async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`${url} not reachable after ${timeoutMs}ms`);
}

/** Gracefully stop a spawned process group (SIGTERM, then SIGKILL after 5s). */
export function stopProcess(child: ChildProcess | undefined): Promise<void> {
  return new Promise((resolve) => {
    const pid = child?.pid;
    if (!child || child.exitCode !== null || pid === undefined) return resolve();
    // Kill the process group (negative pid) so the real server/Vite grandchild
    // dies with its `pnpm` wrapper instead of orphaning on its port.
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-pid, signal);
      } catch {
        // group already gone
      }
    };
    const kill = setTimeout(() => killGroup("SIGKILL"), 5_000);
    child.once("exit", () => {
      clearTimeout(kill);
      resolve();
    });
    killGroup("SIGTERM");
  });
}
