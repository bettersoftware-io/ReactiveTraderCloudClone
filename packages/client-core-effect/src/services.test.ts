import { Effect, Exit, ManagedRuntime, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { runForkIn } from "#/bridge/out";
import { HostLive, HostTag } from "#/services";

describe("HostLive", () => {
  it("builds synchronously, runs effects, and its scope closes with the runtime", async () => {
    const runtime = ManagedRuntime.make(HostLive);
    const host = runtime.runSync(HostTag);
    expect(host.runtime.runSync(Effect.succeed(1))).toBe(1);
    let interrupted = false;
    runForkIn(
      host.runtime,
      Effect.never.pipe(
        Effect.onInterrupt(() => {
          return Effect.sync(() => {
            interrupted = true;
          });
        }),
      ),
      host.scope,
    );
    await runtime.dispose();
    expect(interrupted).toBe(true);
  });

  it("closing the host scope directly is idempotent with the runtime's own dispose", async () => {
    const runtime = ManagedRuntime.make(HostLive);
    const host = runtime.runSync(HostTag);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await expect(runtime.dispose()).resolves.toBeUndefined();
  });
});
