#!/usr/bin/env node
// Publishes a staging directory into the gh-pages branch WITHOUT disturbing
// sibling subtrees owned by other producers. Each top-level entry of <source>
// replaces the same-named entry on the branch; every other branch entry is
// preserved.
//
// The branch keeps NO history: every publish replaces it with one parentless
// commit of the merged tree. GitHub Pages serves only the tip, and appending a
// commit per publish grew the repository by ~266 MB of report snapshots nobody
// could use (docs/IDEAS.md, "Shrink the repository"). Because that push is a
// force-push, it carries a lease on the tip the tree was built from: if another
// producer published in between, the push is refused, and the tree is rebuilt
// on the new tip and pushed again — so a racing producer's subtree is never
// overwritten with a stale copy.
//
// Zero dependencies (Node built-ins only). Git credentials come from the ambient
// checkout (actions/checkout persists them on `origin`).
//
// Usage:
//   node scripts/pages/publish-to-pages.mts --source <dir> [--branch gh-pages]
//        [--remote origin] [--message <commit message>]

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** What the top-level handler reads off whatever `main()` threw:
 * `execFileSync` failures carry git's `stderr`, plain Errors only `message`. */
interface ThrownFailure {
  stderr?: unknown;
  message?: unknown;
}

function flag(name: string): string | undefined;
function flag(name: string, fallback: string): string;
function flag(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);

  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return fallback;
}

function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();
}

function main(): void {
  const source = flag("source");
  const branch = flag("branch", "gh-pages");
  const remote = flag("remote", "origin");
  const message = flag("message", `publish to ${branch}`);

  if (!source) {
    console.error(
      "usage: publish-to-pages.mts --source <dir> [--branch gh-pages] [--remote origin] [--message <msg>]",
    );
    process.exit(2);
  }

  if (!existsSync(source) || !statSync(source).isDirectory()) {
    console.error(`publish-to-pages: --source is not a directory: ${source}`);
    process.exit(2);
  }

  const owned = readdirSync(source);

  if (owned.length === 0) {
    console.log("nothing to publish (empty source)");
    return;
  }

  const remoteRef = `refs/remotes/${remote}/${branch}`;
  const work = mkdtempSync(join(tmpdir(), "pages-"));

  /** The branch's current tip on the remote, or undefined if it does not exist yet. */
  function fetchTip(): string | undefined {
    try {
      git(["fetch", "--no-tags", remote, `+refs/heads/${branch}:${remoteRef}`]);

      return git(["rev-parse", "--verify", "--quiet", remoteRef]);
    } catch {
      return undefined;
    }
  }

  /** Rebuilds the worktree as `tip`'s tree with `from`'s entries swapped in, and stages it. */
  function stageOnto(tip: string | undefined, from: string): void {
    if (tip === undefined) {
      try {
        git(["rm", "-rf", "--quiet", "."], work);
      } catch {
        // Index already empty — nothing to clear.
      }
    } else {
      git(["checkout", "--detach", "--force", tip], work);
      git(["clean", "-fdxq"], work);
    }

    for (const entry of owned) {
      rmSync(join(work, entry), { recursive: true, force: true });
      cpSync(join(from, entry), join(work, entry), { recursive: true });
    }

    git(["add", "-A"], work);
  }

  let tip = fetchTip();

  try {
    git(["worktree", "add", "--detach", work, tip ?? "HEAD"]);
    git(
      ["config", "user.email", "github-actions[bot]@users.noreply.github.com"],
      work,
    );
    git(["config", "user.name", "github-actions[bot]"], work);

    let pushed = false;

    for (let attempt = 1; attempt <= 5 && !pushed; attempt++) {
      stageOnto(tip, source);

      if (
        tip !== undefined &&
        git(["diff", "--cached", "--name-only", tip], work) === ""
      ) {
        console.log("no changes to publish");
        return;
      }

      const tree = git(["write-tree"], work);
      const commit = git(["commit-tree", tree, "-m", message], work);

      try {
        // An empty lease value means "the branch must not exist yet".
        git(
          [
            "push",
            `--force-with-lease=refs/heads/${branch}:${tip ?? ""}`,
            remote,
            `${commit}:refs/heads/${branch}`,
          ],
          work,
        );
        pushed = true;
      } catch {
        console.log(
          `push rejected (attempt ${attempt}); rebuilding on the new ${branch} tip`,
        );
        tip = fetchTip();
      }
    }

    if (!pushed) {
      throw new Error(`failed to push ${branch} after retries`);
    }

    console.log(
      `published [${owned.join(", ")}] to ${branch} as a single commit`,
    );
  } finally {
    try {
      git(["worktree", "remove", "--force", work]);
    } catch {
      // best-effort cleanup
    }

    rmSync(work, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  // Surface git's own stderr (e.g. auth, dubious-ownership, rejected push)
  // as a clean message for CI triage, rather than a raw Node error dump.
  const failure = error as ThrownFailure | null | undefined;
  const stderr = failure?.stderr ? String(failure.stderr).trim() : "";

  if (stderr !== "") {
    console.error(stderr);
  }

  console.error(failure?.message ?? String(error));
  process.exit(1);
}
