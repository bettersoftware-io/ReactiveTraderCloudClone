/**
 * What a failed `maestro test` says about the run, read from the error
 * `execFile` rejects with. Maestro exits non-zero when any flow fails, and its
 * stdout then carries one `[Failed] <flow> (<time>) (<reason>)` line per
 * failed flow among the `[Passed]` ones.
 */

/** The `[Failed] …` lines of a rejected `maestro test`, in run order. Empty
 * when the failure names no flow: Maestro could not start, found no device, or
 * the error is not a child-process one. */
export function failedFlowLines(error: unknown): string[] {
  if (typeof error !== "object" || error === null || !("stdout" in error)) {
    return [];
  }

  const { stdout } = error;

  if (typeof stdout !== "string") {
    return [];
  }

  return stdout
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .filter((line) => {
      return line.startsWith("[Failed] ");
    });
}

/** The verdict for a scenario whose flow never reached `takeScreenshot`. It is
 * worded apart from `FAIL`: nothing was compared, so it says nothing about the
 * pixels. */
export function noShotLine(id: string): string {
  return `NO SHOT  ${id}  (its flow took no screenshot — a capture failure, not a pixel verdict)`;
}
