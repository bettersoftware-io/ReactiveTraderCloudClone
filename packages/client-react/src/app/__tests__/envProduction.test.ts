// @vitest-environment node
//
// Node, not jsdom: the file is read from disk, and jsdom rewrites
// `import.meta.url` to an http: URL that `fileURLToPath` rejects. A Vite
// `?raw` import is not an option either — Vite's default `server.fs.deny`
// refuses to serve `.env.*` files, by design.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ROSTER } from "@rtc/domain";

/**
 * The deploy guard only greps the built bundle for the demo PASSWORD string
 * (`deploy.yml`), so a committed `.env.production` whose `VITE_DEMO_AUTH` is
 * malformed JSON would still pass it — `parseDevAuth` would then yield an
 * empty roster at runtime and the deployed build would silently stop being
 * hybrid (every login, demo accounts included, posted to the server). This
 * pins the file itself: valid JSON, exactly the roster's usernames, every
 * password a non-empty string.
 */
describe(".env.production demo roster", () => {
  it("VITE_DEMO_AUTH parses to the roster's usernames with non-empty passwords", () => {
    const parsed: unknown = JSON.parse(readDemoAuthLine());

    expect(parsed).toBeTypeOf("object");
    const roster = parsed as Record<string, unknown>;
    expect(Object.keys(roster).sort()).toEqual(
      ROSTER.map((entry) => {
        return entry.username;
      }).sort(),
    );

    for (const password of Object.values(roster)) {
      expect(typeof password).toBe("string");
      expect((password as string).length).toBeGreaterThan(0);
    }
  });
});

function readDemoAuthLine(): string {
  const file = fileURLToPath(
    new URL("../../../.env.production", import.meta.url),
  );

  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((candidate) => {
      return candidate.startsWith("VITE_DEMO_AUTH=");
    });

  if (line === undefined) {
    throw new Error(".env.production has no VITE_DEMO_AUTH line");
  }

  return line.slice("VITE_DEMO_AUTH=".length);
}
