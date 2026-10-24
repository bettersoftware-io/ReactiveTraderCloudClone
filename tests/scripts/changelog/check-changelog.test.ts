import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  if (tmp !== "") {
    rmSync(tmp, { recursive: true, force: true });
    tmp = "";
  }
});

describe("check-changelog weeks", () => {
  it("passes a finished week that cites exactly the PRs merged in it", () => {
    const run = check(createChangelog(["[#1] [#2]", "[#3]"]), AFTER_W41);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("0 error(s), 0 week(s) still to write");
  });

  it("fails a finished week that leaves out a PR merged in it", () => {
    const run = check(createChangelog(["[#1]", "[#3]"]), AFTER_W41);

    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      "2026-W41: leaves out 1 PR(s) merged that week: #2",
    );
  });

  it("reports the current week as partial instead of failing it", () => {
    const run = check(createChangelog(["[#1]", "[#3]"]), DURING_W41);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("2026-W41: partial (the week is not over)");
    expect(run.stdout).not.toContain("leaves out");
  });

  it("fails a week that cites a PR merged in another week", () => {
    const run = check(createChangelog(["[#1] [#2] [#3]", "[#3]"]), AFTER_W41);

    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      "2026-W41: cites #3, which merged in 2026-W40",
    );
  });

  it("fails a citation of a PR that never merged, even in the current week", () => {
    const run = check(createChangelog(["[#1] [#2] [#9]", "[#3]"]), DURING_W41);

    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      "2026-W41: cites #9, which is not a merged PR",
    );
  });

  it("reports a finished week with merged PRs and no section as unwritten", () => {
    const merged = [...MERGED, { number: 4, mergedAt: "2026-10-13T09:00:00Z" }];
    const run = check(
      createChangelog(["[#1] [#2]", "[#3]"]),
      AFTER_W42,
      merged,
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("2026-W42: unwritten (1 PRs merged)");
  });

  it("does not report the current week as unwritten before it ends", () => {
    const merged = [...MERGED, { number: 4, mergedAt: "2026-10-13T09:00:00Z" }];
    const run = check(
      createChangelog(["[#1] [#2]", "[#3]"]),
      DURING_W42,
      merged,
    );

    expect(run.stdout).not.toContain("2026-W42");
    expect(run.stdout).toContain("0 week(s) still to write");
  });
});

describe("check-changelog definitions", () => {
  it("fails a cited PR with no definition", () => {
    const text = createChangelog(["[#1] [#2]", "[#3]"]).replace(
      "[#2]: https://github.com/o/r/pull/2\n",
      "",
    );

    expect(check(text, AFTER_W41).stdout).toContain(
      "definitions: [#2] is cited but not defined",
    );
  });

  it("fails a definition nothing cites", () => {
    const text = `${createChangelog(["[#1] [#2]", "[#3]"])}[#7]: https://github.com/o/r/pull/7\n`;

    expect(check(text, AFTER_W41).stdout).toContain(
      "definitions: [#7] is defined but never cited",
    );
  });

  it("fails a definition that points at another PR", () => {
    const text = createChangelog(["[#1] [#2]", "[#3]"]).replace(
      "[#2]: https://github.com/o/r/pull/2",
      "[#2]: https://github.com/o/r/pull/20",
    );

    expect(check(text, AFTER_W41).stdout).toContain(
      "definitions: [#2] points at https://github.com/o/r/pull/20",
    );
  });

  it("fails PR definitions out of ascending order", () => {
    const text = createChangelog(["[#1] [#2]", "[#3]"]).replace(
      "[#1]: https://github.com/o/r/pull/1\n[#2]: https://github.com/o/r/pull/2\n",
      "[#2]: https://github.com/o/r/pull/2\n[#1]: https://github.com/o/r/pull/1\n",
    );

    expect(check(text, AFTER_W41).stdout).toContain(
      "definitions: the [#n] block is not in ascending order",
    );
  });

  it("matches commit citations to commit definitions both ways", () => {
    const cited = createChangelog(["[#1] [#2] ([`abc123456`])", "[#3]"]);
    const orphan = `${createChangelog(["[#1] [#2]", "[#3]"])}[\`def456789\`]: https://github.com/o/r/commit/def456789\n`;

    expect(check(cited, AFTER_W41).stdout).toContain(
      "definitions: [`abc123456`] is cited but not defined",
    );
    expect(check(orphan, AFTER_W41).stdout).toContain(
      "definitions: [`def456789`] is defined but never cited",
    );
  });
});

interface CheckRun {
  status: number | null;
  stdout: string;
}

function check(
  changelog: string,
  now: string,
  merged: object[] = MERGED,
): CheckRun {
  if (tmp === "") {
    tmp = mkdtempSync(join(tmpdir(), "cc-"));
  }

  const file = join(tmp, "CHANGELOG.md");
  const mergedFile = join(tmp, "merged.json");
  writeFileSync(file, changelog);
  writeFileSync(mergedFile, JSON.stringify(merged));
  const run = spawnSync(
    "node",
    [
      SCRIPT,
      "--repo",
      "o/r",
      "--changelog",
      file,
      "--merged",
      mergedFile,
      "--now",
      now,
    ],
    { encoding: "utf8" },
  );
  return { status: run.status, stdout: run.stdout };
}

// Two weeks, newest first; each body is one bullet of citations. The
// definitions are generated from every PR the bodies cite, ascending.
function createChangelog([w41, w40]: [string, string]): string {
  const cited = [
    ...new Set(
      [...`${w41} ${w40}`.matchAll(/\[#(\d+)\]/g)].map((m) => {
        return m[1];
      }),
    ),
  ].sort((a, b) => {
    return Number(a) - Number(b);
  });
  return [
    "# Changelog",
    "",
    "## 2026-W41 — 5 Oct – 11 Oct",
    "",
    `- Things. ${w41}`,
    "",
    "## 2026-W40 — 28 Sep – 4 Oct",
    "",
    `- Earlier things. ${w40}`,
    "",
    ...cited.map((n) => {
      return `[#${n}]: https://github.com/o/r/pull/${n}`;
    }),
    "",
  ].join("\n");
}

// #1 and #2 merged in W41 (#2 on its last evening), #3 in W40.
const MERGED = [
  { number: 1, mergedAt: "2026-10-06T10:00:00Z" },
  { number: 2, mergedAt: "2026-10-11T22:40:00Z" },
  { number: 3, mergedAt: "2026-09-30T12:00:00Z" },
];
const DURING_W41 = "2026-10-11T13:00:00Z";
const AFTER_W41 = "2026-10-12T06:00:00Z";
const AFTER_W42 = "2026-10-19T06:00:00Z";
const DURING_W42 = "2026-10-14T12:00:00Z";
const SCRIPT = resolve(
  import.meta.dirname,
  "../../../scripts/changelog/check-changelog.mts",
);
let tmp = "";
