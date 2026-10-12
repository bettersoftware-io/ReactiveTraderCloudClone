import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FONT_LOAD_SPECS } from "#/fonts";

describe("the font manifest", () => {
  it("lists a face for each of the 15 stylesheets it imports", () => {
    expect(FONT_LOAD_SPECS).toHaveLength(15);
    expect(specsOfImports(readFontsSource())).toHaveLength(15);
  });

  it("force-loads exactly the faces its imports register, in order", () => {
    expect(FONT_LOAD_SPECS).toEqual(specsOfImports(readFontsSource()));
  });

  it("refuses an @fontsource import it cannot read a face from", () => {
    expect(() => {
      return specsOfImports('import "@fontsource/orbitron/700-italic.css";');
    }).toThrow('import "@fontsource/orbitron/700-italic.css";');
  });
});

/** `fonts.ts` as text: a test cannot see a CSS import, only read it. */
function readFontsSource(): string {
  return readFileSync(join(import.meta.dirname, "fonts.ts"), "utf8");
}

/**
 * One `document.fonts.load()` spec per `@fontsource` import in `source`, in source
 * order. The family comes from the package's own stylesheet, so a misspelling in
 * `FONT_LOAD_SPECS` cannot be matched by a copy of it here. A line that starts like
 * an `@fontsource` import but is not `<weight>.css` throws, never skips.
 */
function specsOfImports(source: string): string[] {
  const lines = source.split("\n").filter((line) => {
    return line.startsWith('import "@fontsource');
  });

  return lines.map((line) => {
    const match = /^import "@fontsource\/([a-z-]+)\/(\d+)\.css";$/.exec(line);

    if (match === null) {
      throw new Error(`cannot read a face from: ${line}`);
    }

    const [, slug, weight] = match;

    return `${weight} 16px "${readFamilyOf(`@fontsource/${slug}/${weight}.css`)}"`;
  });
}

/** The `font-family` the stylesheet declares. */
function readFamilyOf(stylesheet: string): string {
  const css = readFileSync(
    createRequire(import.meta.url).resolve(stylesheet),
    "utf8",
  );
  const family = /font-family:\s*'([^']+)'/.exec(css)?.[1];

  if (family === undefined) {
    throw new Error(`${stylesheet} declares no font-family`);
  }

  return family;
}
