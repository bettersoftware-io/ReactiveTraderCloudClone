import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(
  __dirname,
  "../../../scripts/pages/build-presentations-index.mjs",
);

let tmp = "";
afterEach(() => {
  if (tmp !== "") {
    rmSync(tmp, { recursive: true, force: true });
  }
});

describe("build-presentations-index", () => {
  it("derives titles from filenames, lists newest first, links the PDF", () => {
    const dir = fixture();
    const out = join(dir, "index.html");
    execFileSync("node", [SCRIPT, dir, out]);
    const html = readFileSync(out, "utf8");

    expect(html).toContain(">Clean Architecture case study<");
    expect(html).toContain(">Intro Talk<");
    expect(html).toContain(
      'href="./2026-07-14/Clean-Architecture-case-study.html"',
    );
    expect(html).toContain(
      'href="./2026-07-14/Clean-Architecture-case-study.pdf"',
    );
    // No PDF sibling for the intro talk → no pdf link for it.
    expect(html).not.toContain("2026-06-01/Intro_Talk.pdf");
    // Newest folder first.
    expect(html.indexOf("Clean Architecture")).toBeLessThan(
      html.indexOf("Intro Talk"),
    );
  });

  it("renders an empty-state row when there are no decks", () => {
    tmp = mkdtempSync(join(tmpdir(), "pi-"));
    const out = join(tmp, "index.html");
    execFileSync("node", [SCRIPT, tmp, out]);
    expect(readFileSync(out, "utf8")).toContain(
      "No presentations published yet",
    );
  });
});

function fixture(): string {
  tmp = mkdtempSync(join(tmpdir(), "pi-"));
  mkdirSync(join(tmp, "2026-07-14"), { recursive: true });
  writeFileSync(
    join(tmp, "2026-07-14", "Clean-Architecture-case-study.html"),
    "x",
  );
  writeFileSync(
    join(tmp, "2026-07-14", "Clean-Architecture-case-study.pdf"),
    "x",
  );
  mkdirSync(join(tmp, "2026-06-01"), { recursive: true });
  writeFileSync(join(tmp, "2026-06-01", "Intro_Talk.html"), "x");
  return tmp;
}
