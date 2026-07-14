#!/usr/bin/env node
// Publishes a staging directory into the gh-pages branch WITHOUT disturbing
// sibling subtrees owned by other producers. Each top-level entry of <source>
// replaces the same-named entry on the branch; every other branch entry is
// preserved. Orphan-initialises the branch if it does not exist. Pushes with a
// fetch+rebase retry loop so two producers racing on the branch serialise
// cleanly (they touch disjoint entries, so the rebase never conflicts).
//
// Zero dependencies (Node built-ins only). Git credentials come from the ambient
// checkout (actions/checkout persists them on `origin`).
//
// Usage:
//   node scripts/pages/publish-to-pages.mjs --source <dir> [--branch gh-pages]
//        [--remote origin] [--message <commit message>]

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();
}

function main() {
  const source = flag("source");
  const branch = flag("branch", "gh-pages");
  const remote = flag("remote", "origin");
  const message = flag("message", `publish to ${branch}`);
  if (!source) {
    console.error(
      "usage: publish-to-pages.mjs --source <dir> [--branch gh-pages] [--remote origin] [--message <msg>]",
    );
    process.exit(2);
  }

  const owned = readdirSync(source);
  if (owned.length === 0) {
    console.log("nothing to publish (empty source)");
    return;
  }

  const remoteRef = `refs/remotes/${remote}/${branch}`;
  const work = mkdtempSync(join(tmpdir(), "pages-"));
  let branchExists = false;
  try {
    git(["fetch", "--no-tags", remote, `+refs/heads/${branch}:${remoteRef}`]);
    git(["rev-parse", "--verify", "--quiet", remoteRef]);
    branchExists = true;
  } catch {
    branchExists = false;
  }

  try {
    if (branchExists) {
      git(["worktree", "add", "-B", branch, work, remoteRef]);
    } else {
      git(["worktree", "add", "--detach", work]);
      git(["checkout", "--orphan", branch], work);
      try {
        git(["rm", "-rf", "--quiet", "."], work);
      } catch {
        // Orphan index already empty — nothing to clear.
      }
    }

    for (const entry of owned) {
      rmSync(join(work, entry), { recursive: true, force: true });
      cpSync(join(source, entry), join(work, entry), { recursive: true });
    }

    git(
      ["config", "user.email", "github-actions[bot]@users.noreply.github.com"],
      work,
    );
    git(["config", "user.name", "github-actions[bot]"], work);
    git(["add", "-A"], work);
    if (git(["status", "--porcelain"], work) === "") {
      console.log("no changes to publish");
      return;
    }
    git(["commit", "-m", message], work);

    let pushed = false;
    for (let attempt = 1; attempt <= 5 && !pushed; attempt++) {
      try {
        git(["push", remote, branch], work);
        pushed = true;
      } catch {
        console.log(
          `push rejected (attempt ${attempt}); rebasing on ${branch}`,
        );
        git(
          ["fetch", "--no-tags", remote, `+refs/heads/${branch}:${remoteRef}`],
          work,
        );
        git(["rebase", remoteRef], work);
      }
    }
    if (!pushed) {
      throw new Error(`failed to push ${branch} after retries`);
    }
    console.log(`published [${owned.join(", ")}] to ${branch}`);
  } finally {
    try {
      git(["worktree", "remove", "--force", work]);
    } catch {
      // best-effort cleanup
    }
    rmSync(work, { recursive: true, force: true });
  }
}

main();
