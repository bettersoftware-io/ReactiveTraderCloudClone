# @rtc/devtools-core

The event protocol, collector, and composition-root decorators behind RTC
DevTools -- custom state-inspection tooling for a state layer that has no
off-the-shelf browser devtools (presenter streams + per-mount RxJS machines
behind the ViewModel seam, not Redux/MobX/Zustand).

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers -- an instrumentation framework, structurally analogous to `@rtc/ws-effects` (`docs/architecture/06-package-dependencies.md` §6) |
| **Runtime deps** | `rxjs` only -- the same single permitted exception as `@rtc/domain`/`@rtc/ws-effects`, enforced by pnpm strict mode at install time |
| **Consumed by** | `@rtc/devtools-app` (the inspector SPA) and `@rtc/client-react` (the composition-root decorators + the app-side hub singleton) |
| **Must never import** | Any other `@rtc/*` package -- enforced by the dependency-cruiser `devtools-core-stays-pure` rule (`^packages/devtools-core/src` → every other `@rtc/*` package, see `docs/dependency-cruiser.md`). It decorates by *structural* shape (`InstrumentableMachine`, `WsAdapterLike`, anything with `.subscribe`), never by importing `@rtc/client-core`'s concrete types -- that is the whole point of a composition-root decorator. |

## Folder map

`src/` is flat except `instrument/`. Every file is production source except its `*.test.ts` sibling under `__tests__/`.

| Path | What lives here |
|---|---|
| `src/protocol.ts` | The wire vocabulary: `DevtoolsEvent`, `AppToInspector`, `InspectorToApp`, `PresenterManifest` -- versioned, JSON-serializable envelopes |
| `src/serialize.ts` | The one serializer: depth/array/string caps + tagged `ReadonlyMap`/`ReadonlySet` encodings |
| `src/DevtoolsHub.ts` | The collector: stream/machine registry, dormancy (`goLive`/`goDormant`), ~30 Hz coalescing flush, 10k-event ring buffer |
| `src/transport.ts`, `src/channel.ts` | The `DevtoolsTransport` port + the symmetric `Duplex<TSend, TRecv>` shape both sides implement |
| `src/BroadcastChannelDuplex.ts` | The v1 same-origin transport adapter (channel name `rtc-devtools`) |
| `src/instrument/` | The three composition-root decorators: `instrumentPresenters`, `instrumentMachineFactories`, `instrumentWsAdapter` |
| `src/InspectorClient.ts`, `src/InspectorStore.ts` | Panel-side: drives the hello/ping/bye handshake and rebuilds `InspectorState` from a snapshot + ordered batches -- consumed by `@rtc/devtools-app`, not the instrumented app |

## Where to start reading

1. `src/DevtoolsHub.ts` -- the dormancy contract. `registerStream`/`machineCreated` only write to a registry `Map`; `goLive`/`goDormant` are the *only* two places that subscribe/unsubscribe. Dormant cost is one boolean check per tapped emission, proven by `src/__tests__/DevtoolsHub.test.ts`'s `"is dormant until hello: no subscription on registered sources"` test.
2. `src/instrument/machines.ts` -- one generic wrapper (`instrumentMachineFactories`) covering every current and future per-mount machine kind: reports `machine:created`/`:state`/`:intent`/`:disposed`, and never blocks the real intent or `dispose()` even if the hub throws.
3. `src/instrument/presenters.ts` -- `instrumentPresenters` walks a `Presenters` object per a `PresenterManifest` (which keys are shared streams, parameterized-stream methods, or a shared machine), using `Proxy` (not spreads, since presenters are class instances).
4. `src/protocol.ts` -- the whole wire vocabulary in one file: `snapshot`-on-attach + `seq`-ordered `batch` deltas, the same state-transfer discipline as the app's own WS protocol.

## How it's used

`@rtc/client-react`'s composition root applies all three decorators before the
result reaches `createViewModel` (`packages/client-react/src/AppRoot.tsx`,
`packages/client-react/src/app/buildBrowserPorts.ts`):

```ts
// packages/client-react/src/app/buildBrowserPorts.ts
const ws = instrumentWsAdapter(
  new WsAdapter(buildWsUrl(url, token)),
  devtoolsHub,
);

// packages/client-react/src/AppRoot.tsx
const { presenters, commands } = createApp(buildBrowserPorts());
const instrumented = instrumentPresenters(
  presenters,
  PRESENTER_MANIFEST,
  devtoolsHub,
);
viewModelRef.current = createViewModel(
  instrumented,
  instrumentMachineFactories(
    createMachineFactories(instrumented),
    devtoolsHub,
  ),
  commands,
);
```

The app-side hub is a module-level singleton
(`packages/client-react/src/app/devtools/devtoolsHub.ts`) wired to a
`BroadcastChannelDuplex` and disposed on `pagehide`:

```ts
export const devtoolsHub = new DevtoolsHub({ appId: "rtc-web" });

if (typeof BroadcastChannel !== "undefined") {
  devtoolsHub.attachTransport(new BroadcastChannelDuplex("rtc-devtools"));

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      devtoolsHub.dispose();
    });
  }
}
```

## How to run

```bash
pnpm --filter @rtc/devtools-core build       # tsc --build && tsc-alias
pnpm --filter @rtc/devtools-core typecheck
pnpm --filter @rtc/devtools-core test        # vitest run
```

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§20 RTC DevTools](../../docs/architecture/20-devtools.md) -- the full narrative: why, the decorator architecture, the dormancy contract, the protocol, serving topology, and the perf framing
- [Full design spec](../../docs/superpowers/specs/2026-07-11-custom-devtools-design.md)
