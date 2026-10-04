import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// packages/server/src/accounts → the repo root's supabase/migrations.
const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../../supabase/migrations", import.meta.url),
);

/**
 * The `profiles` table is private to the server by construction: RLS on, no
 * policy, so the anon and authenticated roles can do nothing. A later
 * migration that added a policy, or let sign-up metadata set a privilege,
 * would open it without any server code changing — so the SQL is pinned.
 */
describe("supabase migrations", () => {
  it("enables row-level security on profiles", () => {
    expect(sql).toMatch(
      /alter table public\.profiles enable row level security/i,
    );
  });

  it("defines no policy at all", () => {
    expect(sql).not.toMatch(/create\s+policy/i);
  });

  it("revokes table access from the anon and authenticated roles", () => {
    expect(sql).toMatch(
      /revoke all on public\.profiles from anon, authenticated/i,
    );
  });

  it("reads only the display name from sign-up metadata", () => {
    const reads = sql.match(/raw_user_meta_data\s*->>\s*'[^']+'/g) ?? [];

    expect(reads.length).toBeGreaterThan(0);

    for (const read of reads) {
      expect(read).toContain("'display_name'");
    }
  });

  it("pins the search path of every security-definer function", () => {
    const definers = sql.match(/security definer[^;$]*/gi) ?? [];

    expect(definers.length).toBeGreaterThan(0);

    for (const definer of definers) {
      expect(definer).toMatch(/set search_path = ''/i);
    }
  });

  const sql = readAllMigrations();
});

function readAllMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      return name.endsWith(".sql");
    })
    .sort()
    .map((name) => {
      return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    })
    .join("\n");
}
