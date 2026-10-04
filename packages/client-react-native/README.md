# @rtc/client-react-native

React Native (Expo Router) client for ReactiveTraderCloudClone. Consumes the
framework-neutral `@rtc/client-core-rxjs` verbatim; only the leaf UI + platform
adapters are RN-specific. See `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md`.

Runs on **Expo SDK 57 / React Native 0.86** (see
`docs/superpowers/specs/2026-07-06-rn-expo-sdk57-upgrade-design.md`).

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers (`src/ui`) + ③ Interface Adapters (`src/app/adapters`) — per [§1.3.1](../../docs/architecture/01-overview.md#131-clean-architecture-concretely----which-package-is-which-ring) |
| **Runtime deps** | `@rtc/client-core`, `@rtc/client-core-rxjs`, `@rtc/core-api`, `@rtc/core-logic`, `@rtc/devtools-core`, `@rtc/domain`, `@rtc/motion-core`, `@rtc/react-bindings`, `expo`, `expo-router`, `expo-constants`, `expo-dev-client`, `expo-font`, `expo-linking`, `expo-status-bar`, `@expo-google-fonts/*`, `@react-native-async-storage/async-storage`, `react`, `react-dom`, `react-native`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-reanimated`, `react-native-worklets`, `@shopify/react-native-skia`, `rxjs`, and more (`package.json` `dependencies`; `@rtc/devtools-relay` is a devDependency). Unlike the web clients, it always runs the default RxJS core -- there is no load-time core selection on native |
| **Consumed by** | Nothing in-workspace — it is a leaf app; unlike `client-react` it is *not* a `tests` workspace dependency (`tests/package.json` lists `@rtc/client-react` but not this package) |
| **Must never import** | Gates 30–33 in [§12 Architectural Gates](../../docs/architecture/12-architectural-gates.md) mechanically enforce this in `client-react-native/src/ui` — the RN counterpart of gates 26–29 on `client-react/src/ui`: no `rxjs`/`@react-rxjs`/`@rx-state` (30), no `localStorage`/`AsyncStorage` (31), no `fetch`/`expo-constants`/env reads (32), no `setTimeout`/`setInterval` (33). `rxjs` is a real dependency, but it appears only in `src/app/adapters` — e.g. `AppearanceColorSchemeAdapter.prefersDark$()` returns an `Observable<boolean>`. |

## Folder map

| Path | What lives here |
|---|---|
| `app/` | Expo Router file-based routes (`_layout.tsx`, the `(app)/` group with `index.tsx`, `blotter.tsx`, `analytics.tsx`, `credit.tsx`, `equities.tsx`, and the `__visual/[...id].tsx` visual-harness route) — the real entry point Metro bundles from (`package.json` `"main": "expo-router/entry"`) |
| `src/app/` | The composition root (`AppRoot.tsx`, `buildNativePorts.ts`) plus its native platform adapters (`adapters/`) — the RN analogue of `client-react/src/app` |
| `src/app/adapters/` | `AsyncStoragePreferencesAdapter`, `AsyncStorageSessionStore`, `AppearanceColorSchemeAdapter` — the native-specific gateways this app supplies |
| `src/app/devtools/` | The RTC DevTools wiring (`nativeDevtoolsHub`, presenter manifest, relay URL), applied under `__DEV__` only |
| `src/ui/` | Dumb RN screens and components, grouped by trading domain (`rates/`, `blotter/`, `credit/`, `equities/`, `analytics/`) plus shared chrome (`shell/`, `theme/`, `ambient/`) |
| `tests/visual/` | The RN visual tier: simctl/Maestro drivers and committed RN goldens (see its [README](tests/visual/README.md)) |

Note the two `app` directories are not the same thing: package-root `app/` is
Expo Router's route tree, while `src/app/` is the composition root and
platform adapters — mirroring `client-react`'s `src/app`, just one path
segment shorter here because Expo Router reserves the bare `app/` name.

## Where to start reading

1. `app/_layout.tsx` — the real mount point: wires the sim/live toggle, wraps
   the tab navigator in one `AppRoot` and one `ThemeProvider`.
2. `src/app/AppRoot.tsx` — the composition root as a component; calls
   `createApp`/`createViewModel` exactly once per real mount (StrictMode-safe
   via a lazy ref + deferred dispose).
3. `src/app/buildNativePorts.ts` — assembles the `AppPorts`: real-`WsAdapter`
   branch vs. in-process simulator branch, the RN analogue of client-react's
   `buildBrowserPorts`.
4. `src/ui/theme/tokens.ts` — RN theme tokens delivered via React context
   (not CSS custom properties, since RN has no stylesheet cascade).

## What the app shows

The screen streams live FX spot tiles from the deployed Fly server by
default (`extra.serverUrl` in `app.config.ts`, no env needed) — real
`WsAdapter` transport, the same `@rtc/client-core-rxjs` composition the web
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

> **On a real iPhone, use Expo Go** — see the next section. The simulator is
> for development: it runs the app's own dev build, which the visual goldens
> and the dev tooling depend on.

From the repo root (with Xcode + an iOS simulator runtime installed):

```bash
pnpm build          # build the workspace libs (client-core → dist)
pnpm dev:ios        # simulator mode — builds a dev client, launches the simulator, starts Metro
```

`dev:ios` selects a **data-source mode** the same way the web clients do (bare = simulator):

```bash
pnpm dev:ios            # a) simulator — in-process fake data, no server (alias of dev:ios:sim)
pnpm dev:ios:ws:local   # b) connect to a local server — needs `pnpm dev:ws` in another terminal
pnpm dev:ios:ws:remote  # c) connect to the deployed server (wss://rtc-clone-server.fly.dev)
pnpm dev:ios:fs         #    full stack — starts the local WS server + the app together
```

The mode is carried by `EXPO_PUBLIC_SERVER_URL`, which Metro **bakes into the
bundle** — so switching modes needs a Metro restart (each script starts its
own). All run `expo run:ios` under the hood.

- Use `pnpm … exec expo` (the workspace-local Expo CLI), **not** `npx expo` —
  on this repo's Node 26, `npx expo` crashes (a `stripTypeScriptTypes` bug in
  npx's isolated fetch).
- The **first** `run:ios` compiles the native project (prebuild → pod install →
  xcodebuild) and takes ~10–15 min; later runs are incremental and fast.
- Once it launches, flip the in-app **Simulator** switch for instant
  deterministic tiles — no server or token needed.

<details>
<summary>Force deterministic simulator data without tapping the toggle</summary>

`pnpm dev:ios:sim` already does this — it sets `EXPO_PUBLIC_SERVER_URL=` (empty),
and `buildNativePorts` takes the in-process simulator branch whenever `serverUrl`
is empty. To force it from a raw Metro start instead (empty string survives
because `EXPO_PUBLIC_*` is inlined at bundle time and `??` only catches
null/undefined):

```bash
EXPO_PUBLIC_SERVER_URL="" pnpm --filter @rtc/client-react-native exec expo start --clear
```

Then open the installed dev client at Metro:

```bash
xcrun simctl openurl booted "exp+rtc-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```
</details>

### A real iPhone — Expo Go

Expo Go from the App Store runs this app as of SDK 57 (Expo Go 57.x, checked
2026-10-04). It needs no developer mode on the phone and no Apple account, so
it is the only free way onto a physical iPhone — and the only place the
haptics can be felt, since the simulator has no haptic engine.

```bash
pnpm build
EXPO_PUBLIC_SERVER_URL= pnpm --filter @rtc/client-react-native exec expo start --go
```

Scan the QR code with the iPhone camera (phone and Mac on the **same Wi-Fi**;
add `--tunnel` if the network blocks it) and sign in with `demo` / `mcdc2026`.
The empty `EXPO_PUBLIC_SERVER_URL` selects the built-in simulator data.

- **"Sign in to Expo Go as …"** — the project carries an EAS project id, so
  Expo Go must be signed in to the same Expo account as the CLI (its profile
  tab), or start with `--offline`.
- **Black screen and `undefined is not a function` for every route** — a
  native library's JS is ahead of the version Expo Go bundles. Eight
  libraries are pinned to Expo's versions for this reason
  (`tests/versions/expoGoVersions.test.ts`; Renovate leaves them alone). They move only with
  an SDK upgrade, via `expo install --fix`.

The app only runs while the Mac is serving it, and it is a development
bundle: fine for a look and a feel, not for performance numbers.

### Demo away from the Mac — a published build in Expo Go

The Expo Go path above only works while the Mac is serving the app. To show
it anywhere, publish the app's JavaScript to Expo's servers (EAS Update);
Expo Go then opens it from there.

```bash
pnpm demo:publish:ios      # from the repo root; builds, then publishes to branch "demo"
```

On the phone: open Expo Go and tap **rtc-mobile** under Projects. It opens the
newest published build directly — there is no branch or update to pick (seen on
Expo Go 57, 2026-10-04). Close the app fully first if it is already open, or it
keeps running the build it has. Sign in with `demo` / `mcdc2026`.

- The published build talks to the deployed server (`wss://rtc-clone-server.fly.dev`,
  the default when `EXPO_PUBLIC_SERVER_URL` is unset), so it does not depend
  on the Mac at all. The login screen's Simulator mode switch still works
  offline.
- It is a production bundle running inside Expo Go's shell. Only someone
  signed in to the owning Expo account sees the project, so this is for
  showing the app on your own phone, not for handing it out.
- **Which build is on the phone?** The script stamps the bundle with the
  commit and the publish time (UTC). The status strip's build cell prints the
  commit on every screen, and the sign-in screen prints
  `BUILD <commit> · <time>`. A development run has no stamp: the strip shows
  `V2.0-RN` and the sign-in screen shows no build line.
- The script passes `--environment preview`: EAS requires an environment in
  non-interactive mode, and `preview` matches the `preview` build profile in
  `eas.json`. No variables are defined for it on EAS, so the app's own
  defaults apply.
- `eas-cli` must be signed in (`pnpm dlx eas-cli@24.10.0 login`). Publishing is free
  on Expo's free plan.
- The runtime version follows the SDK (`runtimeVersion.policy: "sdkVersion"`),
  so a published build keeps opening until Expo Go moves to the next SDK;
  after an SDK upgrade, publish again.

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

### Inspecting a running app

For live debugging (console, network, component tree, the WS wire), see
[docs/react-native-inspectors.md](../../docs/react-native-inspectors.md) — a field
guide to React Native DevTools (built in), Reactotron, Radon IDE, and the repo's
own RTC devtools relay. Or watch the server side instead: `@rtc/server` logs every
WS connect / disconnect / rejected upgrade (server README →
[Connection observability](../server/README.md#connection-observability)).

---

## Native motion/render stack

The client uses `react-native-reanimated`, `@shopify/react-native-skia`,
`react-native-gesture-handler`, `expo-blur`, `expo-haptics`, and `expo-sensors`.
Because these are native modules, adding or upgrading them requires rebuilding
the dev client (`pnpm dev:ios`) — a JS reload is not enough.

**Diagnostic:** launch with `EXPO_PUBLIC_MOTION_PROBE=1 pnpm dev:ios` to render a
flag-gated probe (`src/ui/_probe/MotionProbe.tsx`) — a pulsing Skia circle that
confirms the Reanimated worklet runtime and the Skia canvas both render on
device. It never appears in a normal run.

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
| **iOS Expo Go** (App Store) | `expo start --go`, scan the QR — see "A real iPhone" above. No developer mode, no Apple account; runs only while the Mac serves it | Free |

### Running an EAS cloud build

```bash
cd packages/client-react-native
pnpm dlx eas-cli@24.10.0 build -p android --profile preview
```

Run it in your own terminal: the first build asks whether to generate an
Android signing key. Two things in the repo exist only for this:

- **`.easignore`** (repo root). EAS archives the whole repository, does not
  read `.git/info/exclude`, and has a 2.0 GB limit. Without the file the
  archive was 3.3 GB (other checkouts under `.claude/worktrees`, docs,
  goldens); with it, 377 MB. It replaces `.gitignore` for the upload, so its
  first block mirrors that file and must be kept in step with it.
- **`eas-build-post-install`** (this package's scripts). The app resolves
  `@rtc/*` to each library's built `dist/`, which is never uploaded, so the
  hook builds the libraries the app depends on after `pnpm install`.

An Android `preview` build completed on Expo's servers on 2026-10-04 (archive
344 MB), which confirms the `node: 26.10.0` pin in `eas.json` and the hook
there. To run the result in an emulator: create a virtual device once in
Android Studio's Device Manager (an arm64 system image on Apple silicon), start
it, then `pnpm dlx eas-cli@24.10.0 build:run -p android --latest`. The app has
not been checked on Android beyond the build succeeding.

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

## Live data & signing in

The app shows a login screen on every launch (`AuthGate` + `LoginScreen`, no
auto-login) and gates the rest of the UI behind it. What counts as a valid
credential depends on which branch `buildNativePorts` selects:

- **Live mode** (`extra.serverUrl` set — the default, deployed Fly server
  `rtc-clone-server`): the WebSocket is gated by genuine session auth, not a
  shared static token. The server validates credentials against its
  `AUTH_USERS` secret (`packages/server/src/auth/AuthService.ts`) and issues a
  signed session token from `POST /login`; the WS upgrade then requires that
  token. Sign in with **any** username/password pair that exists in the
  deployed server's `AUTH_USERS` secret — ask the team for real deployed
  credentials, it is not a value you invent independently. `buildNativePorts`
  feeds the resulting session token to `WsAdapter` (read fresh on every
  reconnect from an `InMemorySessionStore` — synchronous, not
  AsyncStorage-backed, since the login screen on every launch makes persisting
  a session across restarts pointless today; a future follow-up).
- **Simulator mode** (the `Sim` toggle): there is no real server, so
  credentials are validated in-process by `AuthSimulator` against a
  `DEV_CREDENTIALS` map (`nativeAuthConfig.ts`), read from `app.config.ts` →
  `extra.devAuth` (`EXPO_PUBLIC_DEV_AUTH`, a JSON `username -> password`
  object — the RN analogue of the web client's `VITE_DEV_AUTH`). Unset or
  malformed falls back to all four roster usernames at the shared committed
  demo password (`mcdc2026`), so simulator mode always has a working login with no env
  set at all: `astark`, `nromanoff`, `tchalla`, `demo`. **Simulator-only —
  never a deployed secret; live mode never baked-in credentials.**

If the live tiles show "Disconnected" while the Simulator works, a credential
mismatch against the deployed server (or the pair not existing in its
`AUTH_USERS` secret) is the most likely cause.

> For the full picture of every `.env` file in the repo (this one, the web
> client's, and the Vercel CLI artifacts), see
> [`docs/env-files.md`](../../docs/env-files.md).

### Set the simulator dev credentials on the client

`EXPO_PUBLIC_*` variables are read by Expo and **inlined into the app
bundle**. The easiest way is a `.env` file in this package. Copy the
template and fill it in:

```bash
cp packages/client-react-native/.env.example packages/client-react-native/.env
# then edit packages/client-react-native/.env:
#   EXPO_PUBLIC_DEV_AUTH={"astark":"mcdc2026","demo":"mcdc2026"}
```

Then run as usual (`pnpm --filter @rtc/client-react-native start`). Or set it
just for one run, without a file:

```bash
EXPO_PUBLIC_DEV_AUTH='{"astark":"mcdc2026","demo":"mcdc2026"}' pnpm --filter @rtc/client-react-native start
```

Optional companion var: `EXPO_PUBLIC_SERVER_URL` selects the WS endpoint
(defaults to `wss://rtc-clone-server.fly.dev`; empty string → the in-process
simulator branch). You normally don't set it by hand — the `pnpm dev:ios:*`
scripts do (see [Running the app](#running-the-app)).

> ⚠️ **Two caveats.**
> 1. `.env` is git-ignored on purpose — **never commit a real credential**.
>    Keep secrets out of the repo; share them out-of-band.
> 2. Because `EXPO_PUBLIC_*` is baked into the JS bundle, this value is
>    visible to anyone who has the bundle. It is a *soft* gate for a demo, not
>    a real secret, and it only ever unlocks the offline simulator — the web
>    client's equivalent is behind its own hosting password wall, and live
>    mode always requires the real server's `AUTH_USERS` secret regardless.

### Live-WS smoke (optional connectivity check, no phone)

A manual (not CI) script that logs in against the deployed server, then opens
a real `WsAdapter` connection and asserts a price tick arrives within 15s. It
reads `EXPO_PUBLIC_DEMO_USER`/`EXPO_PUBLIC_DEMO_PASS` directly (not
`nativeAuthConfig.ts`/`DEV_CREDENTIALS` — those are simulator-only) as a real
credential pair against the live server's `AUTH_USERS` secret, so they're not
in `.env.example`; set them ad hoc for this one script:

```bash
pnpm build
EXPO_PUBLIC_DEMO_USER=demo EXPO_PUBLIC_DEMO_PASS=some-demo-secret pnpm --filter @rtc/client-react-native smoke:ws
```

Prints e.g. `live tick: EURUSD 1.xxxxx 1.xxxxx` on success. It is excluded
from `test`/CI on purpose: the server scales to zero, so a cold start or a
network blip would flake a gate. Run it by hand to confirm connectivity
before a demo. A login failure or a `close`/timeout here means the credential
was rejected — verify it against the Fly server's `AUTH_USERS` secret.

---

## Monorepo resolution (how the build finds the workspace libs)

Metro is configured for pnpm in `metro.config.mts` (watchFolders → workspace
root, `nodeModulesPaths`, symlinks + package `exports`). Workspace packages are
consumed from their built `dist`, so run `pnpm build` after changing a lib. The
`#/` alias resolves via `babel-plugin-module-resolver` (`babel.config.mts`).

The `@expo/metro-runtime` override (`pnpm-workspace.yaml`) is pinned to the
SDK-57 line, and `@xmldom/xmldom` to `^0.8.13` — both load-bearing for native
builds; the inline comments there explain why (do not bump xmldom to 0.9.x, it
breaks `expo prebuild`).

---

## How it's used

This package is a leaf app — nothing else in the workspace imports it — so
"how it's used" means how *it* consumes `@rtc/client-core-rxjs`, `@rtc/client-core` and
`@rtc/react-bindings`. `app/_layout.tsx` mounts the composition root exactly
once around the tab navigator:

```tsx
<AppRoot key={simulator ? "sim" : "live"} simulator={simulator}>
  <ThemeProvider>
    <Chrome simulator={simulator} onToggle={setSimulator} />
```

`AppRoot` (`src/app/AppRoot.tsx`) then does the actual composition-root work,
verbatim against the same `@rtc/client-core-rxjs` / `@rtc/react-bindings` APIs the
web client uses:

```tsx
  if (ref.current === null) {
    const { ports, dispose } = buildNativePorts({ simulator, ... });
    const { presenters, commands } = createApp(ports);
    const devtools = createNativeDevtools();     // __DEV__ only
    const inputs = buildViewModelInputs(presenters, devtools);
    const viewModel = createViewModel(
      inputs.presenters,
      inputs.factories,
      commands,
    );
    ref.current = { viewModel, dispose };
  }
```

Only `ports` differs from `client-react` (native adapters via
`buildNativePorts` instead of browser ones) — `createApp`, `createViewModel`,
and everything downstream is the same code running on a different platform.

## Testing

Two runners, split by extension — the mode is in the filename:

| glob | runner | environment |
|---|---|---|
| `**/*.test.ts` | vitest (`pnpm --filter @rtc/client-react-native test:unit:coverage`) | node — pure logic, no RN imports |
| `**/*.test.tsx` | jest-expo (`… test:native:coverage`) | RN runtime + RNTL |

`pnpm test` runs both. Why jest exists here at all: vitest cannot parse
react-native's Flow source (`import typeof`) — see
[docs/architecture/09-test-strategy.md](../../docs/architecture/09-test-strategy.md)
§9.9 for the full rationale and revisit conditions.

Two traps:

1. **A `.test.ts` file under jest reports "No tests found" and exits 0** — a
   vacuous pass. If your test renders RN it must be `.test.tsx`; if it is
   pure logic it must not import react-native.
2. **Neither half's coverage number is "the package's coverage"** — different
   providers, each denominator is the whole package while each runner sees
   half the tests. `pnpm test:coverage` prints the merged line figure, which
   is the one to quote and the one CI gates at ≥95%. See
   [README-COVERAGE.md](README-COVERAGE.md).

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§14.2 Adapter Tables Per App — Mobile](../../docs/architecture/14-composition-and-wiring.md#142-adapter-tables-per-app) — the native adapter table and the sim/live toggle mechanics
- [§14.3 Boot Sequences](../../docs/architecture/14-composition-and-wiring.md#143-boot-sequences) — the Expo Router mount sequence, starting from `app/_layout.tsx`
- [§16 recipe 4 (Add a UI panel), the RN step](../../docs/architecture/16-trailheads.md#16-trailheads) — adding a new RN screen
