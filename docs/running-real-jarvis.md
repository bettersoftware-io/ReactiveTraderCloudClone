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

Aggregate, window-based server-side metering (usage gating, scripted
fallback on exhaustion, footer/Admin surfacing, per-user model preference)
is a designed-but-not-built workstream — see the entry in
[STATUS.md](STATUS.md).
