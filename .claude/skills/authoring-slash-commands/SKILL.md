---
name: authoring-slash-commands
description: Use when creating or editing a project slash command under .claude/commands/ — its !`…` pre-execution blocks fail silently on shell control flow, and any .md file placed in that directory becomes a command.
---

# Authoring project slash commands

**Every `.md` file under `.claude/commands/` is registered as a command** — a `README.md` or `CLAUDE.md` dropped there for documentation becomes `/README` or `/CLAUDE`. Keep notes about the commands here, not beside them.

**Authoring trap — keep `` !`…` `` blocks free of shell control flow.** Those
pre-execution blocks are parsed and matched against the command's
`allowed-tools` *before* they run; a construct the parser won't analyse fails
closed (`Contains case_statement`) and the block yields an error instead of
data, while the command carries on as if nothing happened. Sequence with `;`,
filter with pipes, and branch on `$ARGUMENTS` when *rendering* rather than in
the shell. This broke `/rtc:status` entirely for 19 days.

Two things make it nastier than it sounds, both measured 2026-08-14: the
failure is invisible until someone **types** the command — a `Bash` tool call,
a Skill-tool invocation, and a user-scope (`~/.claude/commands/`) copy of the
identical block all run it happily — and it appears to be specific to
**project-scoped** commands like these, so a construct proven safe in your own
`~/.claude/commands/` is not proven safe here. Full evidence table in the
"Authoring these blocks" section of
[`.claude/commands/rtc/status.md`](../../commands/rtc/status.md).
