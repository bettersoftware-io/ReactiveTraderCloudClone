# @rtc/client-react-native

React Native (Expo Router) client for ReactiveTraderCloudClone. Consumes the
framework-neutral `@rtc/client-core` verbatim; only the leaf UI + platform
adapters are RN-specific. See `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md`.

## Run locally

    pnpm build                                   # build the workspace libs (client-core → dist)
    pnpm --filter @rtc/client-react-native start # Metro dev server; open in Expo Go

## What the app shows

The screen streams live FX spot tiles from the deployed Fly server by
default (`extra.serverUrl` in `app.config.ts`, no env needed) — real
`WsAdapter` transport, the same `@rtc/client-core` composition the web
client uses. A **Simulator** switch in the toolbar flips to the in-process
simulator ports (no network, deterministic ticks) without changing any
other wiring: same presenters, same UI, different ports.

## Verify the bundle (no device needed)

    pnpm --filter @rtc/client-react-native export

## Live-WS smoke

A manual (not CI) script that proves the real transport works end-to-end
against the deployed Fly server — opens a `WsAdapter` connection and
asserts a price tick arrives within 15s:

    pnpm build && pnpm --filter @rtc/client-react-native smoke:ws

It is intentionally excluded from `test`/CI: the Fly server scales to zero,
so a cold start (or a transient network blip) would flake a gate. Run it by
hand to confirm connectivity, e.g. before a demo.

Env vars (both optional — default to the deployed server, no token):

- `EXPO_PUBLIC_SERVER_URL` — WS endpoint, defaults to
  `wss://rtc-clone-server.fly.dev`.
- `EXPO_PUBLIC_WS_TOKEN` — shared access token, if the server requires one.

## Monorepo resolution

Metro is configured for pnpm in `metro.config.js` (watchFolders → workspace
root, `nodeModulesPaths`, symlinks + package `exports`). Workspace packages are
consumed from their built `dist`, so run `pnpm build` after changing a lib. The
`#/` alias resolves via `babel-plugin-module-resolver` (`babel.config.js`).

## EAS handoff (account-bound — run by a human)

`eas.json` (profiles + channels) is committed; the rest is a one-time,
account-bound sequence:

    pnpm dlx eas-cli login                     # interactive — your Expo account
    pnpm dlx eas-cli init                      # creates the project; writes projectId + updates.url

`eas init` prints a `projectId` and an `updates.url`. Uncomment the
`updates`/`extra.eas.projectId` fields in `app.config.ts` with those values,
then publish:

    pnpm dlx eas-cli update --channel preview  # bundles + publishes an OTA update

`eas update` prints a QR code and a link — open either in Expo Go on a
phone. That first `preview` publish is the first colleague-facing demo
(Phase 2).
