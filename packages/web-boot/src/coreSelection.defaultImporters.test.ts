import { describe, expect, it, vi } from "vitest";

import { loadCore } from "#/coreSelection";

describe("loadCore with the default importers", () => {
  it("loads the RxJS core's factory from @rtc/client-core-rxjs", async () => {
    expect(await loadCore("rxjs")).toEqual({ name: "rxjs-factory" });
  });

  it("loads the async core's factory from @rtc/client-core-async", async () => {
    expect(await loadCore("async")).toEqual({ name: "async-factory" });
  });

  it("loads the Effect core's factory from @rtc/client-core-effect", async () => {
    expect(await loadCore("effect")).toEqual({ name: "effect-factory" });
  });
});

// A real `import()` of a whole core is seconds under vitest, so each of the
// three packages is mocked down to the one factory `loadCore` reads. What
// this pins is the default importers' wiring: which package, which export.
vi.mock("@rtc/client-core-rxjs", () => {
  return { rxjsCore: { name: "rxjs-factory" } };
});

vi.mock("@rtc/client-core-async", () => {
  return { asyncCore: { name: "async-factory" } };
});

vi.mock("@rtc/client-core-effect", () => {
  return { effectCore: { name: "effect-factory" } };
});
