#!/usr/bin/env python3
"""PreToolUse(Bash) hook with two jobs.

1. Refuse a command that CHAINS an outward-facing step (git push, gh pr
   create/merge, gh workflow run, ...) with anything else.
2. Ask a person before a `git push` that can LOSE something on the remote:
   a force, a delete, a mirror, a prune. Every other push is left to the
   permission rules, so no routine push gains a prompt.

Why: auto mode judges a chained command as a whole and shows the prompt from
its first word, so `git add && git commit && git push && gh pr create` reads
as "git add needs permission" and blocks the local steps along with the
outward one. Outward steps must run as their own Bash call, batched at the
start or end of a piece of work. Pipes into filters (`git push 2>&1 | tail`)
are allowed: that is still a single outward step.

Why the second job lives here and not in `permissions.ask`: a rule is a
glob over the command's text, and a glob cannot name a word. It missed a
shortened option (`--del`), a bundled one (`-uf`) and a quoted one
(`"--force"`), and `Bash(git push *:*)` could not be written at all: a rule
that ends in `:*` is read as the old prefix syntax. This hook reads the words
the shell would pass to git. It only ever ASKS, so the worst it can do is
nothing: the rules still decide what runs unasked.

What it cannot see is what the words do: a `remote.origin.push` setting, an
alias, or a tag that shares the branch's name can all turn a plain-looking
push into something else.

Exit 2 + stderr = the call is refused and the message goes back to Claude.
A JSON `permissionDecision: "ask"` on stdout = a person is prompted, and the
reason is shown in the prompt.
"""

import json
import re
import shlex
import sys

SEPARATORS = {"&&", "||", ";", "&", ";;"}

GH_OUTWARD = {
    "pr": {"create", "merge", "edit", "comment", "close", "reopen", "ready", "review"},
    "issue": {"create", "comment", "edit", "close", "reopen"},
    "workflow": {"run", "enable", "disable"},
    "run": {"rerun", "cancel", "delete"},
    "release": {"create", "delete", "edit", "upload"},
    "repo": {"create", "delete", "edit", "fork"},
}
WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

# What each option of `git push` can take away from the remote.
LOSSY_LONG = {
    "--force": "overwrites the remote branch",
    "--delete": "deletes a remote ref",
    "--mirror": "overwrites and deletes remote refs",
    "--prune": "deletes remote branches",
}
LOSSY_SHORT = {"f": LOSSY_LONG["--force"], "d": LOSSY_LONG["--delete"]}
# Short options that take a value, which is not an option itself: -o <string>.
VALUE_SHORT = {"o"}
# The shell rewrites a word holding one of these before git reads it.
SHELL_EXPANDED = set("$`{")


def strip_heredocs(command: str) -> str:
    """Drops heredoc bodies — a commit message may say anything."""
    lines = command.split("\n")
    out: list[str] = []
    terminator: str | None = None

    for line in lines:
        if terminator is not None:
            if line.strip() == terminator:
                terminator = None
            continue

        out.append(line)
        match = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", line)

        if match:
            terminator = match.group(1)

    return "\n".join(out)


def segments(command: str) -> list[list[str]]:
    text = strip_heredocs(command.replace("\\\n", " ")).replace("\n", " ; ")
    lexer = shlex.shlex(text, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    result: list[list[str]] = [[]]

    try:
        for token in lexer:
            if token in SEPARATORS:
                result.append([])
            elif "|" in token and set(token) <= {"|", "&"}:
                # a pipe keeps the same logical step
                result[-1].append(token)
            else:
                result[-1].append(token)
    except ValueError:
        return []  # unparseable: let the normal permission flow judge it

    return [seg for seg in result if seg]


def words_of(segment: list[str]) -> list[str]:
    """The segment's command words, before any pipe, minus env assignments."""
    words: list[str] = []

    for token in segment:
        if set(token) <= {"|", "&"}:
            break
        words.append(token)

    while words and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]):
        words.pop(0)

    return words


def is_outward(segment: list[str]) -> bool:
    words = words_of(segment)

    if len(words) < 2:
        return False

    if words[0] == "git":
        return git_subcommand(words)[:1] == ["push"]

    if words[0] == "gh":
        group, action = words[1], words[2] if len(words) > 2 else ""

        if group == "api":
            for i, word in enumerate(words):
                if word in {"-X", "--method"} and i + 1 < len(words):
                    return words[i + 1].upper() in WRITE_METHODS
                if word.startswith("--method=") or word.startswith("-X"):
                    return word.split("=", 1)[-1].lstrip("-X").upper() in WRITE_METHODS
            return any(w in {"-f", "-F", "--field", "--raw-field", "--input"} for w in words)

        return action in GH_OUTWARD.get(group, set())

    return False


def git_subcommand(words: list[str]) -> list[str]:
    """`git -C dir push -u origin x` -> ["push", "-u", "origin", "x"]."""
    if not words or words[0] != "git":
        return []

    rest = words[1:]
    # skip global options: git -C dir push, git -c k=v push
    while rest and rest[0].startswith("-"):
        rest = rest[2:] if rest[0] in {"-C", "-c"} else rest[1:]

    return rest


def push_losses(words: list[str]) -> list[str]:
    """Why this push can lose something on the remote; empty when it cannot,
    and when `words` is not a push at all."""
    subcommand = git_subcommand(words)

    if subcommand[:1] != ["push"]:
        return []

    losses: list[str] = []
    is_value = False

    for word in subcommand[1:]:
        if is_value:
            is_value = False
        elif SHELL_EXPANDED & set(word):
            losses.append(f"`{word}` is rewritten by the shell, so it cannot be read here")
        elif not word.startswith("-"):
            if word.startswith("+"):
                losses.append(f"`{word}` {LOSSY_LONG['--force']}")
            elif word.startswith(":"):
                losses.append(f"`{word}` {LOSSY_LONG['--delete']}")
        elif word == "--":
            pass  # the end of the options, not a shortened one
        elif word.startswith("--"):
            # git takes a long option shortened (--del), and
            # --force-with-lease=x is a force too
            for option, loss in LOSSY_LONG.items():
                if option.startswith(word) or word.startswith(option):
                    losses.append(f"`{word}` {loss}")
                    break
        else:
            # a bundle of short options: -uf is -u -f
            letters = word[1:]

            for index, letter in enumerate(letters):
                if letter in VALUE_SHORT:
                    is_value = index == len(letters) - 1
                    break
                if letter in LOSSY_SHORT:
                    losses.append(f"`{word}` {LOSSY_SHORT[letter]}")

    return losses


def ask(reason: str) -> None:
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "ask",
                "permissionDecisionReason": reason,
            }
        },
        sys.stdout,
    )


def shadowed_by_project_copy() -> bool:
    """True when this is the user-scope copy and the project ships its own
    (registered in the project's .claude/settings.json): let that one speak,
    so a refusal is not reported twice."""
    import os

    project = os.environ.get("CLAUDE_PROJECT_DIR", "")
    copy = os.path.join(project, ".claude", "hooks", "split-outward-commands.py")

    return (
        bool(project)
        and os.path.isfile(copy)
        and os.path.realpath(copy) != os.path.realpath(__file__)
    )


def main() -> None:
    if shadowed_by_project_copy():
        return

    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return

    if payload.get("tool_name") != "Bash":
        return

    command = (payload.get("tool_input") or {}).get("command") or ""
    parts = segments(command)

    if not parts and git_subcommand(command.split())[:1] == ["push"]:
        ask("This push has a quote that never closes, so it cannot be read here.")
        return

    outward = [" ".join(words_of(p)[:3]) for p in parts if is_outward(p)]

    if len(parts) < 2 or not outward:
        losses = [loss for p in parts for loss in push_losses(words_of(p))]

        if losses:
            ask(
                "This push can lose something on the remote: "
                + "; ".join(losses)
                + ". A person decides."
            )
        return

    sys.stderr.write(
        "Refused: this command chains an outward-facing step ("
        + ", ".join(outward)
        + ") with other commands. Run each outward step (git push, gh pr "
        "create/merge, gh workflow run, write gh api, ...) as its OWN Bash "
        "call, and batch those calls at the start or the end of the work — "
        "local steps (git add, git commit, tests) go in separate calls.\n"
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
