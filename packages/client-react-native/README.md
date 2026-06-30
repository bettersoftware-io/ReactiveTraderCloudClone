# @rtc/client-react-native

React Native (Expo Router) client for ReactiveTraderCloudClone. Consumes the
framework-neutral `@rtc/client-core` verbatim; only the leaf UI + platform
adapters are RN-specific. See `docs/superpowers/specs/2026-06-29-react-native-expo-client-design.md`.

## Run locally

    pnpm build                                   # build the workspace libs (client-core → dist)
    pnpm --filter @rtc/client-react-native start # Metro dev server; open in Expo Go

## Verify the bundle (no device needed)

    pnpm --filter @rtc/client-react-native export

## Monorepo resolution

Metro is configured for pnpm in `metro.config.js` (watchFolders → workspace
root, `nodeModulesPaths`, symlinks + package `exports`). Workspace packages are
consumed from their built `dist`, so run `pnpm build` after changing a lib. The
`#/` alias resolves via `babel-plugin-module-resolver` (`babel.config.js`).

## EAS (deferred — account-bound, run by a human at the start of Phase 2)

`eas.json` (profiles + channels) is committed. To activate EAS Update:

    pnpm dlx eas-cli login          # interactive — your Expo account
    pnpm dlx eas-cli init           # creates the project; writes projectId + updates.url

Then uncomment the `updates`/`extra.eas.projectId` fields in `app.config.ts`
with the values `eas init` prints. The first `eas update --channel preview`
publish is the first colleague-facing demo (Phase 2).
