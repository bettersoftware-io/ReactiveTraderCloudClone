# Application-core hot swap (web clients) — design

**Date:** 2026-10-05 · **Status:** design agreed in conversation, awaiting review of this document
**Closes:** ADR-006 Follow-up 7 ("Hot swap without a page reload").
**Builds on:** [the load-time switch](2026-09-27-runtime-core-switch-design.md) (ADR-006 Decision 6).

## Intent

**What the user asked for.** Switch the running web client from one
application core to another **without a page reload**, as a showcase of the
architecture's resilience: the world the app talks to keeps running, and only
the core is replaced.

**Decided with the user (2026-10-05):**

- **The ports survive the swap.** The same port objects serve the old core
  and the new one. Simulator trades and price paths survive, and in live mode
  the WebSocket never drops.
- **A branded "swapping core" overlay covers the remount, and Preferences is
  open again on the new core when it lifts**, so the user can flip again and
  watch.

**Success looks like:** signed in to the deployed app, with a trade in the
blotter, the user picks "Effect" in Preferences → "Application core". An
overlay names the swap for about half a second. When it lifts the page is on
the Effect core (`<html data-core-impl="effect">`), still signed in, with the
same trade in the blotter and prices ticking, and Preferences is open showing
"Effect". The page never navigated. A later plain reload boots Effect.

**Out of scope:**

- React Native (stays RxJS-only).
- **Carrying a core's own memory across.** Whatever lives only inside a core
  resets, exactly as on a reload: the Jarvis transcript and an in-flight
  Jarvis turn, order-ticket and RFQ drafts, and any filter or selection that
  is not persisted. A snapshot-and-seed handoff between cores is not designed.
- **Swapping under a mounted UI.** Every mounted `useMachine` holds a machine
  made by the old core's factories, so the UI tree is unmounted and mounted
  again. Keeping it mounted would mean re-pointing every live binding.
- A confirmation prompt before swapping with work in flight (a reload has
  none today).

## Measured before designing

Two throwaway probes, run 2026-10-05 on `e62f62e21`, neither committed:

| Probe | What it did | Result, all 9 ordered core pairs |
|---|---|---|
| Simulator ports (vitest, `client-react`) | `buildBrowserPorts()` once; compose core A, sign in, execute a trade, `dispose()`; compose core B over the same ports | B is authenticated with no login, connected, has 9 pairs and live prices, and its blotter holds A's trade |
| Live ports (node, real `@rtc/server`) | One `WsAdapter` + `createWsRealPorts`; same sequence | Same, and exactly **one** WebSocket opened per pair |

Why it works: no state that matters lives in a core. The session is in the
session store, trades are in the simulator or on the server, layout and
preferences are in storage. `WsAdapter.connect()` returns early on an open
socket, and its connection events come from a `ReplaySubject(1)`, so a core
that joins late hears the current state. `ConnectionEventsSimulator` emits
`gatewayConnected` per subscription.

**What breaks today** (each is a design item below):

1. **`AppRoot` builds the ports and drops `dispose`.** `const { presenters,
   commands } = core.createApp(buildBrowserPorts())` — the ports' lifetime is
   the UI root's, and nothing can end a composition.
2. **The devtools hub keeps the old core's streams.** `registerStream` starts
   with `if (this.streams.has(streamId)) { return; }`, so a second
   composition's streams are silently ignored, and the first composition's
   presenter-level machines are never reported disposed.
3. **The boot splash would replay.** Every composition builds
   `new BootGatePresenter(ports.bootSplash?.shouldPlay() ?? true)`.
4. **A pending layout write is dropped by `dispose()`** in the RxJS core: the
   writer is a `debounceTime` whose subscription `held.unsubscribe()` ends.
   The other two cores are unverified.
5. **Machine disposal is deferred.** `useMachine` disposes in a
   `queueMicrotask` after unmount, so `app.dispose()` must not run in the
   same turn as the unmount.

Checked and clean: no UI, bindings, layout or adapter module holds mutable
module-level state beyond one id counter (`WsJarvisAdapter`), and theme and
power-saver state live on `<html>` attributes that no unmount removes.

## Design

### 1. The core host (`src/app/coreHost.ts`, each web client)

A framework-free object that owns what outlives a core: the ports, the
running composition, and the swap sequence. Twin files in `client-react` and
`client-solid`, like `coreSelection.ts` and `bootApp.ts` today.

- **Ports are built once per page**, by the host, with `buildBrowserPorts()`.
  `AppRoot` no longer calls it.
- **A composition** is what the host hands the UI: the instrumented
  presenters, the instrumented machine factories and the commands of one
  `core.createApp(ports)`. Composing and instrumenting move out of `AppRoot`
  into the host. `AppRoot` only builds the ViewModel from a composition.
- **`swapTo(impl)`** runs these steps in order:
  1. Ignore the call when `impl` is the running core or a swap is under way.
  2. **Cover**: the overlay enters (§4). The old composition keeps running
     and the UI stays mounted beneath it.
  3. **Load** the new core's chunk (`loadCore`).
  4. **Unmount** the UI tree, then wait one macrotask so every deferred
     machine disposal has run.
  5. **`await old.dispose()`**. A rejection is logged as a `[core]` warning
     and the swap continues: the old tree is already gone.
  6. **`devtoolsHub.endComposition()`** (§3).
  7. **Compose** the new core over the same ports and mount the UI on it.
  8. Publish: `<html data-core-impl>`, the console line
     `[core] swapped <from> to <to>`, the saved choice (`saveCoreChoice`),
     and the URL with `?core=` removed through `history.replaceState`.
  9. **Lift** the overlay; Preferences opens on the new tree (§5).
- **The splash plays at most once per page.** The host wraps the
  `bootSplash` port so `shouldPlay()` answers the environment's decision for
  the first composition and `false` for every later one. The account menu's
  "Reboot HUD" row is an intent on the presenter and is unaffected.

**Failure handling.** Nothing here falls back silently.

| What fails | What the user gets |
|---|---|
| The chunk load (step 3) | Nothing changes. The page stays on the old core, nothing is saved, the overlay lifts, and the Preferences row, still mounted beneath it, shows the reason (§2). |
| `createApp` of the new core (step 7) | The host composes the **previous** core again over the same ports, mounts it, and reports the reason the same way. The saved choice is unchanged. |
| The previous core also fails to compose | The existing boot-error screen (`renderBootError`). |
| Saving the choice (step 8) | The swap stands. A `[core]` warning says the choice will not survive a reload. |

### 2. `CoreSelection` and the Preferences row

`CoreSelection` (`@rtc/core-api`) keeps `current`, `options` and
`select(impl)`, and gains one member:

```ts
/** Why the last `select` left the page on `current`, or null. A stream
 * because the host reports it while the same tree is still mounted. */
readonly failure$: StateStream<string | null>;
```

- `select` now calls the host's `swapTo`. It no longer saves and navigates;
  the save-and-reload path in `createCoreSelection` is removed. The
  boot-error screen keeps its own reload (`defaultCoreResetHref`).
- Each composition gets a fresh `CoreSelection` whose `current` is the core
  it runs on.
- The row shows `failure$` as an inline error under the control and clears
  it on the next `select`. Re-selecting the current core stays a no-op.
- The row's description changes from "saves and reloads" wording to say the
  core is swapped in place.

### 3. Devtools hub: one composition at a time

`DevtoolsHub` gains `endComposition()`:

- unsubscribes and forgets every registered stream, so the next
  `registerStream` with the same id takes the new core's source;
- reports every machine that is still live as disposed;
- when an inspector is attached, sends a fresh `welcome` + `snapshot` once
  the next composition has registered. `InspectorStore.applySnapshot`
  already clears and replaces both maps, so **the protocol and its version
  do not change**.

The wire tap (`instrumentWsAdapter`) belongs to the ports and is untouched.
The React Native client never calls `endComposition`.

### 4. The overlay (`ui/shell/core/CoreSwapOverlay`, each web client)

- Rendered by the host's framework shell as a **sibling of `AppRoot`**,
  outside the `ViewModelProvider`. It takes plain props (`from`, `to`,
  `phase`) and reads no ViewModel, because none exists mid-swap. Theme
  tokens and the power-saver level reach it through the `<html>` attributes.
- Content, in the HUD's existing type and tokens: a label "CORE SWAP", the
  two core names (`RXJS ▸ EFFECT`), and one status line that follows the
  phase ("loading", "handing over", "online"). `role="status"`, with a full
  sentence for assistive technology.
- An opaque full-viewport scrim, so the remount is never visible. It blocks
  pointer input while shown.
- **Motion follows `docs/performance.md`:** only `opacity` is animated, no
  `filter` or `backdrop-filter`, no `var()` inside an animated transform.
  Enter 160 ms, a minimum hold of 500 ms measured from "covered", exit
  200 ms. Under power-saver freeze or `prefers-reduced-motion` the fades are
  jump cuts and the hold stays. Under `navigator.webdriver` all three
  durations are zero. The durations are injected into the host, so tests
  never wait on real time.

### 5. Preferences reopens once

The composition that follows a swap carries a one-shot "reopen Preferences"
signal through `ViewModelShell`. `HeaderChrome` opens the modal when it takes
the signal. It is consumed exactly once: a later sign-out and sign-in within
the same composition does not reopen the modal, and React StrictMode's
double invocation does not consume it twice. A resumed session is
authenticated synchronously at composition (the `transportGate` contract
suite), so the overlay never lifts onto a login screen.

### 6. What the cores owe a swap

Two additions to `@rtc/core-contract`, run against all three cores:

- **`recomposition` suite** (cross-member, beside `portDiscipline`):
  compose, sign in, drive the ports, `dispose()`, compose again over the
  **same** scripted ports. The second composition is authenticated without a
  login, its construction-time port subscription counts equal a first
  composition's, port values reach its presenters, and after its own
  `dispose()` no port stream stays subscribed.
- **`dispose` suite, one new case:** a workspace-layout change still inside
  the persistence debounce is written before `dispose()` resolves.

Any core that fails either is fixed in the same PR.

## Testing

- **Contract:** the two additions in §6, each with a mutant.
- **Host unit tests** (each client, fake timers): the step order, the
  ignored re-entrant `swapTo`, each row of the failure table, the
  once-per-page splash, `replaceState`, and the saved choice.
- **Cross-core witness** (each client, since only the web clients depend on
  all three cores): the simulator probe promoted to a test over real
  `buildBrowserPorts()`, for the six ordered pairs of distinct cores.
- **Leak witness:** five round trips through the host leave the ports'
  subscriber counts at the single-composition baseline.
- **Hub:** `endComposition` unit tests, including an attached inspector
  receiving the new snapshot with no stale live machine.
- **UI contract** (`@rtc/ui-contract`, both clients): the Preferences row's
  failure line and in-place wording; the overlay's phases; the one-shot
  reopen.
- **Visual:** one overlay scenario in its held state, generated for the
  matrix's skins.
- **Live smoke** (`tests/fullstack/node-smoke.ts`, already in the CI e2e
  jobs): the live probe promoted — one `WsAdapter`, swap across cores, the
  trade is visible, one socket opened.
- **Browser e2e** (the existing core-switch journey, both clients, all three
  core legs): sign in, trade, mark `window`, pick another core → the
  attribute flips, the mark survives, no login screen, Preferences is open
  on the new core, the trade is in the blotter, a tile still ticks; pick the
  third core; reload → the last choice boots. The journey's
  "save + navigate" assertions are rewritten.
- `pnpm check:core-bundle` must stay green unchanged: the host is in the
  eager set and reaches a core only through `loadCore`'s `import()`.

## Delivery

| PR | Content |
|---|---|
| 1 | This spec and the implementation plan |
| 2 | `recomposition` suite, the `dispose` flush case, and core fixes |
| 3 | `DevtoolsHub.endComposition` |
| 4 | The host, `AppRoot` on a composition, `select` → `swapTo`, the reopen signal, the row's failure line, host tests, cross-core and leak witnesses, live smoke, browser e2e, docs |
| 5 | The overlay in both clients, its contract spec, the visual scenario and goldens |

PR 4 ships a working hot swap with a plain remount. PR 5 covers it.

## Review focus

Conditions no single unit test owns, most likely first:

1. **A swap while the socket is reconnecting.** The new core must show the
   true connection state, not a stale "connected".
2. **A swap with a Dockview panel floated or popped out.** The remount
   should restore what a reload restores, and leave no orphan window.
3. **A swap seconds after a layout drag.** The dragged layout is what the
   new core restores (§6's flush case).
4. **A swap with an inspector attached.** No stale stream, no duplicate
   machine, and the old core is not kept alive by the hub.
5. **Selecting twice quickly, or selecting while offline.** One swap, or a
   clean failure line, never a blank page.

## Docs to update

- ADR-006: a new **Decision 7** (hot swap in place; ports outlive a core),
  Follow-up 7 struck.
- `docs/architecture/22-pluggable-application-core.md`: a seventh guarantee
  ("a core can be composed over ports another composition used"), and the
  matching promise in §23.
- `docs/architecture/20-devtools.md`: `endComposition`.
- `CLAUDE.md`: the status paragraph and the application-core rule.
- `docs/STATUS.md`: the follow-up entry removed when PR 5 merges.

## Recorded, not planned

- **One shared home for the web clients' boot code.** `coreSelection.ts`,
  `bootApp.ts` and now `coreHost.ts` are twin files kept identical by hand.
- **A swap event in the inspector's timeline.**
- **Core-memory handoff** (see Out of scope).
