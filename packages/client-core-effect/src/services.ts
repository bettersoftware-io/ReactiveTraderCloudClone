import { Context, Effect, ExecutionStrategy, Layer, Scope } from "effect";

import type { AppPorts } from "@rtc/core-api";

import { type EffectHost, runnerFor } from "#/bridge/out";

/** The ports the app was created with, as a service: `createApp(ports)`
 * provides them with `Layer.succeed(AppPortsTag, ports)`. `GenericTag`
 * rather than `class … extends Context.Tag(…)`: a class must name its file
 * (`rtc/class-filename-match`), and twenty-six files for twenty-six tags
 * would be the wrong trade. */
export const AppPortsTag = Context.GenericTag<AppPorts>(
  "@rtc/client-core-effect/AppPorts",
);

/** The Effect side every native presenter runs under — the `EffectHost`
 * `sharedFold` and `streamToStream` take — as a service. */
export const HostTag = Context.GenericTag<EffectHost>(
  "@rtc/client-core-effect/Host",
);

/** The host as a scoped Layer: the runtime is the one the Layer is built
 * under (`Effect.runtime`), and the scope is a closeable CHILD of the Layer's
 * own scope — closeable so `app.dispose()` can end it explicitly (the
 * order §22 documents: the scope, then the runtime), a child
 * so `runtime.dispose()` ends it anyway if nobody did. Every fold period is
 * forked from it. */
export const HostLive: Layer.Layer<EffectHost> = Layer.scoped(
  HostTag,
  Effect.gen(function* buildHost() {
    const runtime = yield* Effect.runtime<never>();
    const parent = yield* Effect.scope;
    const scope = yield* Scope.fork(parent, ExecutionStrategy.sequential);
    return { runtime: runnerFor(runtime), scope };
  }),
);

/** A presenter that needs only the host and the ports, as a Layer. */
export function presenterLayer<S>(
  tag: Context.Tag<S, S>,
  build: (host: EffectHost, ports: AppPorts) => S,
): Layer.Layer<S, never, EffectHost | AppPorts> {
  return Layer.effect(
    tag,
    Effect.map(Effect.all([HostTag, AppPortsTag]), ([host, ports]) => {
      return build(host, ports);
    }),
  );
}
