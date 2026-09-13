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

  it("Presenters names the interfaces, never a class", () => {
    expectTypeOf<Presenters["connection"]["status$"]>().not.toBeAny();
  });
});
