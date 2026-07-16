/**
 * Shared process orchestration for the full-stack smokes.
 *
 * Both smokes boot the REAL server (packages/server) and connect the REAL
 * client to it — the node smoke over a raw socket, the browser smoke through a
 * Vite dev server with VITE_SERVER_URL pointed at the server so the client's
 * composition root wires its WsReal adapters instead of the simulators.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MONOREPO_ROOT = join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    return setTimeout(r, ms);
  });
}

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
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: host,
        NODE_OPTIONS: "",
        // The WS upgrade is token-gated (packages/server/src/http/loginHandler.ts
        // authorizeUpgrade — no open-when-empty fallback), so both smokes need a
        // real signed token from POST /login before they can connect. A fixed
        // test-only secret + the `demo` roster credential (never a real secret).
        AUTH_SECRET: "e2e-secret",
        AUTH_USERS: "demo:demo",
      },
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
  return spawn("pnpm", ["--filter", "@rtc/client-react", "dev"], {
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
  });
}

/** Poll an HTTP URL until it responds < 500, or throw after timeout. */
export async function waitForHttp(
  url: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" });

      if (res.status < 500) {
        return;
      }
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

    if (!child || child.exitCode !== null || pid === undefined) {
      return resolve();
    }

    const groupPid = pid;

    // Kill the process group (negative pid) so the real server/Vite grandchild
    // dies with its `pnpm` wrapper instead of orphaning on its port.
    function killGroup(signal: NodeJS.Signals): void {
      try {
        process.kill(-groupPid, signal);
      } catch {
        // group already gone
      }
    }

    const kill = setTimeout(() => {
      return killGroup("SIGKILL");
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(kill);
      resolve();
    });
    killGroup("SIGTERM");
  });
}
