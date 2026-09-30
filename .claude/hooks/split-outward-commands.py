#!/usr/bin/env python3
"""PreToolUse(Bash) hook: refuse a command that CHAINS an outward-facing step
(git push, gh pr create/merge, gh workflow run, ...) with anything else.

Why: auto mode judges a chained command as a whole and shows the prompt from
its first word, so `git add && git commit && git push && gh pr create` reads
as "git add needs permission" and blocks the local steps along with the
outward one. Outward steps must run as their own Bash call, batched at the
start or end of a piece of work. Pipes into filters (`git push 2>&1 | tail`)
are allowed: that is still a single outward step.

Exit 2 + stderr = the call is refused and the message goes back to Claude.
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
GIT_OUTWARD = {"push"}
WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}


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
        rest = words[1:]
        # skip global options: git -C dir push, git -c k=v push
        while rest and rest[0].startswith("-"):
            rest = rest[2:] if rest[0] in {"-C", "-c"} else rest[1:]
        return bool(rest) and rest[0] in GIT_OUTWARD

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

    if len(parts) < 2:
        return

    outward = [" ".join(words_of(p)[:3]) for p in parts if is_outward(p)]

    if not outward:
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
