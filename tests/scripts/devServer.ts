import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface DevServerHandle {
  /** The port the dev server actually bound (may differ from the preferred one). */
  readonly port: number;
  stop(): Promise<void>;
}

// The PREFERRED dev-server port. Overridable per-suite via RTC_DEV_PORT so
// parallel browser runners each start from a distinct base; defaults to 3000 for
// standalone runs. The server may end up on a LATER port if this one is taken
// (e.g. a claude-sandbox container forwarding 3000/3001 on the host, a leftover
// dev server, or another suite racing for the same port): Vite auto-increments
// to the next free port and startDevServer parses the ACTUAL port from its
// output. Callers must read that back via the handle's `port` (with-server.ts
// exports it as RTC_DEV_PORT for the test runner's baseURL) rather than assuming
// the preferred port.
export const DEV_PORT = Number(process.env.RTC_DEV_PORT ?? 3000);
// Set to "1" by with-server.ts in the child env so cucumber's per-worker
// startDevServer calls reuse the one server the runner already started (on the
// actual chosen port, also passed down as RTC_DEV_PORT) instead of each starting
// their own.
export const SHARED_DEV_SERVER_ENV = "RTC_DEV_SERVER_SHARED";
// Resolve the monorepo root (two levels up from tests/scripts/)
const MONOREPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    return setTimeout(r, ms);
  });
}

// HEAD the dev server: a <500 response means it's serving. 127.0.0.1 explicitly
// because Vite ≥6 binds ::1 only on hosts where `localhost` resolves to IPv6
// first, while Node's fetch defaults to IPv4.
async function pingPort(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: "HEAD",
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

// Pull the actual bound port out of Vite's startup banner, e.g.
//   ➜  Local:   http://127.0.0.1:3002/
// Strip ANSI colour codes first. Returns null until the line has been printed.
// ESC (U+001B) used to strip ANSI colour sequences; defined as a string constant
// to avoid a literal control character inside a regex (biome noControlCharactersInRegex).
const ESC = String.fromCharCode(0x1b);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

function parseBoundPort(log: string): number | null {
  const clean = log.replace(ANSI_RE, "");
  const match =
    clean.match(/Local:\s*https?:\/\/[\d.]+:(\d+)/) ??
    clean.match(/https?:\/\/127\.0\.0\.1:(\d+)/);
  return match ? Number(match[1]) : null;
}

interface SpawnedServer {
  readonly child: ChildProcess;
  /** Last ~4 KB of the dev server's stdout+stderr, for parsing + diagnostics. */
  getLog(): string;
}

function spawnDevServer(preferredPort: number): SpawnedServer {
  const child = spawn("pnpm", ["--filter", "@rtc/client-react", "dev"], {
    // Capture output so we can read the actual bound port from Vite's banner and
    // surface startup failures in the thrown message (not a blind timeout).
    stdio: ["ignore", "pipe", "pipe"],
    // Detached → the child leads its own process group, so stop() can kill the
    // whole group. The child is a `pnpm` wrapper that spawns Vite as its own
    // child; signalling only the wrapper leaves Vite orphaned on the port.
    detached: true,
    cwd: MONOREPO_ROOT,
    // PORT is the preferred port; Vite auto-increments if taken (we parse the
    // real one). Omit NODE_OPTIONS so Vite doesn't inherit tsx hooks.
    // VITE_DEV_AUTH seeds a simulator-mode dev credential (demo/demo, matching
    // the `demo` roster identity — see packages/domain/src/auth/roster.ts) so
    // the login-form e2e spec (browser/playwright/login.spec.ts) can drive the
    // real LoginScreen. Every OTHER browser spec seeds an authenticated
    // session directly (see tests/browser/authSeed.ts) and never touches this
    // form, so the value is unused there.
    env: {
      ...process.env,
      PORT: String(preferredPort),
      NODE_OPTIONS: "",
      VITE_DEV_AUTH: '{"demo":"demo"}',
    },
  });
  let log = "";

  function capture(d: Buffer): void {
    log = (log + d.toString()).slice(-4000);
  }

  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  return {
    child,
    getLog: () => {
      return log;
    },
  };
}

function makeStop(child: ChildProcess): () => Promise<void> {
  return () => {
    return new Promise<void>((resolve) => {
      const pid = child.pid;

      if (child.exitCode !== null || pid === undefined) {
        resolve();
        return;
      }

      const groupPid = pid;

      // Kill the process group (negative pid) so Vite dies with its wrapper.
      function killGroup(signal: NodeJS.Signals): void {
        try {
          process.kill(-groupPid, signal);
        } catch {
          // group already gone
        }
      }

      const killTimer = setTimeout(() => {
        return killGroup("SIGKILL");
      }, 5_000);
      child.once("exit", () => {
        clearTimeout(killTimer);
        resolve();
      });
      killGroup("SIGTERM");
    });
  };
}

// Resolve to the actual bound port once Vite reports it AND answers there. Fail
// early if the process dies first, or if the deadline passes — including the
// captured output for diagnosis. Reading Vite's self-reported port (rather than
// pre-probing a free port ourselves) is race-free: Vite's bind is atomic and
// authoritative, so parallel runners can never collide on or adopt each other's
// server.
async function awaitReady(
  server: SpawnedServer,
  timeoutMs: number,
): Promise<number> {
  let exitMsg: string | null = null;
  server.child.once("exit", (code, signal) => {
    exitMsg = `dev server process exited early (code=${code}, signal=${signal})`;
  });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (exitMsg) {
      throw new Error(
        `${exitMsg}\n--- dev server output ---\n${server.getLog()}`,
      );
    }

    const port = parseBoundPort(server.getLog());

    if (port !== null && (await pingPort(port))) {
      return port;
    }

    await sleep(200);
  }

  throw new Error(
    `dev server did not report a ready port within ${timeoutMs}ms\n` +
      `--- dev server output ---\n${server.getLog()}`,
  );
}

export async function startDevServer(): Promise<DevServerHandle> {
  // Reuse path: the orchestrating runner (with-server.ts) already started one
  // server and flagged sharing as intentional, passing its actual port down as
  // RTC_DEV_PORT. Cucumber's per-worker hooks land here — adopt that server.
  if (
    process.env[SHARED_DEV_SERVER_ENV] === "1" &&
    (await pingPort(DEV_PORT))
  ) {
    return { port: DEV_PORT, stop: async () => {} };
  }

  // Otherwise start our own. Vite picks the first free port at/after the
  // preferred one and tells us which; we read it back rather than guessing.
  const server = spawnDevServer(DEV_PORT);

  try {
    const port = await awaitReady(server, 30_000);
    return { port, stop: makeStop(server.child) };
  } catch (err) {
    await makeStop(server.child)();
    throw err;
  }
}
