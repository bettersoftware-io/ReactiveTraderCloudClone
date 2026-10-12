// What the grep gates (`tests/scripts/grep-gates.ts`) do with grep's output.
//
// A gate runs `grep -H`, so every output line is `path:content` (or
// `path:line:content` under `-n`). An exclude names a FILE — a directory, a
// suffix such as `.test.`, one path — so it is matched against the path alone.
// Matched against the whole line, a violating line whose CONTENT happened to
// contain an exclude string (`import.meta.env.DEV; // see foo.test.ts`) would
// be dropped, and the gate would pass on the very thing it bans.
//
// `-H` is what makes the path there to read: `grep -r` over a single FILE
// operand prints bare lines, with no `path:` at all. `gateGrepArgs` is the one
// place the flags are spelled, so every gate's output is `path:line:content`.

/** The argument list of the grep every gate runs: recursive, extended regex,
 * with the line number and, always, the file path (`-H`). */
export function gateGrepArgs(
  pattern: string,
  paths: readonly string[],
): string[] {
  return ["-rnHE", pattern, ...paths];
}

/** The file a `grep -H` output line came from: everything before the first
 * `:`. A path in this repo never contains one; the content may. A line without
 * a colon (grep's own `Binary file … matches`) is returned whole: it matches no
 * exclude and stays a violation, so the gate fails loudly. */
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
