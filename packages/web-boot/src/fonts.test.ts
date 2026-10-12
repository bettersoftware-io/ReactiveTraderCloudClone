import { readFileSync } from "node:fs";
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
});

/** `fonts.ts` as text: a test cannot see a CSS import, only read it. */
function readFontsSource(): string {
  return readFileSync(join(import.meta.dirname, "fonts.ts"), "utf8");
}

/** One `document.fonts.load()` spec per `@fontsource` import in `source`, in source order. */
function specsOfImports(source: string): string[] {
  const families = createFamilyNames();
  const imports = source.matchAll(
    /^import "@fontsource\/([a-z-]+)\/(\d+)\.css";$/gm,
  );

  return Array.from(imports, ([, slug, weight]) => {
    const family = families[slug];

    if (family === undefined) {
      throw new Error(
        `fonts.ts imports @fontsource/${slug}, which this test cannot name`,
      );
    }

    return `${weight} 16px "${family}"`;
  });
}

/** The family name each `@fontsource` package registers, by package slug. */
function createFamilyNames(): Record<string, string> {
  return {
    "chakra-petch": "Chakra Petch",
    "ibm-plex-mono": "IBM Plex Mono",
    "ibm-plex-sans": "IBM Plex Sans",
    "jetbrains-mono": "JetBrains Mono",
    orbitron: "Orbitron",
  };
}
