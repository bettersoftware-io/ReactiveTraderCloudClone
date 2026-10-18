import { execFileSync, spawnSync } from "node:child_process";
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

describe("sync-releases --body", () => {
  it("rewrites the section's links into ones a release body can resolve", () => {
    const body = renderBody("2026-W41");

    expect(body).not.toContain("## 2026-W41");
    expect(body).toContain("- **Hot swap.** It works. #964 #967");
    expect(body).toContain(
      "([`abc123456`](https://github.com/o/r/commit/abc123456ffff))",
    );
    expect(body).toContain("](https://github.com/o/r/blob/main/docs/x.md)");
    expect(body).toContain(
      "](https://github.com/o/r/blob/main/CHANGELOG.md#changelog)",
    );
    expect(body).toContain("[the site](https://example.com/)");
  });

  it("ends with a link back to the week's CHANGELOG.md anchor", () => {
    expect(renderBody("2026-W41")).toContain(
      "[2026-W41 entry](https://github.com/o/r/blob/main/CHANGELOG.md#2026-w41--5-oct--11-oct)",
    );
  });

  it("fails on a cited commit with no definition", () => {
    tmp = mkdtempSync(join(tmpdir(), "sr-"));
    const file = join(tmp, "CHANGELOG.md");
    writeFileSync(
      file,
      "# Changelog\n\n## 2026-W41 — 5 Oct – 11 Oct\n\n- x ([`deadbeef1`])\n",
    );
    const run = spawnSync(
      "node",
      [SCRIPT, "--repo", "o/r", "--changelog", file, "--body", "2026-W41"],
      { encoding: "utf8" },
    );

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("commit [`deadbeef1`] has no definition");
  });
});

describe("sync-releases plan", () => {
  it("creates a missing release, oldest first, and marks only the newest Latest", () => {
    const out = plan({
      tags: ["2026-W40", "2026-W41"],
      releases: [],
      latestTag: null,
    });

    expect(out).toContain("create 2026-W40\ncreate 2026-W41 (latest)\n");
    expect(out).toContain("2 to write, 0 unchanged");
  });

  it("leaves a release alone when its name and body already match", () => {
    const releases = [
      { id: 1, tag: "2026-W40", name: W40_TITLE, body: renderBody("2026-W40") },
      { id: 2, tag: "2026-W41", name: W41_TITLE, body: renderBody("2026-W41") },
    ];

    const out = plan({
      tags: ["2026-W40", "2026-W41"],
      releases,
      latestTag: "2026-W41",
    });

    expect(out).toContain("0 to write, 2 unchanged");
  });

  it("updates a release whose section changed", () => {
    const releases = [
      { id: 1, tag: "2026-W40", name: W40_TITLE, body: "stale notes" },
      { id: 2, tag: "2026-W41", name: W41_TITLE, body: renderBody("2026-W41") },
    ];

    const out = plan({
      tags: ["2026-W40", "2026-W41"],
      releases,
      latestTag: "2026-W41",
    });

    expect(out).toContain("update 2026-W40\n");
    expect(out).toContain("1 to write, 1 unchanged");
  });

  it("moves Latest to the newest week when another release holds it", () => {
    const releases = [
      { id: 1, tag: "2026-W40", name: W40_TITLE, body: renderBody("2026-W40") },
      { id: 2, tag: "2026-W41", name: W41_TITLE, body: renderBody("2026-W41") },
    ];

    const out = plan({
      tags: ["2026-W40", "2026-W41"],
      releases,
      latestTag: "2026-W40",
    });

    expect(out).toContain("update 2026-W41 (latest)\n");
    expect(out).toContain("1 to write, 1 unchanged");
  });

  it("writes just one week with --only, still judging Latest across all", () => {
    const out = plan(
      { tags: ["2026-W40", "2026-W41"], releases: [], latestTag: null },
      ["--only", "2026-W40"],
    );

    expect(out).toContain("create 2026-W40\n");
    expect(out).not.toContain("create 2026-W41");
    expect(out).toContain("1 to write");
  });

  it("never releases a week whose tag does not exist yet", () => {
    const out = plan({ tags: ["2026-W40"], releases: [], latestTag: null });

    expect(out).toContain("create 2026-W40 (latest)\n");
    expect(out).not.toContain("create 2026-W41");
    expect(out).toContain("waiting for a tag: 2026-W41");
  });
});

function renderBody(week: string): string {
  return execFileSync(
    "node",
    [SCRIPT, "--repo", "o/r", "--changelog", writeChangelog(), "--body", week],
    { encoding: "utf8" },
  ).trimEnd();
}

function plan(state: object, extra: string[] = []): string {
  const changelog = writeChangelog();
  const stateFile = join(tmp, "state.json");
  writeFileSync(stateFile, JSON.stringify(state));
  return execFileSync(
    "node",
    [
      SCRIPT,
      "--repo",
      "o/r",
      "--changelog",
      changelog,
      "--state",
      stateFile,
      ...extra,
    ],
    { encoding: "utf8" },
  );
}

function writeChangelog(): string {
  if (tmp === "") {
    tmp = mkdtempSync(join(tmpdir(), "sr-"));
  }

  const file = join(tmp, "CHANGELOG.md");
  writeFileSync(file, createChangelog());
  return file;
}

function createChangelog(): string {
  return [
    "# Changelog",
    "",
    "Intro.",
    "",
    `## ${W41_TITLE}`,
    "",
    "A week.",
    "",
    "- **Hot swap.** It works. [#964] [#967]",
    "- A fix ([`abc123456`]), see [the doc](docs/x.md), [the intro](#changelog)",
    "  and [the site](https://example.com/).",
    "",
    `## ${W40_TITLE}`,
    "",
    "- Earlier. [#900]",
    "",
    "[#900]: https://github.com/o/r/pull/900",
    "[#964]: https://github.com/o/r/pull/964",
    "[#967]: https://github.com/o/r/pull/967",
    "",
    "[`abc123456`]: https://github.com/o/r/commit/abc123456ffff",
    "",
  ].join("\n");
}

const W41_TITLE = "2026-W41 — 5 Oct – 11 Oct";
const W40_TITLE = "2026-W40 — 28 Sep – 4 Oct";
const SCRIPT = resolve(
  import.meta.dirname,
  "../../../scripts/changelog/sync-releases.mts",
);
let tmp = "";
