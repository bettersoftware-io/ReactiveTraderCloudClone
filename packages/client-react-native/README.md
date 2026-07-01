# @rtc/client-react-native

React Native (Expo Router) client for ReactiveTraderCloudClone. Consumes the
framework-neutral `@rtc/client-core` verbatim; only the leaf UI + platform
adapters are RN-specific. See `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md`.

## What the app shows

The screen streams live FX spot tiles from the deployed Fly server by
default (`extra.serverUrl` in `app.config.ts`, no env needed) — real
`WsAdapter` transport, the same `@rtc/client-core` composition the web
client uses. A **Simulator** switch in the toolbar flips to the in-process
simulator ports (no network, deterministic ticks) without changing any
other wiring: same presenters, same UI, different ports.

> **You do NOT need live data, a token, or an Expo account to try it.** Flip
> the **Simulator** switch and the app streams deterministic ticks with zero
> setup. Everything below is only needed for *live* data or *remote* sharing.

---

## Quick start — see it on your phone in ~2 minutes (no account, no EAS)

This runs the app straight from your Mac to your phone over Wi-Fi via the
**Expo Go** app. Best for your own phone or a colleague sitting next to you.

1. Install **Expo Go** on your phone (App Store / Play Store).
2. Make sure the phone and the Mac are on the **same Wi-Fi network**.
3. From the repo root:

   ```bash
   pnpm build                                    # build the workspace libs (client-core → dist)
   pnpm --filter @rtc/client-react-native start  # starts Metro, prints a QR code
   ```

4. Scan the QR code with the phone (iOS: Camera app → open in Expo Go;
   Android: scan from inside Expo Go).

The app opens. **Flip the Simulator switch** to see streaming tiles
immediately. To see *live* data instead, set up the WS token below first.

### Verify the bundle without a device

```bash
pnpm --filter @rtc/client-react-native export
```

Compiles the whole app through Metro (no phone needed) — a quick check that
everything still bundles.

---

## Live data & the WebSocket access token (`EXPO_PUBLIC_WS_TOKEN`)

The live tiles come from the deployed Fly server `rtc-clone-server` over a
WebSocket. That server can be **gated by a shared access token**:

- The server reads a secret env var `WS_ACCESS_TOKEN`
  (`packages/server/src/auth.ts`).
  - **If it is unset → the gate is OFF**: anyone can connect, no token needed.
  - **If it is set → every client must send a matching `?access=<token>`** or
    the connection is refused (WebSocket close code `1006`).
- The client appends that query param automatically (`buildWsUrl`), reading
  the token from `app.config.ts` → `extra.wsToken: process.env.EXPO_PUBLIC_WS_TOKEN`.

**So `EXPO_PUBLIC_WS_TOKEN` (this app) must equal `WS_ACCESS_TOKEN` (the Fly
server).** It is a shared password, not a value you invent independently — it
only works if it matches the server. If the live tiles show "Disconnected"
while the Simulator works, a token mismatch (or a missing token against a
gated server) is the most likely cause.

### Step 1 — decide the server side (you own the Fly app)

```bash
fly secrets list -a rtc-clone-server      # shows whether WS_ACCESS_TOKEN exists (value is masked)
```

Then pick one:

| Situation | Do this |
|---|---|
| You know the token value | Use it on the client (Step 2). |
| Token is set but you don't know the value | Reset it: `fly secrets set WS_ACCESS_TOKEN=some-demo-secret -a rtc-clone-server`, then use `some-demo-secret` on the client. |
| You just want the demo to work | Disable the gate: `fly secrets unset WS_ACCESS_TOKEN -a rtc-clone-server` → then **no client token is needed at all**. |

(`fly secrets set/unset` triggers a redeploy; give it a few seconds. The
server also scales to zero when idle, so the very first connection after a
while cold-starts — allow ~10s.)

### Step 2 — set the token on the client

`EXPO_PUBLIC_*` variables are read by Expo and **inlined into the app
bundle**. The easiest way is a `.env` file in this package. Copy the
template and fill it in:

```bash
cp packages/client-react-native/.env.example packages/client-react-native/.env
# then edit packages/client-react-native/.env:
#   EXPO_PUBLIC_WS_TOKEN=some-demo-secret
```

Then run as usual (`pnpm --filter @rtc/client-react-native start`). Or set it
just for one run, without a file:

```bash
EXPO_PUBLIC_WS_TOKEN=some-demo-secret pnpm --filter @rtc/client-react-native start
```

Optional companion var: `EXPO_PUBLIC_SERVER_URL` overrides the WS endpoint
(defaults to `wss://rtc-clone-server.fly.dev`).

> ⚠️ **Two caveats.**
> 1. `.env` is git-ignored on purpose — **never commit a real token**. Keep
>    secrets out of the repo; share them out-of-band.
> 2. Because `EXPO_PUBLIC_*` is baked into the JS bundle, this token is
>    visible to anyone who has the bundle. It is a *soft* gate for a demo,
>    not a real secret (the web client uses the same design, behind its
>    hosting password wall). Don't reuse a sensitive value here.

### Live-WS smoke (optional connectivity check, no phone)

A manual (not CI) script that opens a real `WsAdapter` connection to the Fly
server and asserts a price tick arrives within 15s:

```bash
pnpm build
EXPO_PUBLIC_WS_TOKEN=some-demo-secret pnpm --filter @rtc/client-react-native smoke:ws
```

Prints e.g. `live tick: EURUSD 1.xxxxx 1.xxxxx` on success. It is excluded
from `test`/CI on purpose: the server scales to zero, so a cold start or a
network blip would flake a gate. Run it by hand to confirm connectivity
before a demo. A `close 1006` / timeout here means the token gate rejected
the connection (see Step 1).

---

## Sharing over-the-air with EAS Update (for *remote* colleagues)

**Only needed if you want to send the app to someone who is NOT on your
Wi-Fi.** For anyone next to you, the Quick start above is enough. EAS Update
publishes the JS bundle to Expo's servers so anyone with **Expo Go** + the
link can load it from anywhere.

You don't have to install anything globally — run the CLI on demand with
`pnpm dlx eas-cli` (or `npm install -g eas-cli` if you'd rather have a
permanent `eas` command). `eas.json` (build profiles + `development` /
`preview` / `production` channels) is already committed.

One-time, account-bound sequence:

1. Create a free Expo account at <https://expo.dev>.
2. Log in:

   ```bash
   pnpm dlx eas-cli login
   ```

3. Initialise the EAS project (from the package dir):

   ```bash
   cd packages/client-react-native
   pnpm dlx eas-cli init          # creates the project; prints a projectId
   ```

4. In `app.config.ts`, uncomment and fill the two fields `eas init` gave you
   — the top-level `updates.url` and `eas.projectId`. **Add `eas.projectId`
   into the EXISTING `extra` object** (the inline comments there guide you) —
   do NOT add a second `extra` key, it would clobber `serverUrl`/`wsToken`:

   ```ts
   updates: { url: "https://u.expo.dev/<projectId>" },
   extra: {
     router: { root: "./app" },
     serverUrl: process.env.EXPO_PUBLIC_SERVER_URL ?? "wss://rtc-clone-server.fly.dev",
     wsToken: process.env.EXPO_PUBLIC_WS_TOKEN,
     eas: { projectId: "<uuid from eas init>" },
   },
   ```

5. Publish an over-the-air update to the `preview` channel:

   ```bash
   pnpm dlx eas-cli update --channel preview
   ```

6. `eas update` prints a **QR code and a link** — open either in Expo Go on a
   phone. That first `preview` publish is the first colleague-facing demo
   (Phase 2).

> For EAS builds/updates the WS token should come from **EAS environment
> variables** (an `env` block in `eas.json`, or the EAS dashboard), not your
> local `.env` — the local file isn't uploaded to the EAS build.

---

## Monorepo resolution (how the build finds the workspace libs)

Metro is configured for pnpm in `metro.config.js` (watchFolders → workspace
root, `nodeModulesPaths`, symlinks + package `exports`). Workspace packages are
consumed from their built `dist`, so run `pnpm build` after changing a lib. The
`#/` alias resolves via `babel-plugin-module-resolver` (`babel.config.js`).
