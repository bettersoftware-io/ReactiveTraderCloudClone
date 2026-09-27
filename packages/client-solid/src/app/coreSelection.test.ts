import { describe, expect, it, vi } from "vitest";

import type { CoreSelectionDeps } from "./coreSelection";
import {
  CORE_CHOICE_KEY,
  clearCoreChoice,
  createCoreSelection,
  defaultCoreResetHref,
  loadCore,
  readStoredChoice,
  resolveCoreChoice,
  safeLocalStorage,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "./coreSelection";

describe("resolveCoreChoice", () => {
  it("defaults to rxjs from the fallback source", () => {
    const choice = resolveCoreChoice({
      url: null,
      stored: null,
      buildDefault: undefined,
    });

    expect(choice.impl).toBe("rxjs");
    expect(choice.source).toBe("fallback");
  });

  it("prefers the build default over nothing, sourced from build", () => {
    const choice = resolveCoreChoice({
      url: null,
      stored: null,
      buildDefault: "async",
    });

    expect(choice.impl).toBe("async");
    expect(choice.source).toBe("build");
  });

  it("prefers the stored choice over the build default, sourced from stored", () => {
    const choice = resolveCoreChoice({
      url: null,
      stored: "effect",
      buildDefault: "async",
    });

    expect(choice.impl).toBe("effect");
    expect(choice.source).toBe("stored");
  });

  it("prefers the URL over the stored choice, sourced from url", () => {
    const choice = resolveCoreChoice({
      url: "async",
      stored: "effect",
      buildDefault: "rxjs",
    });

    expect(choice.impl).toBe("async");
    expect(choice.source).toBe("url");
  });

  it("ignores an unknown URL value with a warning, falling through to the stored source", () => {
    const choice = resolveCoreChoice({
      url: "efect",
      stored: "effect",
      buildDefault: undefined,
    });

    expect(choice.impl).toBe("effect");
    expect(choice.source).toBe("stored");
    expect(choice.warnings).toEqual([expect.stringContaining('?core="efect"')]);
    expect(choice.clearStored).toBe(false);
  });

  it("clears an unknown stored value with a warning, falling through to the fallback source", () => {
    const choice = resolveCoreChoice({
      url: null,
      stored: "gone",
      buildDefault: undefined,
    });

    expect(choice.impl).toBe("rxjs");
    expect(choice.source).toBe("fallback");
    expect(choice.clearStored).toBe(true);
    expect(choice.warnings).toEqual([expect.stringContaining('"gone"')]);
  });

  it("treats an empty build default as unset, sourced from fallback", () => {
    const choice = resolveCoreChoice({
      url: null,
      stored: null,
      buildDefault: "",
    });

    expect(choice.impl).toBe("rxjs");
    expect(choice.source).toBe("fallback");
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

  it("warns with the caught reason when reading fails", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
    };
    const warn = vi.fn();

    readStoredChoice(storage, warn);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("denied"));
  });

  it("does not warn on a successful read", () => {
    const warn = vi.fn();

    readStoredChoice(
      {
        getItem: () => {
          return null;
        },
      },
      warn,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it("reports a failed save instead of throwing", () => {
    const storage = {
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(saveCoreChoice(storage, "async")).toBe(false);
  });

  it("warns with the caught reason when saving fails", () => {
    const storage = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    const warn = vi.fn();

    saveCoreChoice(storage, "async", warn);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("quota"));
  });

  it("saves under the choice key", () => {
    const setItem = vi.fn();

    expect(saveCoreChoice({ setItem }, "effect")).toBe(true);
    expect(setItem).toHaveBeenCalledWith(CORE_CHOICE_KEY, "effect");
  });

  it("does not warn on a successful save", () => {
    const warn = vi.fn();

    saveCoreChoice({ setItem: vi.fn() }, "effect", warn);

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns with the caught reason when clearing fails", () => {
    const storage = {
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const warn = vi.fn();

    clearCoreChoice(storage, warn);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("denied"));
  });

  it("does not warn on a successful clear", () => {
    const warn = vi.fn();

    clearCoreChoice({ removeItem: vi.fn() }, warn);

    expect(warn).not.toHaveBeenCalled();
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

describe("defaultCoreResetHref", () => {
  it("forces ?core=rxjs, replacing any existing value", () => {
    expect(defaultCoreResetHref("https://x.test/app?core=effect&a=1")).toBe(
      "https://x.test/app?core=rxjs&a=1",
    );
  });

  it("adds ?core=rxjs when the parameter was absent", () => {
    expect(defaultCoreResetHref("https://x.test/app?a=1")).toBe(
      "https://x.test/app?a=1&core=rxjs",
    );
  });

  it("keeps the hash", () => {
    expect(defaultCoreResetHref("https://x.test/app#section")).toBe(
      "https://x.test/app?core=rxjs#section",
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

  it("warns with the caught reason when the choice cannot be persisted", () => {
    const { deps } = createDeps(false);
    const warn = vi.fn();

    createCoreSelection({ ...deps, warn }).select("async");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("denied"));
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
