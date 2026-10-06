import { state } from "@rx-state/core";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, type Mock, vi } from "vitest";

import type { CoreFactory, CoreImpl } from "@rtc/core-api";

import {
  CORE_CHOICE_KEY,
  type CoreImporters,
  type CoreSelectionDeps,
  clearCoreChoice,
  createCoreSelection,
  defaultCoreResetHref,
  loadCore,
  readStoredChoice,
  resolveCoreChoice,
  safeLocalStorage,
  saveCoreChoice,
  urlWithoutCoreParam,
} from "#/coreSelection";

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
  // Fake importers only: a real dynamic import() of a whole alternative core
  // under vitest takes seconds on a loaded runner. The real imports are
  // witnessed by the e2e runs (test:e2e:async / :effect boot on them) and by
  // `pnpm check:core-bundle` (each sits in exactly one lazy chunk).
  it("loads the RxJS core through the rxjs importer alone", async () => {
    const importers = createFakeImporters();

    const core = await loadCore("rxjs", importers);

    expect(core).toBe(FAKE_RXJS_CORE);
    expect(importers.rxjs).toHaveBeenCalledOnce();
    expect(importers.async).not.toHaveBeenCalled();
    expect(importers.effect).not.toHaveBeenCalled();
  });

  it("loads the async core through the async importer alone", async () => {
    const importers = createFakeImporters();

    const core = await loadCore("async", importers);

    expect(core).toBe(FAKE_ASYNC_CORE);
    expect(importers.async).toHaveBeenCalledOnce();
    expect(importers.rxjs).not.toHaveBeenCalled();
    expect(importers.effect).not.toHaveBeenCalled();
  });

  it("loads the Effect core through the effect importer alone", async () => {
    const importers = createFakeImporters();

    const core = await loadCore("effect", importers);

    expect(core).toBe(FAKE_EFFECT_CORE);
    expect(importers.effect).toHaveBeenCalledOnce();
    expect(importers.rxjs).not.toHaveBeenCalled();
    expect(importers.async).not.toHaveBeenCalled();
  });

  it("rejects with the importer's own error when a chunk fails to load", async () => {
    const failure = new Error("Failed to fetch dynamically imported module");
    const importers = createFakeImporters();
    importers.effect.mockRejectedValueOnce(failure);

    await expect(loadCore("effect", importers)).rejects.toBe(failure);
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

  it("reports absent storage as not saved without throwing", () => {
    expect(saveCoreChoice(undefined, "async")).toBe(false);
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

  it("returns undefined when reading localStorage throws", () => {
    const spy = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    try {
      expect(safeLocalStorage()).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
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
  it("swaps to another core through the host", () => {
    const { swapTo, deps } = createDeps();

    createCoreSelection(deps).select("async");

    expect(swapTo).toHaveBeenCalledExactlyOnceWith("async");
  });

  it("does nothing when the current core is selected", () => {
    const { swapTo, deps } = createDeps();

    createCoreSelection(deps).select("rxjs");

    expect(swapTo).not.toHaveBeenCalled();
  });

  it("reports the host's failure stream", () => {
    const { deps } = createDeps();

    expect(createCoreSelection(deps).failure$).toBe(deps.failure$);
  });

  it("offers all three cores and names the current one", () => {
    const selection = createCoreSelection(createDeps().deps);

    expect(selection.current).toBe("rxjs");
    expect(
      selection.options.map((o) => {
        return o.impl;
      }),
    ).toEqual(["rxjs", "async", "effect"]);
  });
});

interface CreateDepsResult {
  readonly swapTo: Mock<(impl: CoreImpl) => void>;
  readonly deps: CoreSelectionDeps;
}

function createDeps(): CreateDepsResult {
  const swapTo = vi.fn<(impl: CoreImpl) => void>();

  return {
    swapTo,
    deps: {
      current: "rxjs",
      swapTo,
      failure$: state(new BehaviorSubject<string | null>(null), null),
    },
  };
}

/** Stand-ins for the three lazily imported cores — only their identity is
 * asserted, so an empty cast object is enough. */
const FAKE_RXJS_CORE = {} as CoreFactory;
const FAKE_ASYNC_CORE = {} as CoreFactory;
const FAKE_EFFECT_CORE = {} as CoreFactory;

/** `CoreImporters` whose members are spies, so a case can assert which one ran. */
interface FakeImporters extends CoreImporters {
  readonly rxjs: Mock<CoreImporters["rxjs"]>;
  readonly async: Mock<CoreImporters["async"]>;
  readonly effect: Mock<CoreImporters["effect"]>;
}

function createFakeImporters(): FakeImporters {
  return {
    rxjs: vi.fn(() => {
      return Promise.resolve({ rxjsCore: FAKE_RXJS_CORE });
    }),
    async: vi.fn(() => {
      return Promise.resolve({ asyncCore: FAKE_ASYNC_CORE });
    }),
    effect: vi.fn(() => {
      return Promise.resolve({ effectCore: FAKE_EFFECT_CORE });
    }),
  };
}
