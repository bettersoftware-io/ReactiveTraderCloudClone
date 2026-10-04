import { expect, test } from "vitest";

import { mergeLineCoverage, percent } from "./mergeLcov.mts";

test("a line either runner hit is covered; the first report's lines are the denominator", () => {
  const merged = mergeLineCoverage(
    createLcov("src/a.ts", [
      [1, 1],
      [2, 0],
      [3, 0],
    ]),
    // The second report hits line 2, and also instruments a line 9 the first
    // does not know: that line is not added to the denominator.
    createLcov("/abs/repo/packages/client-react-native/src/a.ts", [
      [2, 4],
      [9, 1],
    ]),
  );

  expect(merged.files).toEqual([{ file: "src/a.ts", covered: 2, total: 3 }]);
  expect(merged.covered).toBe(2);
  expect(merged.total).toBe(3);
  expect(merged.pct).toBeCloseTo(66.667, 2);
});

test("the two reports are joined on the src/ path, whatever prefix each wrote", () => {
  const merged = mergeLineCoverage(
    createLcov("src/ui/Card.tsx", [[1, 0]]),
    createLcov("/somewhere/else/src/ui/Card.tsx", [[1, 1]]),
  );

  expect(merged.files).toEqual([
    { file: "src/ui/Card.tsx", covered: 1, total: 1 },
  ]);
});

test("a file only the second report knows is kept as that report has it", () => {
  const merged = mergeLineCoverage(
    createLcov("src/a.ts", [[1, 1]]),
    createLcov("/abs/src/onlyUnit.ts", [
      [1, 1],
      [2, 0],
    ]),
  );

  expect(merged.files).toEqual([
    { file: "src/a.ts", covered: 1, total: 1 },
    { file: "src/onlyUnit.ts", covered: 1, total: 2 },
  ]);
  expect(merged.total).toBe(3);
});

test("a file neither runner touched stays in the denominator at zero", () => {
  const merged = mergeLineCoverage(
    createLcov("src/untested.ts", [
      [1, 0],
      [2, 0],
    ]),
    "",
  );

  expect(merged.covered).toBe(0);
  expect(merged.total).toBe(2);
  expect(merged.pct).toBe(0);
});

test("an empty denominator reads 100, not NaN", () => {
  expect(percent(0, 0)).toBe(100);
  expect(mergeLineCoverage("", "").pct).toBe(100);
});

function createLcov(
  file: string,
  lines: readonly (readonly [number, number])[],
): string {
  const records = lines.map(([line, hits]) => {
    return `DA:${line},${hits}`;
  });

  return [`SF:${file}`, ...records, "end_of_record", ""].join("\n");
}
