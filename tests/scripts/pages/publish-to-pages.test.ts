import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(
  __dirname,
  "../../../scripts/pages/publish-to-pages.mjs",
);

let root = "";
afterEach(() => {
  if (root !== "") {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function stage(
  base: string,
  name: string,
  files: Record<string, string>,
): string {
  const dir = join(base, name);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function publish(cwd: string, source: string, message: string): void {
  execFileSync("node", [SCRIPT, "--source", source, "--message", message], {
    cwd,
    encoding: "utf8",
  });
}

describe("publish-to-pages", () => {
  it("keeps two producers' subtrees side by side and preserves shared root files", () => {
    root = mkdtempSync(join(tmpdir(), "pp-"));
    const bare = join(root, "origin.git");
    execFileSync("git", ["init", "--bare", "-b", "main", bare]);

    // Seed origin/main with one commit so `git worktree add --detach` has a base.
    const seed = join(root, "seed");
    execFileSync("git", ["clone", bare, seed]);
    writeFileSync(join(seed, "README.md"), "seed");
    git(seed, "config", "user.email", "t@t");
    git(seed, "config", "user.name", "t");
    git(seed, "add", "-A");
    git(seed, "commit", "-m", "seed");
    git(seed, "push", "origin", "main");

    const work = join(root, "work");
    execFileSync("git", ["clone", bare, work]);

    // Producer A publishes { alpha/, root.txt }; Producer B publishes { beta/ }.
    publish(
      work,
      stage(root, "stageA", { "alpha/a.txt": "A", "root.txt": "shared" }),
      "A",
    );
    publish(work, stage(root, "stageB", { "beta/b.txt": "B" }), "B");

    const verify = join(root, "verify");
    execFileSync("git", ["clone", "-b", "gh-pages", bare, verify]);
    const top = readdirSync(verify)
      .filter((f) => f !== ".git")
      .sort();

    expect(top).toContain("alpha"); // producer A subtree survived producer B's publish
    expect(top).toContain("beta"); // producer B subtree present
    expect(top).toContain("root.txt"); // shared root file preserved
  });

  it("is a no-op when the source content is unchanged", () => {
    root = mkdtempSync(join(tmpdir(), "pp-"));
    const bare = join(root, "origin.git");
    execFileSync("git", ["init", "--bare", "-b", "main", bare]);
    const seed = join(root, "seed");
    execFileSync("git", ["clone", bare, seed]);
    writeFileSync(join(seed, "README.md"), "seed");
    git(seed, "config", "user.email", "t@t");
    git(seed, "config", "user.name", "t");
    git(seed, "add", "-A");
    git(seed, "commit", "-m", "seed");
    git(seed, "push", "origin", "main");

    const work = join(root, "work");
    execFileSync("git", ["clone", bare, work]);
    const s = stage(root, "stageA", { "alpha/a.txt": "A" });
    publish(work, s, "first");
    const before = git(work, "rev-parse", "refs/remotes/origin/gh-pages");
    publish(work, s, "second"); // identical content
    git(work, "fetch", "origin", "gh-pages");
    const after = git(work, "rev-parse", "refs/remotes/origin/gh-pages");
    expect(after).toBe(before); // no new commit
  });
});
