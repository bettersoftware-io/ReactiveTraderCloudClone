import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export interface DevServerHandle {
  stop(): Promise<void>;
}

const DEV_PORT = 3000;
const DEV_BASE_URL = `http://localhost:${DEV_PORT}`;
// Resolve the monorepo root (two levels up from tests/support/)
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
    return { stop: async () => {} };
  }
  const child: ChildProcess = spawn(
    "pnpm",
    ["--filter", "@rtc/client", "dev"],
    {
      stdio: "ignore",
      detached: false,
      cwd: MONOREPO_ROOT,
      // Omit NODE_OPTIONS so the spawned Vite process does not inherit tsx hooks
      env: { ...process.env, PORT: String(DEV_PORT), NODE_OPTIONS: "" },
    },
  );
  await waitForPort(30_000);
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        const killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        child.once("exit", () => {
          clearTimeout(killTimer);
          resolve();
        });
        child.kill("SIGTERM");
      }),
  };
}
