# @rtc/core-contract

The paradigm-neutral **behavioural** contract of the application core — the
core-level twin of `@rtc/ui-contract`. `@rtc/core-api` says what the shape of
a core is; this package says how a core must *behave*, as executable specs
that every core must pass identically.

Dev-only. Depends on `@rtc/core-api`, `@rtc/domain` and `rxjs` — never on a
core. Each core owns exactly one **runner** file that builds its own base
`AppPorts`, wraps them with `scriptPorts`, and calls `describeCoreContract`:

```ts
// packages/client-core/src/composition.coreContract.test.ts
describeCoreContract("rxjs", makeRxjsHarness);
```

That inversion is why the dependency edge points this way: `client-core`
devDepends on `@rtc/core-contract`, and `@rtc/core-contract` depends on no
core at all, so a second or third core can be added without a workspace cycle.

## What's in here

| File | What it is |
|---|---|
| `src/harness/collect.ts` | `collect(stream)` — subscribe and keep every emission; `values` is live. |
| `src/harness/scriptedPorts.ts` | `scriptPorts(base)` — wraps a runner's `AppPorts` so a suite can drive connection events and the OS colour scheme deterministically. Everything else passes through untouched. |
| `src/harness/harness.ts` | `CoreHarness` / `MakeHarness` / `Suite` — what a runner hands the suites. |
| `src/registry.ts` | `CONTRACT_SUITES`, the **exhaustive** member→suite map (a new `Presenters` or `MachineFactories` key is a compile error until it is listed), plus the hand-maintained `PENDING_SUITES` list. |
| `src/registry.test.ts` | The drift test: the `null`s in the registry and `PENDING_SUITES` must agree. |
| `src/suites/*.ts` | One behavioural suite per contract member. |

## Adding a suite

1. Write `src/suites/<member>.ts` exporting `describe<Member>Contract(label, makeHarness)`.
2. Point the member at it in `CONTRACT_SUITES` and delete its `PENDING_SUITES` entry.
3. Run every core's runner — a suite is only useful once **all** of them pass it.

Suites assert **envelope-level** behaviour only: what a subscriber observes
(values, order, replay, teardown), never how a core computes it. Anything that
reaches inside RxJS operators would stop being a contract and start being a
test of one implementation.
