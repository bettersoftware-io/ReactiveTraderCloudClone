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
    const reads = sql.match(/raw_user_meta_data\s*->>\s*'[^']+'/gi) ?? [];

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

  it("keeps profiles.email and the confirmation time in sync", () => {
    expect(sql).toContain("update of email, email_confirmed_at");
  });

  it("reads sign-up metadata only as the display name, by any operator", () => {
    // Case-insensitive: SQL identifiers fold, so RAW_USER_META_DATA is the
    // same column and must be counted too.
    const anyRead = sql.match(/raw_user_meta_data/gi) ?? [];
    const displayNameReads =
      sql.match(/raw_user_meta_data\s*->>\s*'display_name'/gi) ?? [];

    expect(anyRead.length).toBeGreaterThan(0);
    expect(anyRead.length).toBe(displayNameReads.length);
  });

  it("never turns row-level security off or relaxes it", () => {
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
    expect(sql).not.toMatch(/no\s+force\s+row/i);
  });

  it("grants nothing on profiles to anon, authenticated or public", () => {
    expect(sql).not.toMatch(
      /grant\s[^;]*\bon\s+(table\s+)?public\.profiles\s+to\s+[^;]*\b(anon|authenticated|public)\b/i,
    );
  });

  it.each(["create_profile_for_user", "sync_profile_confirmation"])(
    "revokes execute on the trigger function %s from public, anon and authenticated",
    (fn: string) => {
      expect(sql).toMatch(
        new RegExp(
          `revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\(\\)\\s+from\\s+public,\\s*anon,\\s*authenticated\\s*;`,
          "i",
        ),
      );
    },
  );

  it("grants nothing on all tables in the schema to anon, authenticated or public", () => {
    expect(sql).not.toMatch(
      /grant\s[^;]*\bon\s+all\s+tables\s+in\s+schema\s+public\s+to\s+[^;]*\b(anon|authenticated|public)\b/i,
    );
  });

  // A describe body runs fully before its cases, so `sql` is set by then.
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
