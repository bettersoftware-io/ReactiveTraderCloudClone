import { describe, expect, it } from "vitest";

import { keepViolations, pathOfGrepLine } from "./gateLines.ts";

describe("pathOfGrepLine", () => {
  it("is the file a `grep -H` line came from", () => {
    expect(pathOfGrepLine("src/a.ts:const x = 1;")).toBe("src/a.ts");
  });

  it("stops at the first colon, so a colon in the content does not move the path", () => {
    expect(pathOfGrepLine("src/a.ts:const x: Map<string, number> = y;")).toBe(
      "src/a.ts",
    );
  });
});

describe("keepViolations", () => {
  it("drops a line from an excluded path", () => {
    expect(
      keepViolations(createOutput("src/a.test.ts:fetch(url)"), [".test."]),
    ).toEqual([]);
  });

  it("keeps a line from a kept path even when its content contains an exclude string", () => {
    const line =
      "src/AppRoot.tsx:const dev = import.meta.env.DEV; // see AppRoot.test.tsx";

    expect(keepViolations(createOutput(line), [".test."])).toEqual([line]);
  });

  it("judges a path:line:content line by its path alone", () => {
    const kept = "src/a.ts:12:setTimeout(f, 0); // see a.test.ts";
    const dropped = "src/b.test.ts:7:setTimeout(f, 0);";

    expect(keepViolations(createOutput(kept, dropped), [".test."])).toEqual([
      kept,
    ]);
  });

  it("is not confused by further colons in the content", () => {
    const kept =
      "src/a.ts:3:const t: Record<string, string> = { a: '/node_modules/' };";
    const dropped = "src/node_modules/b.ts:9:const t: number = 1;";

    expect(
      keepViolations(createOutput(kept, dropped), ["/node_modules/"]),
    ).toEqual([kept]);
  });

  it("gives no lines for empty output", () => {
    expect(keepViolations("", [".test."])).toEqual([]);
  });

  it("keeps every non-empty line when there are no excludes", () => {
    const lines = ["src/a.test.ts:x", "src/b.ts:y"];

    expect(keepViolations(createOutput(...lines), [])).toEqual(lines);
  });
});

/** The stdout of a grep that matched `lines`: newline-terminated, with the
 * trailing empty segment `split("\n")` has to cope with. */
function createOutput(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}
