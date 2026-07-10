# @rtc/ws-effects

A small declarative RxJS effects framework for dispatching WebSocket messages -- the server's transport-dispatch layer, extracted into its own swappable package.

| | |
|---|---|
| **Ring** | ④ Frameworks & Drivers -- the dispatch framework (docs/architecture/01-overview.md §1.3.1) |
| **Runtime deps** | `rxjs` only -- the same single permitted exception as `@rtc/domain`, enforced by pnpm strict mode at install time |
| **Consumed by** | `@rtc/server` only -- no client package imports it |
| **Must never import** | `@rtc/domain`, `@rtc/shared`, `@rtc/client-react`, `@rtc/server` -- enforced by the dependency-cruiser `ws-effects-stays-pure` rule (`^packages/ws-effects/src` → `^packages/(domain\|shared\|client-react\|server)/`, see `docs/dependency-cruiser.md`). The framework is domain-blind: it knows nothing about FX, Credit, Equities, or the wire protocol's message names -- those live in `@rtc/shared` and `@rtc/server/src/effects/`. |

## Folder map

`src/` is flat -- no subfolders. Every file is production source except its `*.test.ts` sibling.

| Path | What lives here |
|---|---|
| `src/types.ts` | The `WsEffect<Ctx>` primitive, plus `Inbound`/`Outbound`/`Socket` — the whole public vocabulary |
| `src/stream.ts`, `src/rpc.ts` | Sugar built on the primitive: 1→N subscription fan-out, and correlated request/ack/nack |
| `src/combineEffects.ts` | Merges many effects over one shared inbound stream, isolating each from the others' errors |
| `src/createWsListener.ts` | Wires a `Socket` to a combined effect: pipes `in$` through it, sends `out$` to the socket, tears down on `closed$` |
| `src/operators.ts` | Two leaf helpers (`matchType`, `out`) that `stream`/`rpc` build on |

## Where to start reading

1. `src/types.ts` -- the one primitive. An **effect** is a pure stream transform, `WsEffect<Ctx> = (in$: Observable<Inbound>, ctx: Ctx) => Observable<Outbound>`: given the connection's inbound message stream and an application context, it returns the outbound frames to send. No classes, no `switch`, no imperative handler registration -- just data-flow.
2. `src/createWsListener.ts` -- the runtime: turns one `WsEffect` into a `(socket: Socket) => void` per-connection handler. Shares the inbound stream (`share()`) so N merged effects still cause one upstream subscription, and tears the effect's subscription down on `socket.closed$`.
3. `src/rpc.ts` and `src/stream.ts` -- the two sugars almost every real effect is built from. `rpc(inType, outType, handle)` absorbs the try/ack/catch/nack boilerplate for one-shot request/response; `stream(inType, project)` absorbs per-message inner-subscription fan-out for 1→N streaming (SUBSCRIBE_PRICING and friends).
4. `src/combineEffects.ts` -- how many effects become one. `combineEffects(...effects)` merges them over the same shared `in$`, `catchError`-isolating each so one broken effect can't take its siblings down.

## How it's used

`@rtc/server` composes 24 effects (`fx`/`credit`/`equities`/`admin.effects.ts`) into one via `combineEffects`, then wires it to every incoming connection via `createWsListener` -- the entire dispatch layer is four lines in `packages/server/src/index.ts`:

```ts
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import { allEffects } from "./effects/index.js";
import { createServices } from "./services/serviceContainer.js";

const services = createServices();
const listen = createWsListener(combineEffects(...allEffects), services);
```

A single effect, built from the `rpc` sugar (`packages/server/src/effects/admin.effects.ts`):

```ts
const getThroughput$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.GET_THROUGHPUT,
  SERVER_MSG.THROUGHPUT_RESPONSE,
  (_payload, ctx) => {
    return ctx.throughput.getThroughput();
  },
);
```

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§7 The Declarative Effects Server](../../docs/architecture/07-communication-patterns.md#the-declarative-effects-server-rtcws-effects) -- the full narrative: why the old `wsHandler.ts` switch was replaced, the four layers of error isolation, and the equities-over-the-wire gap it closed
- [§10.6 Declarative WS effects over a server `switch`](../../docs/architecture/10-key-design-decisions.md#10-key-design-decisions) -- the design decision record (choice, alternatives considered, cost accepted)
- [Full design spec](../../docs/superpowers/specs/2026-07-02-ws-effects-declarative-server-design.md)
