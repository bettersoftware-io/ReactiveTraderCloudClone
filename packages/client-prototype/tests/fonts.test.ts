import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, "../index.html"), "utf8");

test("index.html preconnects to Google Fonts and loads the five display families", () => {
  expect(HTML).toContain(
    'rel="preconnect" href="https://fonts.googleapis.com"',
  );
  expect(HTML).toContain('href="https://fonts.gstatic.com" crossorigin');

  for (const family of [
    "Chakra+Petch",
    "JetBrains+Mono",
    "IBM+Plex+Sans",
    "IBM+Plex+Mono",
    "Orbitron",
  ]) {
    expect(HTML).toContain(family);
  }

  expect(HTML).toContain("display=swap");
});
