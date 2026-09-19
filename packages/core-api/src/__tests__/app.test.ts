import { describe, expectTypeOf, it } from "vitest";

import type { App, AppCommands, CoreFactory, Presenters } from "#/index";

describe("App contract", () => {
  it("App carries presenters, ports, commands and an async dispose", () => {
    expectTypeOf<App["dispose"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<AppCommands>().toHaveProperty("reconnect");
  });

  it("CoreFactory is the createApp/createMachineFactories pair", () => {
    expectTypeOf<keyof CoreFactory>().toEqualTypeOf<
      "createApp" | "createMachineFactories"
    >();
  });

  it("Presenters names interfaces a plain object satisfies, never a class", () => {
    // A class type with a private member, or a nominal brand, would reject
    // a structurally identical object literal; an interface accepts it.
    expectTypeOf<ConnectionStatusShape>().toMatchTypeOf<
      Presenters["connection"]
    >();
    expectTypeOf<AnimatedBackgroundShape>().toMatchTypeOf<
      Presenters["animatedBackground"]
    >();
  });
});

interface ConnectionStatusShape {
  readonly status$: Presenters["connection"]["status$"];
}

interface AnimatedBackgroundShape {
  readonly enabled$: Presenters["animatedBackground"]["enabled$"];
  set(on: boolean): void;
  toggle(current: boolean): void;
}
