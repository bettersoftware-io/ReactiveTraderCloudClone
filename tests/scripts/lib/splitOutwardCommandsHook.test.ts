import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("a push that can lose something on the remote asks", () => {
  it.each(createLossyPushes())("%s", (command, named) => {
    const verdict = judge(command);

    expect(verdict.decision).toBe("ask");
    expect(verdict.reason).toContain(named);
  });
});

describe("a push that loses nothing is left to the permission rules", () => {
  it.each(createHarmlessPushes())("%s", (command) => {
    expect(judge(command)).toEqual({ decision: "silent", reason: "" });
  });
});

describe("a push the hook cannot read asks", () => {
  it.each([
    ["git push origin $BRANCH", "$BRANCH"],
    ["git push origin `cat branch.txt`", "`cat"],
    ["git push origin {--force,worktree-a}", "{--force,worktree-a}"],
  ])("%s", (command, word) => {
    expect(judge(command).reason).toContain(
      `\`${word}\` is rewritten by the shell`,
    );
  });

  it.each([
    "git push origin 'worktree-a",
    "cat <<EOF\ngit push origin worktree-a --force",
    'timeout 5 "git" push --force \'worktree-a',
    // the shell removes the quotes: pu"sh" is push
    "echo a#b; git pu\"sh\" origin :old # don't",
  ])("%s", (command) => {
    const verdict = judge(command);

    expect(verdict.decision).toBe("ask");
    expect(verdict.reason).toContain("a quote or a heredoc never closes");
  });
});

describe("a push that two readings of the comments disagree about asks", () => {
  it("asks when a # inside a word and a quote inside a comment hide the same push", () => {
    const verdict = judge(
      "# it's time\ngit push origin worktree-a#x --forc # isn't it",
    );

    expect(verdict.decision).toBe("ask");
    expect(verdict.reason).toContain("the two disagree about the push");
  });

  it("asks about a harmless push too when its comment glues a # to a word: the price", () => {
    expect(judge("git push origin worktree-a # see PR#12").reason).toContain(
      "the two disagree about the push",
    );
  });
});

describe("the prompt prints a word of the command safely", () => {
  it("replaces a character that is not plain printable text", () => {
    expect(judge("git push origin '+a\tb'").reason).toContain(
      "`+a?b` overwrites",
    );
  });

  it("cuts a long word short", () => {
    const reason = judge(`git push origin +${"a".repeat(60)}`).reason;

    expect(reason).toContain(`\`+${"a".repeat(39)}\` overwrites`);
  });
});

describe("a chained outward step is still refused, lossy or not", () => {
  it.each([
    "git commit -m x && git push origin worktree-a",
    "git commit -m x && git push --force origin worktree-a",
    "git add -A && timeout 60 git push origin worktree-a",
    // a comment ends at its own line's end, so the next line is a second step
    "git push origin worktree-a # don't\ngit push origin worktree-b --forc",
    "# note\ngit add -A && git push origin worktree-a",
    // a here-string has no body, so the next line is a second step
    "git status <<<EOF\ngit push origin worktree-a --del main",
  ])("%s", (command) => {
    expect(judge(command).decision).toBe("refused");
  });
});

describe("a command that is not a push is never asked about", () => {
  it.each([
    "git commit -m 'never push --force'",
    "git branch -d worktree-a",
    "git fetch --prune origin",
    "git stash push -u",
    "git commit -m 'never closes",
    "git commit -m 'fix PR#12, the push hook'",
    "git commit -m 'fix the push hook' # see PR#12",
    "rm -f notes.txt",
  ])("%s", (command) => {
    expect(judge(command).decision).toBe("silent");
  });
});

describe("the hook loads on the Python that macOS ships", () => {
  it("defers its annotations, which Python 3.9 cannot evaluate", () => {
    expect(readFileSync(HOOK, "utf8")).toContain(
      "\nfrom __future__ import annotations\n",
    );
  });
});

const HOOK = resolve(
  import.meta.dirname,
  "../../../.claude/hooks/split-outward-commands.py",
);

interface Verdict {
  readonly decision: "ask" | "refused" | "silent";
  readonly reason: string;
}

/** Runs the hook the way Claude Code does: the tool call as JSON on stdin. */
function judge(command: string): Verdict {
  const result = spawnSync("python3", [HOOK], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: "" },
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
  });

  if (result.status === 2) {
    return { decision: "refused", reason: result.stderr };
  }

  expect(result.status).toBe(0);

  if (result.stdout === "") {
    return { decision: "silent", reason: "" };
  }

  const output = JSON.parse(result.stdout).hookSpecificOutput;

  expect(output.hookEventName).toBe("PreToolUse");

  return {
    decision: output.permissionDecision,
    reason: output.permissionDecisionReason,
  };
}

/** Each command with the word the prompt must name as the reason. */
function createLossyPushes(): readonly (readonly [string, string])[] {
  return [
    ["git push --force origin worktree-a", "`--force` overwrites"],
    ["git push origin worktree-a --force", "`--force` overwrites"],
    ["git push --force-with-lease origin worktree-a", "`--force-with-lease`"],
    ["git push --force-with-lease=worktree-a origin worktree-a", "overwrites"],
    ["git push --forc origin worktree-a", "`--forc` overwrites"],
    ["git push -f origin worktree-a", "`-f` overwrites"],
    ["git push -uf origin worktree-a", "`-uf` overwrites"],
    ["git push -ofast --force origin worktree-a", "`--force` overwrites"],
    ['git push origin "--force" worktree-a', "`--force` overwrites"],
    ["git push origin +worktree-a", "`+worktree-a` overwrites"],
    ["git push origin +worktree-a:main", "`+worktree-a:main` overwrites"],
    ["git push origin -- +worktree-a", "`+worktree-a` overwrites"],
    ["git push origin --delete worktree-a", "`--delete` deletes"],
    ["git push origin worktree-a --del main", "`--del` deletes"],
    ["git push -d origin worktree-a", "`-d` deletes"],
    ["git push origin :worktree-a", "`:worktree-a` deletes"],
    ["git push --mirror origin", "`--mirror` overwrites and deletes"],
    ["git push --prune origin", "`--prune` deletes remote branches"],
    ["git -C ../other push --force origin worktree-a", "`--force` overwrites"],
    ["GIT_TRACE=1 git push -f origin worktree-a", "`-f` overwrites"],
    ["git push -f origin worktree-a 2>&1 | tail -5", "`-f` overwrites"],
    ["timeout 60 git push origin worktree-a --del main", "`--del` deletes"],
    ["command git push -f origin worktree-a", "`-f` overwrites"],
    ["env GIT_TRACE=1 git push -f origin worktree-a", "`-f` overwrites"],
    ["/usr/bin/git push -f origin worktree-a", "`-f` overwrites"],
    ["(git push origin worktree-a --del main)", "`--del` deletes"],
    ["2>&1 git push origin worktree-a --del main", "`--del` deletes"],
    ["echo y | git push origin worktree-a --del main", "`--del` deletes"],
    ["git push origin worktree-a#x --force", "`--force` overwrites"],
    ["git push -f origin worktree-a # then tidy up", "`-f` overwrites"],
    ["git push -f origin worktree-a # don't forget", "`-f` overwrites"],
    ["# it's time\ngit push origin :old # isn't it", "`:old` deletes"],
    ["# it's PR#1\ngit push origin :old # isn't it", "`:old` deletes"],
  ];
}

function createHarmlessPushes(): readonly string[] {
  return [
    "git push origin worktree-a",
    "git push -u origin worktree-a",
    "git push origin worktree-a 2>&1 | tail -5",
    "git push origin worktree-a 2>&1 | grep -v -f patterns.txt",
    "git push origin worktree-a:main",
    "git push origin worktree-a main",
    "git push origin HEAD:refs/heads/worktree-a",
    "git push origin -- worktree-a",
    "git push --dry-run origin worktree-a",
    "git push --follow-tags origin worktree-a",
    "git push --no-verify origin worktree-a",
    "git push -o ci.skip origin worktree-a",
    "git push -o +draft origin worktree-a",
    "git push -ofast origin worktree-a",
    "git push",
    "timeout 60 git push origin worktree-a",
    "# push the branch\ngit push origin worktree-a",
    "git push origin worktree-a # then open the pull request",
    "git push origin worktree-a # don't forget",
  ];
}
