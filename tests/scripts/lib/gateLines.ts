// What the grep gates (`tests/scripts/grep-gates.ts`) do with grep's output.
//
// A gate runs `grep -H`, so every output line is `path:content` (or
// `path:line:content` under `-n`). An exclude names a FILE — a directory, a
// suffix such as `.test.`, one path — so it is matched against the path alone.
// Matched against the whole line, a violating line whose CONTENT happened to
// contain an exclude string (`import.meta.env.DEV; // see foo.test.ts`) was
// dropped, and the gate passed on the very thing it bans.
//
// `-H` is what makes the path there to read: `grep -r` over a single FILE
// operand prints bare lines, with no `path:` at all.

/** The file a `grep -H` output line came from: everything before the first
 * `:`. A path in this repo never contains one; the content may. */
export function pathOfGrepLine(line: string): string {
  const colon = line.indexOf(":");

  return colon === -1 ? line : line.slice(0, colon);
}

/** The lines of a `grep -H` output that are violations: non-empty, and whose
 * FILE PATH contains none of `excludes`. */
export function keepViolations(
  output: string,
  excludes: readonly string[],
): string[] {
  return output
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      const path = pathOfGrepLine(line);

      return !excludes.some((exclude) => {
        return path.includes(exclude);
      });
    });
}
