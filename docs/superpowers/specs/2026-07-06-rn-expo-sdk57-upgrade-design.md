# RN Expo SDK 55 → 57 Upgrade + EAS Distribution Wiring — Design

**Date:** 2026-07-06
**Package:** `@rtc/client-react-native`
**Status:** design approved; ready for implementation plan.

## Goal

Upgrade `@rtc/client-react-native` from **Expo SDK 55 / React Native 0.83** to
**Expo SDK 57 / React Native 0.86**, and complete the EAS distribution wiring,
so the app can be installed on the user's phone and shared with colleagues
**without a paid Apple Developer account**.

The upgrade is the enabling change: App Store Expo Go only supports the *latest*
SDK. On SDK 55 the app is two versions behind the SDK 57 Expo Go build and is
rejected as incompatible. On SDK 57 it runs in Expo Go directly (and via
`eas go` during the brief SDK-57 Expo Go rollout gap) — the zero-cost path for
both the user's phone and colleague distribution.

## Why this is now viable (context)

Every native module the app uses is part of the standard Expo Go bundle —
`react-native-svg`, `react-native-screens`, `react-native-safe-area-context`,
`@react-native-async-storage/async-storage`, and all `expo-*` /
`@expo-google-fonts/*` packages. There is **no custom native code**. So Expo Go
is a genuine runtime for this app once the SDK version matches; nothing forces a
custom dev build.

## Scope (locked)

1. **Bump + EAS wiring** — the SDK upgrade *and* finishing the deferred EAS
   configuration, in one pass.
2. **Free distribution paths only** — no paid Apple Developer account. iOS
   distribution rides on Expo Go / `eas go`; colleague binary distribution is an
   Android APK via EAS. **No iOS TestFlight profile.**
3. **Verification includes a real iOS simulator render check** — not automated
   gates alone.

Out of scope: EAS Update (OTA JS pushes), iOS TestFlight / App Store submission,
any change to `@rtc/client-react` (web) or other packages beyond what the
monorepo build/lint gauntlet requires.

## Toolchain compliance (already satisfied)

| Requirement (SDK 57) | This environment | Status |
|---|---|---|
| Node ≥ 20.19.4 | Node 26 | ✓ |
| Xcode ≥ 26.4 (native iOS) | Xcode 26.6 installed | ✓ |
| React 19.2 | `react ^19` floor | ✓ (`^19` satisfies 19.2) |
| TypeScript 6.x | `typescript ^6` | ✓ |
| iOS device floor 16.4 | — | affects only the test device |

## Approach (chosen: A — `--fix`-driven, single worktree, one PR)

Let Expo's own tooling drive version resolution; hand-fix only the seams the
tooling cannot see. SDK 56→57 is the designated *non-breaking* RN 0.85→0.86
step, so the entire breaking surface is 55→56 and lands atomically — there is no
diagnostic value in splitting the jump across two PRs.

### 1. Version driver

Inside `packages/client-react-native`:

```bash
npx expo install expo@^57.0.0 --fix
npx expo-doctor
```

`--fix` repins every Expo-managed package to its SDK-57 `bundledNativeModules`
version: `expo`, `expo-constants`, `expo-font`, `expo-router`,
`expo-status-bar`, `react-native` (→ 0.86), `react-native-svg`,
`react-native-screens`, `react-native-safe-area-context`. **Take whatever
versions `--fix` writes** — they are compatible by definition. `expo-doctor`
surfaces any remaining config/version drift.

### 2. Manual seams (`--fix` does not touch these)

| Seam | Location | Action |
|---|---|---|
| `@expo/metro-runtime` **override** | `pnpm-workspace.yaml` `overrides:` | Repin `~55.0.11` → the SDK-57 pin (whatever `expo-router@57` requires + expo's `bundledNativeModules` say — verify, don't guess). Update the existing getDevServer comment: the explanation stays valid (RN 0.86 keeps the ESM `export default`, so a metro-runtime that still uses the old CJS `require(...)()` would crash identically); only the version numbers change. |
| `jest-expo` | `package.json` devDep | Bump `^55.0.19` → `~57.x`. Invisible to `--fix`; a stale jest-expo breaks the jest transform under RN 0.86. |
| `babel-preset-expo` | `package.json` devDep | Bump `~55.0.23` → `~57.x`. (Verify whether `--fix` catches it as an expo-managed package; if not, manual.) |
| `@testing-library/react-native` | `package.json` devDep | Verify React 19.2 / RN 0.86 compat; bump `^14.0.1` only if `expo-doctor` / jest flags it. |

### 3. Config migration

Driven by `expo-doctor` output:

- `app.config.ts` — the `newArchEnabled` comment stays valid (New Architecture
  is still the only architecture). Watch for any `expo-router@57` config-schema
  change surfaced by doctor.
- iOS deployment floor moves to 16.4; the SDK default handles it — no explicit
  config change unless doctor requires one.

### 4. Known frictions (pre-called)

- **pnpm peer re-resolution** — last session pnpm refused to move a satisfied
  peer without a nuclear clean reinstall
  (`rm -rf node_modules packages/*/node_modules tests/node_modules pnpm-lock.yaml && pnpm install`).
  A bump this large will likely force re-resolution on its own; if `pnpm why`
  shows a stale pin surviving, go nuclear and re-run.
- **24h supply-chain cooldown** (`minimumReleaseAge: 1440`) — SDK 57's newest
  patch may be < 24h old and get steered to an older-but-aged patch, or blocked.
  If a *required* version is too fresh, add a scoped `minimumReleaseAgeExclude`
  entry rather than lowering the global cooldown.

## EAS distribution wiring

### `app.config.ts`

Add `eas: { projectId: "ec0ee21b-52af-4375-bb5d-70c6c52b8c1a" }` **into the
existing `extra` object** (never a second `extra` key — that clobbers
`serverUrl` / `wsToken`). This projectId links `eas build` runs to the project.

**Deliberately NOT added:** `updates.url` + `expo-updates`. Those are for EAS
Update (OTA JS pushes) — YAGNI for the free-paths goal. The existing
`runtimeVersion: { policy: "appVersion" }` is harmless without them.
Correspondingly, **drop the stale `expo-updates` entry** from `knip.json`'s
`ignoreDependencies` for this package, since we are confirming it will not be
installed.

### `eas.json` (new)

```json
{
  "cli": { "appVersionSource": "local" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } }
  }
}
```

- **`preview`** → `eas build -p android --profile preview` produces the
  sideloadable **Android APK** for colleagues — no Apple, no signing gatekeeper.
- **`development`** → a dev client for iterating outside Expo Go / bridging the
  SDK-57 Expo Go rollout gap.

### `expo-dev-client` dependency

Add via `npx expo install expo-dev-client` (SDK-57-pinned) so the `development`
profile actually builds. It does **not** break the Expo Go path — Expo Go runs
from `expo start` regardless of this dependency. Add it to `knip.json`'s
`ignoreDependencies` for the package if knip cannot trace it (it is consumed by
the native dev-client build, not by app JS).

## Verification (definition of done)

### Gate 1 — full CI gauntlet (local, then real CI)

Not just typecheck + jest + biome (standing lesson: that trio green ≠ CI-clean).
The complete set, run in the worktree:

- `typecheck`
- RN `jest` **and** `vitest`
- `biome ci`
- **both** eslint configs: `lint:eslint` + `lint:eslint:types`
- `stylelint` (`lint:css`)
- `knip`
- `syncpack lint`
- monorepo `pnpm build`

The web Playwright e2e is left to CI (an RN-only bump does not touch
`client-react`; e2e is heavy locally and CI runs it regardless).

### Gate 2 — headless Metro dev-bundle boot proof

The check established last session (the one production `expo export` fooled us
on — export tree-shakes out dev-only modules like `getDevServer`, so it is NOT
proof the dev runtime boots):

```bash
npx expo start --port 8099   # background
# fetch the actual dev bundle:
curl 'http://localhost:8099/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false'
```

Assert: the bundle builds clean, `@expo/metro-runtime` resolved to 57.x, and
there is no broken `getDevServer`-style CJS consumer.

### Gate 3 — iOS simulator render check

One-time env setup on this Mac:

- Point at full Xcode: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
- Download the iOS runtime: `xcodebuild -downloadPlatform iOS` (multi-GB; **may
  require a sudo / license-accept step the user runs via `! …`**, since the
  agent cannot sudo).

Then:

- `pnpm build` the `@rtc/*` libs first (Metro resolves them to `dist/`).
- `expo run:ios` → launch on the simulator → screenshot → eyeball that the app
  still paints under RN 0.86 — ideally a screen or two across skin × mode, since
  cross-skin legibility is the memory's flagged regression class.

### Ship

Push branch → open PR → poll `gh run list --branch <b> --workflow CI --json
status,conclusion,headSha,databaseId` until the run whose `headSha == HEAD` is
`completed` / `success` (never `gh pr checks` — 403 with this repo's PAT) →
merge `--merge` **on the user's explicit authorization** (self-authored PR to
main) → confirm `git merge-base --is-ancestor $(git rev-parse HEAD) origin/main`
→ remove worktree + branch → sync the primary checkout (`pnpm install` +
`pnpm build`).

### Real-world close-out (user)

The user runs the app in Expo Go / `eas go` on their phone — the final
confirmation no simulator can substitute for.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| SDK-56 breaking change bites expo-router or fonts | `expo-doctor` surfaces it; fix in-worktree; Gate 3 render check is the net for silent paint breakage. |
| pnpm keeps a stale peer/override | `pnpm why` to confirm; nuclear clean reinstall. |
| Required SDK-57 version < 24h old (cooldown) | Scoped `minimumReleaseAgeExclude`, not a global cooldown drop. |
| iOS runtime download needs sudo | Ask the user to run the one command via the `! …` session prefix. |
| RN 0.86 render regression | Gate 3 simulator eyeball across skin × mode. |
