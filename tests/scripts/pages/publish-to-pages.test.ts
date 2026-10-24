import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  if (root !== "") {
    rmSync(root, { recursive: true, force: true });
  }
});

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
      .filter((f) => {
        return f !== ".git";
      })
      .sort();

    expect(top).toContain("alpha"); // producer A subtree survived producer B's publish
    expect(top).toContain("beta"); // producer B subtree present
    expect(top).toContain("root.txt"); // shared root file preserved
  });

  it("leaves the branch as one parentless commit after every publish", () => {
    root = mkdtempSync(join(tmpdir(), "pp-"));
    const { bare, work } = seededClones(root);

    publish(work, stage(root, "stageA", { "alpha/a.txt": "A" }), "A");
    publish(work, stage(root, "stageB", { "beta/b.txt": "B" }), "B");
    publish(work, stage(root, "stageA2", { "alpha/a.txt": "A2" }), "A2");

    const verify = join(root, "verify");
    execFileSync("git", ["clone", "-b", "gh-pages", bare, verify]);

    expect(git(verify, "rev-list", "--count", "HEAD")).toBe("1"); // history replaced, not appended
    expect(git(verify, "log", "-1", "--format=%s")).toBe("A2");
    expect(git(verify, "show", "HEAD:alpha/a.txt")).toBe("A2"); // the latest publish won
    expect(git(verify, "show", "HEAD:beta/b.txt")).toBe("B"); // the sibling subtree survived
  });

  it("keeps a racing producer's update that lands between its fetch and its push", () => {
    root = mkdtempSync(join(tmpdir(), "pp-"));
    const { bare, work } = seededClones(root);
    const rival = join(root, "rival");
    execFileSync("git", ["clone", bare, rival]);
    publish(rival, stage(root, "stageSeed", { "seed/s.txt": "S" }), "seed");
    const rivalStage = stage(root, "stageB", { "beta/b.txt": "B" });

    // The moment A's fetch records the branch tip, producer B publishes from
    // its own clone — so A builds its tree on a tip that is already stale. The
    // window must sit BEFORE A's push connects: once the server has advertised
    // the tip, it refuses a stale update even to a plain force-push, so only a
    // race here can tell a lease from no lease.
    const flag = join(root, "raced");
    const hook = join(work, ".git", "hooks", "reference-transaction");
    writeFileSync(
      hook,
      [
        "#!/bin/sh",
        // git exports GIT_DIR & co. to hooks; clear them so the rival's git
        // commands act on the rival clone rather than on this one.
        "unset $(git rev-parse --local-env-vars)",
        '[ "$1" = committed ] || exit 0',
        "grep -q ' refs/remotes/origin/gh-pages$' || exit 0",
        `if [ ! -e "${flag}" ]; then`,
        `  touch "${flag}"`,
        `  cd "${rival}" && node "${SCRIPT}" --source "${rivalStage}" --message B`,
        "fi",
        "exit 0",
        "",
      ].join("\n"),
    );
    chmodSync(hook, 0o755);

    publish(work, stage(root, "stageA", { "alpha/a.txt": "A" }), "A");

    const verify = join(root, "verify");
    execFileSync("git", ["clone", "-b", "gh-pages", bare, verify]);

    expect(existsSync(flag)).toBe(true); // witness: the race really happened
    expect(git(verify, "show", "HEAD:beta/b.txt")).toBe("B"); // B's update survived A's push
    expect(git(verify, "show", "HEAD:alpha/a.txt")).toBe("A");
    expect(git(verify, "show", "HEAD:seed/s.txt")).toBe("S");
    expect(git(verify, "rev-list", "--count", "HEAD")).toBe("1");
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

  it("exits 2 with a friendly message when --source is not a directory", () => {
    root = mkdtempSync(join(tmpdir(), "pp-"));
    let status = 0;
    let stderr = "";

    try {
      execFileSync("node", [SCRIPT, "--source", join(root, "does-not-exist")], {
        encoding: "utf8",
      });
    } catch (error) {
      const e = error as ExecError;
      status = e.status ?? 0;
      stderr = String(e.stderr ?? "");
    }

    expect(status).toBe(2);
    expect(stderr).toContain("not a directory");
  });

  it("surfaces git's stderr and exits non-zero on a git failure", () => {
    root = mkdtempSync(join(tmpdir(), "pp-"));
    const source = stage(root, "stageA", { "alpha/a.txt": "A" });
    let status = 0;
    let stderr = "";

    // cwd is not a git repository, so `git worktree add` inside the script fails.
    try {
      execFileSync("node", [SCRIPT, "--source", source], {
        cwd: root,
        encoding: "utf8",
      });
    } catch (error) {
      const e = error as ExecError;
      status = e.status ?? 0;
      stderr = String(e.stderr ?? "");
    }

    expect(status).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/not a git repository|fatal/);
  });
});

type ExecError = { status?: number; stderr?: string };

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** A bare origin seeded with one `main` commit, plus a clone to publish from. */
interface SeededClones {
  bare: string;
  work: string;
}

function seededClones(base: string): SeededClones {
  const bare = join(base, "origin.git");
  execFileSync("git", ["init", "--bare", "-b", "main", bare]);
  const seed = join(base, "seed");
  execFileSync("git", ["clone", bare, seed]);
  writeFileSync(join(seed, "README.md"), "seed");
  git(seed, "config", "user.email", "t@t");
  git(seed, "config", "user.name", "t");
  git(seed, "add", "-A");
  git(seed, "commit", "-m", "seed");
  git(seed, "push", "origin", "main");
  const work = join(base, "work");
  execFileSync("git", ["clone", bare, work]);

  return { bare, work };
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

const SCRIPT = resolve(
  import.meta.dirname,
  "../../../scripts/pages/publish-to-pages.mts",
);

let root = "";
