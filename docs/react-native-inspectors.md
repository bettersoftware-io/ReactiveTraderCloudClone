# React Native inspectors — options for `@rtc/client-react-native`

A field guide to the debugging/inspection tools available for the RN client, as
of 2026 — what each shows, what it costs, and when to reach for it. There is no
tool adopted as a hard dependency yet (see the [STATUS.md](STATUS.md) follow-up);
this doc is the decision input for that.

> **An inspector is a _manual_ aid, not a safety net.** None of these would have
> _automatically_ caught a regression like the dropped `serverUrl` wiring (which
> silently put the app in simulator mode) — that is what an automated test does
> (`app.config.test.ts`). What an inspector gives you is a human noticing during
> dev: a network view showing **zero** WebSocket traffic is the tell. Pick a tool
> for day-to-day visibility, and rely on tests to prevent silent regressions.

## The short recommendation

- **Default, use it today:** **React Native DevTools** — built in, zero install.
- **If you want a standing network/state monitor:** add **Reactotron**.
- **If you live in VS Code / Cursor and want one integrated pane:** **Radon IDE**
  (licensed).
- **For _this app's_ WebSocket wire + presenter/machine state specifically:** the
  repo's own **RTC devtools relay** already beats every off-the-shelf option.

## The options

### 1. React Native DevTools (built-in) — start here

The official successor to Flipper, shipped inside React Native (Hermes + the
Chrome DevTools frontend over CDP). **Flipper is deprecated — do not use it.**

- **Install:** none. Press `j` in the Metro terminal, or open the in-app dev
  menu → "Open DevTools". Works out of the box on this app (Expo SDK 57 /
  RN 0.86, Hermes).
- **Shows:** Console (including the app's `[WsAdapter] Connected` /
  `Disconnected, reconnecting` lines — a direct read on connection behaviour),
  a full breakpoint debugger, the React component tree, memory/perf.
- **Weak spot:** raw WebSocket-frame inspection is limited; the Network panel is
  strongest for `fetch`/XHR.
- **Best for:** everyday debugging and a quick "is the app talking to anything?"
  check without adding a dependency.

### 2. Reactotron — the dedicated network/state monitor

A standalone desktop app (Infinite Red) plus a small dev dependency. Still
actively maintained and the best _free_ tool in 2026 for **watching traffic and
state over time**.

- **Install:** `reactotron-react-native` as a **devDependency**, a
  `ReactotronConfig.ts` imported only under `__DEV__`, and the desktop app.
- **Shows:** an API / WebSocket timeline (log WS events to it explicitly), state
  (Redux/MobX/Zustand/custom), AsyncStorage, a console, custom commands,
  benchmarks.
- **Best for:** a persistent "what is the app doing" monitor. A network timeline
  showing **zero** WS connections is exactly the signal that would have surfaced
  the `serverUrl` regression by eye.
- **Cost:** a dev dep + config to maintain; must be `__DEV__`-gated so it never
  ships in a release build.

### 3. Radon IDE — the integrated premium option

A VS Code / Cursor extension (Software Mansion) that embeds the simulator,
debugger, network panel, and element inspector directly in the editor.

- **Install:** editor extension + a licence (paid for teams).
- **Shows:** everything above in one pane, tied to an embedded device — the
  nicest end-to-end DX in 2026.
- **Best for:** teams that want one integrated surface and will pay for it.

### 4. RTC devtools relay — already built, best for _this_ app

The repo ships its own devtools for the non-Redux state layer, wired into the RN
client under `__DEV__` (see [architecture/20-devtools.md](architecture/20-devtools.md)).

- **Run:** `pnpm dev:devtools:relay` (the dev-machine relay on
  `ws://localhost:8790`), then open the browser panel at
  `/devtools/?relay=ws://localhost:8790`.
- **Shows:** the **WebSocket wire** (every frame, natively — nothing off-the-shelf
  matches this for the app's protocol), plus presenters, machines, and the
  event timeline.
- **The tell for simulator mode:** in `dev:ios:sim` there is no `WsAdapter`, so
  the **wire panel is empty** while the state panels still populate — an
  immediate "this build isn't on a real socket" signal.
- **Best for:** protocol-level debugging and understanding app state; it is the
  most app-aware inspector by construction.

## Watching the server side instead

You often don't need a client inspector at all: the socket terminates at
`@rtc/server`, which logs every accept / disconnect / rejected upgrade. Tail it
live — locally (`pnpm dev:ws`) or deployed (`fly logs -a rtc-clone-server`) — and
you see connection activity from the outside. See the server README's
[Connection observability](../packages/server/README.md#connection-observability).
