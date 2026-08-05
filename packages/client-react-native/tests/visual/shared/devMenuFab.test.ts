import { execFile } from "node:child_process";

import { expect, test, vi } from "vitest";

import { hideDevMenuFab, restoreDevMenuFab } from "./devMenuFab";

test("hiding writes the dev-menu's own preference key as false", async () => {
  const calls = stubExecFile(false);
  await hideDevMenuFab("UDID-1");
  expect(calls).toEqual([
    [
      "simctl",
      "spawn",
      "UDID-1",
      "defaults",
      "write",
      "io.bettersoftware.rtcmobile",
      "EXDevMenuShowFloatingActionButton",
      "-bool",
      "NO",
    ],
  ]);
});

// `defaults delete`, not `write -bool YES`: restoring to "no opinion" hands the
// button back to whatever default the installed dev-client ships, where writing
// `true` would pin it to a value this harness chose.
test("restoring deletes the key rather than writing a value back", async () => {
  const calls = stubExecFile(false);
  await restoreDevMenuFab("UDID-1");
  expect(calls[0]).toContain("delete");
  expect(calls[0]).not.toContain("-bool");
});

// Both are best-effort, mirroring `pinStatusBar`: a simulator that will not
// take the write should cost a noisier golden, never a failed run. Without
// this, an unbooted device would abort a whole capture sweep over dev-tooling
// chrome that is not even ours.
test("neither call throws when simctl refuses", async () => {
  stubExecFile(true);
  await expect(hideDevMenuFab("UDID-1")).resolves.toBeUndefined();
  await expect(restoreDevMenuFab("UDID-1")).resolves.toBeUndefined();
});

vi.mock("node:child_process", () => {
  return { execFile: vi.fn() };
});

/** Records the argv of every `execFile` call and settles it either way.
 *
 * `promisify(execFile)` appends a node-style callback, so the mock MUST invoke
 * it — a mock that just records would leave every promise pending and the
 * tests would time out rather than fail. */
function stubExecFile(fail: boolean): string[][] {
  const calls: string[][] = [];

  vi.mocked(execFile).mockImplementation(((
    _command: string,
    args: string[],
    callback: ExecFileCallback,
  ) => {
    calls.push(args);
    callback(fail ? new Error("simctl refused") : null, {
      stdout: "",
      stderr: "",
    });
    return undefined;
  }) as unknown as typeof execFile);

  return calls;
}

type ExecFileCallback = (error: Error | null, result: ExecFileResult) => void;

interface ExecFileResult {
  stdout: string;
  stderr: string;
}
