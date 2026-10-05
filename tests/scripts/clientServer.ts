import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertDepsServedLean, LEAN_DEPS_ENV } from "./lib/leanDeps.ts";
import { resolveServeMode, type ServeMode } from "./lib/serveMode.ts";

/** The server a browser suite drives: the client's production build behind
 * `vite preview`, or its Vite dev server (`lib/serveMode.ts` says which, and
 * why the build is the default). */
export interface ClientServerHandle {
  /** The port the server actually bound (may differ from the preferred one). */
  readonly port: number;
  /** What it serves; `null` for a server this process only adopted. */
  readonly mode: ServeMode | null;
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
// Which client package's dev server to spawn. Defaults to the web React
// client; solid browser suites set this to "@rtc/client-solid" (see
// tests/scripts/run-all.ts) to prove the same Gherkin contracts against the
// SolidJS client. Both packages' vite.config.ts read PORT/host the same way,
// so no other server-lifecycle assumption here is client-specific.
export const CLIENT_PKG: string =
  process.env.RTC_CLIENT_PKG ?? "@rtc/client-react";
// Resolve the monorepo root (two levels up from tests/scripts/)
const MONOREPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const CLIENT_DIR = join(
  MONOREPO_ROOT,
  "packages",
  CLIENT_PKG.replace("@rtc/", ""),
);
// The package's own Vite, run directly: a `pnpm exec` wrapper would be one
// more process between this one and the server it has to stop.
const VITE_BIN = join(CLIENT_DIR, "node_modules", ".bin", "vite");

/** What every client server the harness starts is given, dev or built.
 * VITE_DEV_AUTH seeds a simulator-mode credential (demo/demo, matching the
 * `demo` roster identity — see packages/domain/src/auth/roster.ts) so the
 * login-form e2e spec (browser/playwright/login.spec.ts) can drive the real
 * LoginScreen. Every OTHER browser spec seeds an authenticated session
 * directly (see tests/browser/authSeed.ts) and never touches this form, so
 * the value is unused there. Both clients read it identically through their
 * own `parseDevAuth` helper in buildBrowserPorts.ts. NODE_OPTIONS is emptied
 * so Vite does not inherit the parent's loader options. */
function clientEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_OPTIONS: "",
    VITE_DEV_AUTH: '{"demo":"demo"}',
    VITE_CORE_IMPL: process.env.RTC_CORE_IMPL ?? "",
  };
}

/** Where this run's build of the client goes: one directory per client and
 * core, under node_modules so no linter, formatter or git ever sees it. */
function buildOutDir(): string {
  return join(
    MONOREPO_ROOT,
    "tests",
    "node_modules",
    ".cache",
    "rtc-e2e",
    `${CLIENT_PKG.replace("@rtc/", "")}-${process.env.RTC_CORE_IMPL || "rxjs"}`,
  );
}

/** `vite build` the client into `outDir`. VITE_DEMO_AUTH is emptied: a
 * production build reads its demo roster from the committed
 * `.env.production`, where `demo`'s password is not the `demo` the login spec
 * types — the roster this run uses is VITE_DEV_AUTH's, as on the dev server.
 * VITE_NARRATOR_TEST_SEAM keeps the `?narratorThresholds=test` seam in the
 * bundle (a production build otherwise compiles it out): the narrator spec
 * cannot wait for a natural anomaly, about one per symbol every 14 minutes. */
function buildClient(outDir: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      VITE_BIN,
      ["build", "--outDir", outDir, "--emptyOutDir"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: CLIENT_DIR,
        env: {
          ...clientEnv(),
          VITE_DEMO_AUTH: "",
          VITE_NARRATOR_TEST_SEAM: "1",
        },
      },
    );
    let log = "";

    function capture(d: Buffer): void {
      log = (log + d.toString()).slice(-4000);
    }

    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `vite build of ${CLIENT_PKG} exited with code ${code}\n--- build output ---\n${log}`,
        ),
      );
    });
  });
}

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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`GET ${url} answered ${response.status}`);
  }

  return response.text();
}

interface SpawnedServer {
  readonly child: ChildProcess;
  /** Last ~4 KB of the dev server's stdout+stderr, for parsing + diagnostics. */
  getLog(): string;
}

/** Follow a spawned server's output, for its port and for diagnostics. */
function followOutput(child: ChildProcess): SpawnedServer {
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

function spawnDevServer(preferredPort: number): SpawnedServer {
  return followOutput(
    spawn("pnpm", ["--filter", CLIENT_PKG, "dev"], {
      // Capture output so we can read the actual bound port from Vite's banner
      // and surface startup failures in the thrown message (not a blind
      // timeout).
      stdio: ["ignore", "pipe", "pipe"],
      // Detached → the child leads its own process group, so stop() can kill
      // the whole group. The child is a `pnpm` wrapper that spawns Vite as its
      // own child; signalling only the wrapper leaves Vite orphaned on the
      // port.
      detached: true,
      cwd: MONOREPO_ROOT,
      // PORT is the preferred port; Vite auto-increments if taken (we parse
      // the real one).
      env: { ...clientEnv(), PORT: String(preferredPort), ...LEAN_DEPS_ENV },
    }),
  );
}

/** `vite preview` over a finished build. It prints the same "Local:" banner
 * as the dev server and moves to the next free port the same way, so the
 * readiness wait below serves both. */
function spawnPreviewServer(
  preferredPort: number,
  outDir: string,
): SpawnedServer {
  return followOutput(
    spawn(
      VITE_BIN,
      [
        "preview",
        "--outDir",
        outDir,
        "--port",
        String(preferredPort),
        "--host",
        "127.0.0.1",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        cwd: CLIENT_DIR,
        env: clientEnv(),
      },
    ),
  );
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
    exitMsg = `client server process exited early (code=${code}, signal=${signal})`;
  });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (exitMsg) {
      throw new Error(
        `${exitMsg}\n--- client server output ---\n${server.getLog()}`,
      );
    }

    const port = parseBoundPort(server.getLog());

    if (port !== null && (await pingPort(port))) {
      return port;
    }

    await sleep(200);
  }

  throw new Error(
    `client server did not report a ready port within ${timeoutMs}ms\n` +
      `--- client server output ---\n${server.getLog()}`,
  );
}

export async function startClientServer(): Promise<ClientServerHandle> {
  // Reuse path: the orchestrating runner (with-server.ts) already started one
  // server and flagged sharing as intentional, passing its actual port down as
  // RTC_DEV_PORT. Cucumber's per-worker hooks land here — adopt that server.
  if (
    process.env[SHARED_DEV_SERVER_ENV] === "1" &&
    (await pingPort(DEV_PORT))
  ) {
    return { port: DEV_PORT, mode: null, stop: async () => {} };
  }

  const mode = resolveServeMode(process.env);

  // Otherwise start our own. Vite picks the first free port at/after the
  // preferred one and tells us which; we read it back rather than guessing.
  if (mode === "build") {
    const outDir = buildOutDir();
    await buildClient(outDir);
    return untilReady(spawnPreviewServer(DEV_PORT, outDir), mode, async () => {
      // Nothing to assert: a build has no dependency pre-bundle to keep lean.
    });
  }

  return untilReady(spawnDevServer(DEV_PORT), mode, (port: number) => {
    return assertDepsServedLean(`http://127.0.0.1:${port}`, fetchText);
  });
}

/** The handle of `server` once it answers and `check` has passed; a server
 * that fails either is stopped before the error is rethrown. */
async function untilReady(
  server: SpawnedServer,
  mode: ServeMode,
  check: (port: number) => Promise<void>,
): Promise<ClientServerHandle> {
  try {
    const port = await awaitReady(server, 30_000);
    await check(port);
    return { port, mode, stop: makeStop(server.child) };
  } catch (err) {
    await makeStop(server.child)();
    throw err;
  }
}
