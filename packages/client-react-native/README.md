# @rtc/client-react-native

React Native (Expo Router) client for ReactiveTraderCloudClone. Consumes the
framework-neutral `@rtc/client-core` verbatim; only the leaf UI + platform
adapters are RN-specific. See `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md`.

Runs on **Expo SDK 57 / React Native 0.86** (see
`docs/superpowers/specs/2026-07-06-rn-expo-sdk57-upgrade-design.md`).

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

## Running the app

The app has no custom native code — every native module it uses ships inside
Expo Go and the Expo prebuild. Which runner you use depends on the platform.

### iOS — use the simulator (recommended)

> **Why not Expo Go on your iPhone?** App Store **Expo Go is frozen at SDK 54**
> (Apple's review backlog), but this app is on **SDK 57**. Expo Go only runs the
> single SDK baked into it, so it rejects this app on iOS as "incompatible."
> Until Apple ships a newer Expo Go, the free iOS path is the **simulator**
> (a dev build), not Expo Go.

From the repo root (with Xcode + an iOS simulator runtime installed):

```bash
pnpm build                                                # build the workspace libs (client-core → dist)
pnpm --filter @rtc/client-react-native exec expo run:ios  # builds a dev client, launches the simulator
```

- Use `pnpm … exec expo` (the workspace-local Expo CLI), **not** `npx expo` —
  on this repo's Node 26, `npx expo` crashes (a `stripTypeScriptTypes` bug in
  npx's isolated fetch).
- The **first** `run:ios` compiles the native project (prebuild → pod install →
  xcodebuild) and takes ~10–15 min; later runs are incremental and fast.
- Once it launches, flip the in-app **Simulator** switch for instant
  deterministic tiles — no server or token needed.

<details>
<summary>Force deterministic simulator data without tapping the toggle</summary>

`buildNativePorts` takes the in-process simulator branch whenever `serverUrl`
is empty. Since `EXPO_PUBLIC_*` vars are inlined at bundle time and `??` only
catches null/undefined, an empty string works:

```bash
EXPO_PUBLIC_SERVER_URL="" pnpm --filter @rtc/client-react-native exec expo start --clear
```

Then open the installed dev client at Metro:

```bash
xcrun simctl openurl booted "exp+rtc-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```
</details>

### Android — Expo Go or an APK

Android's Play Store Expo Go tracks the latest SDK, so the QR path generally
works there:

```bash
pnpm build
pnpm --filter @rtc/client-react-native start   # starts Metro, prints a QR code
```

Scan the QR from inside Expo Go (phone and Mac on the **same Wi-Fi**). If the
Expo Go build is mid-rollout, build a standalone **APK** instead (see
Distribution below) — it needs no Expo Go and no signing gatekeeper.

### Verify the bundle without any device

```bash
pnpm --filter @rtc/client-react-native export
```

Compiles the whole app through Metro (no phone/simulator needed) — a quick
check that everything still bundles. Note this is a *production* export; it does
**not** exercise the dev runtime. To prove the dev bundle boots, start Metro and
fetch `http://localhost:8081/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false`.

---

## Distribution options

This app is wired for **free-path distribution** — no paid Apple Developer
account. `eas.json` carries exactly two build profiles (`development` dev-client
and `preview` Android APK) and no EAS Update / OTA (`updates: { enabled: false }`
in `app.config.ts`; the `eas.projectId` is already set in `extra`). Run the EAS
CLI on demand with `pnpm dlx eas-cli` (no global install needed).

| Target | How | Cost |
|---|---|---|
| **iOS Simulator** (Mac) | `expo run:ios` (dev build) — see above | Free |
| **Android** device/emulator | Expo Go QR (`… start`), or a standalone APK: `eas build -p android --profile preview` → share the link | Free |
| **Your own iPhone** (physical) | `expo run:ios --device` — cabled, signed with a **free** Apple ID (Xcode Personal Team) | Free, but **7-day** expiry + must be cabled |
| **iPhone via EAS** (over-the-air link, no cable) | `eas device:create` then `eas build -p ios` | **Needs Apple Developer Program ($99/yr)** |
| **iOS Expo Go** (App Store) | ❌ Not possible — frozen at SDK 54, rejects this SDK-57 app | — |

### Why iOS-on-a-real-device costs money

iOS refuses to run any app on a physical device unless it's **code-signed with a
provisioning profile listing that device's UDID**. Registering device UDIDs and
minting those profiles is a **paid Apple Developer Program** capability, which
EAS drives on your behalf — so EAS device installs inherit Apple's paywall. A
**free** Apple ID only gets a "Personal Team," which can sign locally via Xcode
(cabled, 7-day) but has no cloud/EAS access. Android has no equivalent gate — the
APK sideloads freely, which is why it's the free way to share broadly.

### If you later want over-the-air updates (EAS Update)

Deliberately **out of scope** here (free-path policy). Adopting it means
installing `expo-updates`, replacing `updates: { enabled: false }` with
`updates: { url: "https://u.expo.dev/<projectId>" }` in `app.config.ts`, adding
`channel`s back to `eas.json`, and `eas update --channel <name>`. It still
requires a build that colleagues can install first (Expo Go or a dev/preview
build) — OTA only ships the JS bundle, not the native shell.

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
(defaults to `wss://rtc-clone-server.fly.dev`; set it to an empty string to
force the in-process simulator branch — see Running the app).

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

## Monorepo resolution (how the build finds the workspace libs)

Metro is configured for pnpm in `metro.config.js` (watchFolders → workspace
root, `nodeModulesPaths`, symlinks + package `exports`). Workspace packages are
consumed from their built `dist`, so run `pnpm build` after changing a lib. The
`#/` alias resolves via `babel-plugin-module-resolver` (`babel.config.js`).

The `@expo/metro-runtime` override (`pnpm-workspace.yaml`) is pinned to the
SDK-57 line, and `@xmldom/xmldom` to `^0.8.13` — both load-bearing for native
builds; the inline comments there explain why (do not bump xmldom to 0.9.x, it
breaks `expo prebuild`).
