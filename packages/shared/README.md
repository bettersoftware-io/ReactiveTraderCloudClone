# @rtc/shared

Wire-protocol DTOs and the `CLIENT_MSG`/`SERVER_MSG` envelope types shared by client and server.

| | |
|---|---|
| **Ring** | ③ Interface Adapters — boundary DTOs |
| **Runtime deps** | `@rtc/domain` only (`packages/shared/package.json` `dependencies`) |
| **Consumed by** | `client-core`, `server` — *not* `client-react` or `client-react-native` directly (neither lists it as a dependency or imports `CLIENT_MSG`/`SERVER_MSG` in `src/`) |
| **Must never import** | `client-react`, `server` — dependency-cruiser's `shared-no-apps` rule (`docs/dependency-cruiser.md`) restricts `shared` to reaching inward, at most to `domain`; the `domain-stays-pure` rule additionally forbids `@rtc/domain` from ever importing `@rtc/shared` back |

## Folder map

| Path | What lives here |
|---|---|
| `src/protocol/` | The wire contract itself: `messages.ts` (`CLIENT_MSG`/`SERVER_MSG` string constants — the single source of truth for every WebSocket message name), `rpc.ts` (`RpcResponse<T>` ack/nack envelope), `sow.ts` (the two state-of-the-world envelope shapes every streamed DTO rides in). |
| `src/fx/` | FX domain DTOs: pricing, reference data, blotter, execution, analytics. |
| `src/credit/` | Credit RFQ domain DTOs: dealers, instruments, workflow events. |
| `src/__fixtures__/` | Canonical server-frame factories (`wireFrames.ts`), exported as a second public entry point (`@rtc/shared/__fixtures__/wireFrames`) so fake-WS test doubles can't silently drift from the real wire shapes — a DTO shape change fails the fixture's compile step before any test runs. |

## Where to start reading

1. `src/protocol/messages.ts` — `CLIENT_MSG`/`SERVER_MSG`, the flat namespaces of every message name the client sends and the server streams back; a typo here breaks the wire contract silently, so it's the first thing to read before touching either side of the connection.
2. `src/protocol/sow.ts` — the two envelope shapes every subscription stream uses: `BulkSoWMessage<T>` (bulk refresh, used by Blotter/ReferenceData/Analytics) and `MarkerEvent<T>` (incremental added/removed markers, used by Workflow/Instrument/Dealer).
3. `src/index.ts` — the public export surface: every DTO and protocol type re-exported flat, so consumers import everything from `@rtc/shared` regardless of which folder it lives in.
4. `src/__fixtures__/wireFrames.ts` — real, typed server-frame factories consumed by `@rtc/client-core`'s `WsAdapter` contract tests; read this to see the DTOs and envelopes actually assembled into wire-shaped payloads.

## How it's used

`@rtc/server`'s FX effects build outbound frames straight from the shared DTOs and message constants (`packages/server/src/effects/fx.effects.ts:1-20`):

```ts
import type {
  AnalyticsDto,
  BlotterMessage,
  CurrencyPairUpdateDto,
  ExecutionRequestDto,
  ExecutionResponseDto,
  PriceHistoryDto,
  PriceTickDto,
  ReferenceDataMessage,
  TradeDto,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
```

and, further down in the same file, the `referenceData$` effect wires a `CLIENT_MSG` subscription to a `ReferenceDataMessage` envelope (`packages/server/src/effects/fx.effects.ts:40-60`):

```ts
const referenceData$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA,
  (_payload, ctx) => {
    let isFirst = true;
    return ctx.referenceData.getCurrencyPairs().pipe(
      map((pairs: readonly CurrencyPair[]): Outbound => {
        const updates: CurrencyPairUpdateDto[] = pairs.map((p) => {
          return {
            symbol: p.symbol,
            ratePrecision: p.ratePrecision,
            pipsPosition: p.pipsPosition,
            baseMid: p.baseMid,
            typicalSpreadPips: p.typicalSpreadPips,
          };
        });
        const message: ReferenceDataMessage = {
          updates,
          isStateOfTheWorld: isFirst,
          isStale: false,
        };
        isFirst = false;
```

`@rtc/client-core`'s `portFactory.ts` imports the identical DTOs and constants on the receiving end (`packages/client-core/src/adapters/portFactory.ts:64-77`), and its `wsReal*.contract.test.ts` suites build request/response frames from `@rtc/shared/__fixtures__/wireFrames` — so the same envelope shapes are exercised on both sides of the socket, in production code and in tests, without duplication.

## See also

- [Its §13 card](../../docs/architecture/13-codebase-map.md#132-l1----the-package-line-map)
- [§15.1 Control Flow vs Imports vs Data Flow](../../docs/architecture/15-flows.md#151-control-flow-vs-imports-vs-data-flow) — the `client-react → react-bindings → client-core → domain`/`shared` import direction this package sits at the bottom of
- [§16 Trailheads — "Add a wire message"](../../docs/architecture/16-trailheads.md#16-trailheads) — the step-by-step recipe for adding a `CLIENT_MSG`/`SERVER_MSG` pair and its DTO here
