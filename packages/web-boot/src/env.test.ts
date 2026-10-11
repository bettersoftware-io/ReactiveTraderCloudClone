import { describe, expect, it } from "vitest";

import { webBootEnvOf } from "#/env";

describe("webBootEnvOf", () => {
  it("carries the four build values across under their own names", () => {
    expect(
      webBootEnvOf({
        DEV: false,
        VITE_SERVER_URL: "wss://example.test",
        VITE_DEMO_AUTH: '{"demo":"pw"}',
        VITE_DEV_AUTH: '{"dev":"pw"}',
        VITE_CORE_IMPL: "effect",
      }),
    ).toEqual({
      serverUrl: "wss://example.test",
      demoAuth: '{"demo":"pw"}',
      devAuth: '{"dev":"pw"}',
      coreImpl: "effect",
      narratorTestSeam: false,
      dev: false,
    });
  });

  it("leaves every value unset for an empty record, with the seam off", () => {
    expect(webBootEnvOf({})).toEqual({
      serverUrl: undefined,
      demoAuth: undefined,
      devAuth: undefined,
      coreImpl: undefined,
      narratorTestSeam: false,
      dev: false,
    });
  });

  it("carries the narrator seam on a dev build", () => {
    const env = webBootEnvOf({ DEV: true });

    expect(env.dev).toBe(true);
    expect(env.narratorTestSeam).toBe(true);
  });

  it("carries the narrator seam on a production build made with the variable", () => {
    const env = webBootEnvOf({ DEV: false, VITE_NARRATOR_TEST_SEAM: "1" });

    expect(env.dev).toBe(false);
    expect(env.narratorTestSeam).toBe(true);
  });

  it("keeps the seam off for any other value of the variable", () => {
    expect(
      webBootEnvOf({ DEV: false, VITE_NARRATOR_TEST_SEAM: "0" })
        .narratorTestSeam,
    ).toBe(false);
  });
});
