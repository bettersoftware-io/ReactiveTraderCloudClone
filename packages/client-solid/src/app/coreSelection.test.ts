import { describe, expect, it, vi } from "vitest";

import type { CoreSelectionDeps } from "./coreSelection";
import {
  CORE_CHOICE_KEY,
  createCoreSelection,
  loadCore,
  readStoredChoice,
  resolveCoreChoice,
  safeLocalStorage,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "./coreSelection";

describe("resolveCoreChoice", () => {
  it("defaults to rxjs", () => {
    expect(
      resolveCoreChoice({ url: null, stored: null, buildDefault: undefined })
        .impl,
    ).toBe("rxjs");
  });

  it("prefers the build default over nothing", () => {
    expect(
      resolveCoreChoice({ url: null, stored: null, buildDefault: "async" })
        .impl,
    ).toBe("async");
  });

  it("prefers the stored choice over the build default", () => {
    expect(
      resolveCoreChoice({ url: null, stored: "effect", buildDefault: "async" })
        .impl,
    ).toBe("effect");
  });

  it("prefers the URL over the stored choice", () => {
    expect(
      resolveCoreChoice({
        url: "async",
        stored: "effect",
        buildDefault: "rxjs",
      }).impl,
    ).toBe("async");
  });

  it("ignores an unknown URL value with a warning", () => {
    const choice = resolveCoreChoice({
      url: "efect",
      stored: "effect",
      buildDefault: undefined,
    });

    expect(choice.impl).toBe("effect");
    expect(choice.warnings).toEqual([expect.stringContaining('?core="efect"')]);
    expect(choice.clearStored).toBe(false);
  });

  it("clears an unknown stored value with a warning", () => {
    const choice = resolveCoreChoice({
      url: null,
      stored: "gone",
      buildDefault: undefined,
    });

    expect(choice.impl).toBe("rxjs");
    expect(choice.clearStored).toBe(true);
    expect(choice.warnings).toEqual([expect.stringContaining('"gone"')]);
  });

  it("treats an empty build default as unset", () => {
    expect(
      resolveCoreChoice({ url: null, stored: null, buildDefault: "" }).impl,
    ).toBe("rxjs");
  });

  it("fails closed on an unknown build default", () => {
    expect(() => {
      resolveCoreChoice({ url: null, stored: null, buildDefault: "efect" });
    }).toThrow('VITE_CORE_IMPL="efect" is not one of rxjs, async, effect');
  });
});

describe("loadCore", () => {
  it.each(["rxjs", "async", "effect"] as const)(
    "loads the %s core",
    async (impl) => {
      const core = await loadCore(impl);

      expect(typeof core.createApp).toBe("function");
      expect(typeof core.createMachineFactories).toBe("function");
    },
  );

  it("loads distinct factories per core", async () => {
    const [a, b, c] = await Promise.all([
      loadCore("rxjs"),
      loadCore("async"),
      loadCore("effect"),
    ]);

    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("storage", () => {
  it("reads nothing when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
    };

    expect(readStoredChoice(storage)).toBeNull();
  });

  it("reports a failed save instead of throwing", () => {
    const storage = {
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(saveCoreChoice(storage, "async")).toBe(false);
  });

  it("saves under the choice key", () => {
    const setItem = vi.fn();

    expect(saveCoreChoice({ setItem }, "effect")).toBe(true);
    expect(setItem).toHaveBeenCalledWith(CORE_CHOICE_KEY, "effect");
  });
});

describe("safeLocalStorage", () => {
  it("returns window.localStorage", () => {
    expect(safeLocalStorage()).toBe(window.localStorage);
  });
});

describe("urlWithoutCoreParam", () => {
  it("drops only the core parameter", () => {
    expect(urlWithoutCoreParam("https://x.test/app?core=effect&a=1#h")).toBe(
      "https://x.test/app?a=1#h",
    );
  });

  it("leaves a URL without the parameter unchanged", () => {
    expect(urlWithoutCoreParam("https://x.test/app")).toBe(
      "https://x.test/app",
    );
  });
});

describe("createCoreSelection", () => {
  it("saves and reloads without ?core= onto the chosen core", () => {
    const { setItem, navigate, deps } = createDeps();

    createCoreSelection(deps).select("async");

    expect(setItem).toHaveBeenCalledWith(CORE_CHOICE_KEY, "async");
    expect(navigate).toHaveBeenCalledWith("https://x.test/?a=1");
  });

  it("falls back to ?core= navigation when the choice cannot be saved", () => {
    const { navigate, deps } = createDeps(false);

    createCoreSelection(deps).select("async");

    expect(navigate).toHaveBeenCalledWith("https://x.test/?a=1&core=async");
  });

  it("does nothing when the current core is selected", () => {
    const { setItem, navigate, deps } = createDeps();

    createCoreSelection(deps).select("rxjs");

    expect(setItem).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("offers all three cores", () => {
    expect(
      createCoreSelection(createDeps().deps).options.map((o) => {
        return o.impl;
      }),
    ).toEqual(["rxjs", "async", "effect"]);
  });
});

interface CreateDepsResult {
  readonly setItem: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly deps: CoreSelectionDeps;
}

function createDeps(saveWorks = true): CreateDepsResult {
  const setItem = vi.fn(() => {
    if (!saveWorks) {
      throw new Error("denied");
    }
  });
  const navigate = vi.fn();
  const storage: Storage = {
    setItem,
    getItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  };

  return {
    setItem,
    navigate,
    deps: {
      current: "rxjs" as const,
      storage,
      href: (): string => {
        return "https://x.test/?core=effect&a=1";
      },
      navigate,
    },
  };
}
