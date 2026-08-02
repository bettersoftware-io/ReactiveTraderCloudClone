# Running Real-AI Jarvis (local + deployed)

The practical runbook for putting a real `ANTHROPIC_API_KEY` behind Jarvis —
locally and on the deployed Fly server — without leaking the key, and with the
bill-safety knobs that exist today. The architecture behind all of this is
[§18.13](architecture/18-jarvis-ai-agent-surface.md#1813-phase-3-shipped--the-real-loop)
(the real loop) and
[§18.14](architecture/18-jarvis-ai-agent-surface.md#1814-p4--the-mcp-endpoint-second-transport)
(the MCP endpoint).

## The two switches

| Env | Effect |
|---|---|
| `ANTHROPIC_API_KEY` set | `AnthropicAgentLoop` — the real `claude-opus-5` tool-runner loop |
| `RTC_JARVIS_FAKE=1` | `ScriptedAgentLoop` — **wins over the key** (deliberate rehearsal override) |
| neither | Jarvis unavailable: server answers `available:false`, the orb hides |

So "real AI" = key present **and** fake flag absent, in the server's
environment. The key rides through turbo's `globalPassThroughEnv` — no config
edits needed anywhere.

## Handling the key without leaking it

Never type `export ANTHROPIC_API_KEY=sk-...` at a prompt — it lands verbatim
in shell history and stays exported to every child of that shell. The
recommended pattern is a **secret-store-backed per-invocation wrapper**: keep
the key in the OS keychain and inject it into the environment of only the one
command that needs it. macOS example (put the function in a shell rc shared
by your shells):

```sh
# One-time (prompts silently; nothing echoed, nothing in history):
security add-generic-password -s anthropic-api-key -a "$USER" -w

with-anthropic-key() {
  local key
  key=$(security find-generic-password -s anthropic-api-key -w 2>/dev/null)
  if [ -z "$key" ]; then
    echo "with-anthropic-key: no 'anthropic-api-key' item in Keychain." >&2
    return 1
  fi
  ANTHROPIC_API_KEY="$key" "$@"
}
```

The interactive shell itself never has the variable set; history only ever
contains the wrapper's name. (Linux equivalent: `secret-tool lookup` /
`pass show` in place of `security find-generic-password`.)

## Locally

1. **Smoke first (recommended):** `with-anthropic-key pnpm jarvis:smoke:live`
   — the only sanctioned real-key surface. Boots the real server, logs in,
   drives availability → a quote turn → a declined-trade confirmation turn →
   a fresh-socket history replay, and prints per-turn time-to-first-event.
   ~4 metered turns. It refuses to run keyless rather than silently passing.
2. **Full stack:** `with-anthropic-key pnpm dev:react:fs` (or run
   `with-anthropic-key pnpm dev:ws` alone and pair it with
   `pnpm dev:react:ws:local`). Sign in with the demo roster; the orb renders
   because availability comes back `true`; ⌘/Ctrl+J opens the panel.

Simulator mode (`pnpm dev`) never touches the real loop — its Jarvis is the
in-browser scripted brain regardless of any key. Use a `:fs` / `:ws:local`
mode.

## Deployed (Fly + Vercel)

1. **Set the secret without putting the value on a command line.** Either
   read it silently first — history then records the literal `$VAR` text,
   not the value:

   ```sh
   read -s ANTHROPIC_API_KEY
   fly secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" -a rtc-clone-server
   unset ANTHROPIC_API_KEY
   ```

   or import via stdin (no argv exposure at all):

   ```sh
   security find-generic-password -s anthropic-api-key -w | \
     sed 's/^/ANTHROPIC_API_KEY=/' | fly secrets import -a rtc-clone-server
   ```

   If `RTC_JARVIS_FAKE` was ever set there, remove it — it wins over the key:
   `fly secrets unset RTC_JARVIS_FAKE -a rtc-clone-server`.
2. **Deploy code, not just secrets.** `fly secrets set` restarts machines but
   they keep their old *image* — the server needs a `deploy.yml` dispatch to
   actually run P3+ code, **and the Vercel client must be redeployed too**
   (P3's required `turnId` means a P2-era client cannot talk Jarvis to a
   P3+ server). Both are dispatch-only workflows; neither happens by itself.
3. **Verify:** log into the deployed client — the orb appearing at all is the
   availability handshake succeeding end-to-end.

## Bill safety — what exists today

- **Anthropic Console (no code, do this first):** put the key in its own
  Workspace and set a **monthly spend limit** on that workspace
  (Console → Settings → Workspaces → Limits). This is the real backstop —
  when the cap is hit the API refuses, Jarvis's availability degrades
  exactly as designed, and the orb hides. Usage graphs live in the same
  console for monitoring.
- **In-repo caps (per session, already shipped):** 4,096 max tokens/turn,
  40 turns/session, `medium` effort, 8 runner iterations/turn, history
  trimmed at 30 messages. These bound any single socket, not the aggregate.
- **The public-roster caveat:** the demo roster is committed to a public
  repo. A real key on the public server is spendable by anyone who logs in
  (bounded per session by the caps above, unbounded across sessions except
  by the workspace limit). To make key spend private, set Fly's
  `AUTH_USERS`/`AUTH_SECRET` secrets to credentials only you know — they are
  independent of the committed roster; the public demo login stops working,
  which is the trade.

**Per-user model preference and usage surfacing shipped 2026-08-02** — see
[architecture §18.15](architecture/18-jarvis-ai-agent-surface.md#1815-the-brain-picker--usage-display-round--the-receipt).
Every signed-in user now picks their own brain (including Scripted) in
Preferences, and both the footer chip and an Admin-tab card show which brain
is live and what it has cost. That gives every user a **manual** run-dry
escape hatch already: flipping to Scripted in Preferences is a client-side
preference write, live on the next message, no server restart and no env
change — a different mechanism from `RTC_JARVIS_FAKE` above, which is a
server-wide rehearsal override, not a per-user choice. What is still missing
is *automatic* aggregate gating: nothing yet swaps a depleted connection to
Scripted on its own, so running dry still surfaces as failed turns (the
sanitized error copy) until the user flips the preference themselves or the
key is topped up. That auto-gating (item (2) of the workstream) is a
designed-but-not-built follow-on — see the entry in [STATUS.md](STATUS.md).

## Rate limits, and how Jarvis behaves when any limit trips

Beyond spend, the Console has genuinely fine-grained rate machinery
(Settings → Limits): org-level requests/min + input-tokens/min +
output-tokens/min **per model class** (token-bucket enforced, generous even
on the Start tier), plus **custom per-workspace rate AND spend limits** an
admin can set lower than the org's. Two operational notes:

- **Limits cannot be set on the default workspace** — another reason the
  Jarvis key must be scoped to its own workspace.
- **A deliberately low workspace ITPM/OTPM doubles as an abuse throttle**
  while the deployed login is the public demo roster: a credential-borrowing
  token-burner hits 429s instead of draining the prepaid balance quickly.

What the shipped code does when a limit trips (all P3 review-hardened —
nothing crashes, leaks, or retry-storms):

| Trip | Behavior |
|---|---|
| **429 rate-limited** | The SDK auto-retries a bounded number of times honoring `retry-after`; if exhausted, `AnthropicAgentSession` sanitizes the error (name/status only — never the raw message) and the turn fails with the in-character copy ("The desk link faltered, sir…"). The session survives; the next turn works once the bucket refills. A `retry-after` past the client's 30s first-event deadline makes the client show offline copy and fire its turn-correlated cancel — harmless (429'd requests aren't billed; the stale-cancel gate can't kill a later turn). |
| **Spend cap hit / credits depleted** | Non-retryable billing error → the same sanitized per-turn failure. Known rough edge: the orb stays visible and the footer chip keeps naming the depleted brain (availability tests "loop configured", not "key can bill"), so users see polite failures, not an automatic fallback — flipping to Scripted in Preferences (see above) is the manual workaround today; the graceful *automatic* scripted-fallback on exhaustion is the still-pending governance item (2). |
| **529 overloaded** | Bounded SDK retries, then the same sanitized error path. |

Every API response carries `anthropic-ratelimit-*` headers (limit, remaining,
reset, per requests/input/output — reflecting whichever limit is currently
most restrictive, workspace or org). `UsageMeter` (below) does not read
these yet — it accumulates from the SDK's per-message `usage` alone — so
they remain a free, unused input for a future metering refinement.

## Model cost note (assessed 2026-08-02, superseded 2026-08-02)

**Update: this note's own conclusion shipped the same day it was written.**
`JARVIS_MODEL_ID` — the old pinned-`claude-opus-5` constant this note was
originally written against — is deleted. Model choice is now per-turn and
per-user: every signed-in user picks their brain (Scripted, Haiku 4.5,
Sonnet 5, or Opus 5) in Preferences, with **`claude-haiku-4-5` ($1/$5 per
Mtok) as the new server-side default** for anyone who never opens
Preferences (including pre-round clients). The `RTC_JARVIS_MODEL`
env-selectable interim step this note originally proposed — a stepping stone
toward a picker — was never built; the picker superseded it directly. Full
receipt: [architecture
§18.15](architecture/18-jarvis-ai-agent-surface.md#1815-the-brain-picker--usage-display-round--the-receipt).

The reasoning that motivated the flip is unchanged and still worth keeping:
Jarvis's workload — seven flat-schema snapshot tools, trigger-clause
descriptions, 2–4 sentence replies — is the easy end of tool use, and Haiku
4.5 (~5× cheaper both sides than Opus, faster TTFE) is sufficient for it;
per-turn cost is dominated by the persona+tools prefix and history re-sent
as input, so the 5× saving applies almost directly. Sonnet 5 ($3/$15) sits
as the offered middle option. One caveat the picker surfaces that this note
didn't originally anticipate: Haiku 4.5's minimum cacheable prefix is 4,096
tokens (vs. 512 on Sonnet/Opus), comfortably above today's ~1.3k-token
persona+tools prefix — so `cacheReadTokens: 0` on every Haiku turn, visible
in the Admin usage card, is expected, not a broken cache (§18.15 has the
full explanation).
