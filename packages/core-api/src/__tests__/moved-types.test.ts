import { describe, expectTypeOf, it } from "vitest";

import type {
  ColorSchemeSource,
  DockLayoutStore,
  IWsAdapter,
  JarvisPort,
  JarvisUsagePort,
  LayoutState,
  SessionStore,
  WorkspaceTab,
} from "#/index";

describe("moved pure-type modules", () => {
  it("WorkspaceTab is the closed four-tab union", () => {
    expectTypeOf<WorkspaceTab>().toEqualTypeOf<
      "fx" | "credit" | "admin" | "equities"
    >();
  });

  it("the adapter port interfaces are reachable from the barrel", () => {
    expectTypeOf<SessionStore>().toHaveProperty("read");
    expectTypeOf<DockLayoutStore>().toHaveProperty("load");
    expectTypeOf<ColorSchemeSource>().toHaveProperty("prefersDark$");
    expectTypeOf<IWsAdapter>().toHaveProperty("rpc");
    expectTypeOf<JarvisPort>().toHaveProperty("ask");
    expectTypeOf<JarvisUsagePort>().toHaveProperty("usage$");
    expectTypeOf<LayoutState>().toHaveProperty("root");
  });
});
