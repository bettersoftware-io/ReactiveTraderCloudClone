import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "vitest";

// Each `dev:ios*` data-source mode sets `EXPO_PUBLIC_SERVER_URL`, which
// `app.config.ts` copies into `extra.serverUrl`. Were `extra` hashed, every
// switch between modes would regenerate `ios/` from scratch (~30 s plus a
// fresh native build) for a value that reaches the app through Metro.
test("switching data-source mode leaves the native fingerprint unchanged", async () => {
  const simulator = await fingerprintWithServerUrl("");
  const localServer = await fingerprintWithServerUrl("ws://localhost:4000");

  expect(localServer).toBe(simulator);
  // Not a timer wait: each fingerprint is a node process that loads the app
  // config in a child process of its own (~1 s locally), which a loaded CI
  // runner can stretch.
}, 30_000);

/**
 * The fingerprint as a `dev:*` script computes it, in a process of its own.
 * Not in this one: under vitest's `vmThreads` pool, `vi.stubEnv` changes the
 * test's `process.env` but not the environment the fingerprint's own child
 * process inherits — so an in-process version of this test compared one value
 * with itself, and passed with `extra` hashed (mutation-checked 2026-10-19).
 */
async function fingerprintWithServerUrl(serverUrl: string): Promise<string> {
  const { stdout } = await promisify(execFile)(
    "node",
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--input-type=module",
      "-e",
      `const { fingerprintNativeInputs } = await import(${JSON.stringify(NATIVE_PROJECT)});
       console.log(await fingerprintNativeInputs("ios"));`,
    ],
    { env: { ...process.env, EXPO_PUBLIC_SERVER_URL: serverUrl } },
  );

  return stdout.trim();
}

const NATIVE_PROJECT = fileURLToPath(
  new URL("nativeProject.ts", import.meta.url),
);
