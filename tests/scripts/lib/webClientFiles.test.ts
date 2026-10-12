import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ROSTER } from "@rtc/domain";

describe.each(createWebClients())(
  "%s: the files its deployed build depends on",
  (client) => {
    /**
     * The deploy guard only greps the built bundle for the demo PASSWORD
     * string (`deploy.yml`), so a committed `.env.production` whose
     * `VITE_DEMO_AUTH` is malformed JSON would still pass it: `parseDevAuth`
     * would then yield an empty roster at runtime and the deployed build
     * would silently stop being hybrid (every login, demo accounts included,
     * posted to the server). This pins the file itself: valid JSON, exactly
     * the roster's usernames, every password a non-empty string.
     */
    it(".env.production's VITE_DEMO_AUTH parses to the roster's usernames with non-empty passwords", () => {
      const parsed: unknown = JSON.parse(readDemoAuthLine(client));

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

    // Dockview's pop-out machinery loads `/popout.html` in the child window,
    // waits for `load`, appends its own container to the body and copies every
    // parent stylesheet across (popoutWindow.js). Without a real file at that
    // path the dev server's SPA fallback boots the ENTIRE app inside the child
    // (its own header under dockview's container) and the deployed site 404s,
    // so the page must exist as a genuine root-level build input. Vercel needs
    // no config change: routing is filesystem-first, so a real dist/popout.html
    // wins over the SPA rewrite.
    it("popout.html is a real empty-body page and a build input", () => {
      const page = readClientFile(client, "popout.html");
      expect(page).toContain("<body></body>");

      const config = readClientFile(client, "vite.config.ts");
      expect(config).toContain("popout.html");
    });
  },
);

const REPO = resolve(import.meta.dirname, "../../..");

function createWebClients(): readonly string[] {
  return ["client-react", "client-solid"];
}

function readClientFile(client: string, file: string): string {
  return readFileSync(resolve(REPO, "packages", client, file), "utf8");
}

function readDemoAuthLine(client: string): string {
  const line = readClientFile(client, ".env.production")
    .split("\n")
    .find((candidate) => {
      return candidate.startsWith("VITE_DEMO_AUTH=");
    });

  if (line === undefined) {
    throw new Error(`${client}/.env.production has no VITE_DEMO_AUTH line`);
  }

  return line.slice("VITE_DEMO_AUTH=".length);
}
