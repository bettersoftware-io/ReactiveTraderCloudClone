import { describe, expect, it, vi } from "vitest";

import type { CoreFactory } from "@rtc/core-api";

import { bootErrorPage } from "#tests/ui/pages/BootErrorPage";

import {
  type BootEnv,
  type BootResult,
  bootCore,
  formatBootedMessage,
  renderBootError,
  runBoot,
} from "./bootApp";
import { CORE_CHOICE_KEY } from "./coreSelection";

describe("bootCore", () => {
  it("boots the URL's core, sourced from url, and publishes nothing itself", async () => {
    delete document.documentElement.dataset.coreImpl;
    const load = vi.fn(async () => {
      return createFakeCore();
    });

    const result = await bootCore(
      createEnv({ href: "https://x.test/?core=effect", load }),
    );

    expect(result.impl).toBe("effect");
    expect(result.source).toBe("url");
    expect(load).toHaveBeenCalledWith("effect");
    expect(document.documentElement.dataset.coreImpl).toBeUndefined();
  });

  it("clears an unknown stored choice and warns, falling back to source fallback", async () => {
    const storage = createMemoryStorage({ [CORE_CHOICE_KEY]: "gone" });
    const warn = vi.fn();
    const result = await bootCore(createEnv({ storage, warn }));

    expect(result.impl).toBe("rxjs");
    expect(result.source).toBe("fallback");
    expect(storage.getItem(CORE_CHOICE_KEY)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"gone"'));
  });

  it("warns when the stored-choice READ itself fails (a storage exception, not an unknown value)", async () => {
    const storage: Storage = {
      ...createMemoryStorage(),
      getItem: () => {
        throw new Error("denied");
      },
    };
    const warn = vi.fn();

    await bootCore(createEnv({ storage, warn }));

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("failed to read the stored core choice"),
    );
  });

  it("rejects when the core chunk fails to load (no silent fallback)", async () => {
    const load = vi.fn(async () => {
      throw new Error("chunk 404");
    });

    await expect(
      bootCore(createEnv({ href: "https://x.test/?core=async", load })),
    ).rejects.toThrow("chunk 404");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("throws synchronously on an invalid build default (developer error, not a boot-error screen)", () => {
    // Returned (not awaited): the assertion is that the CALL throws before
    // any promise exists; returning it keeps it from floating.
    expect(() => {
      return bootCore(createEnv({ buildDefault: "bogus" }));
    }).toThrow(/VITE_CORE_IMPL/);
  });
});

describe("renderBootError", () => {
  it("renders a boot error whose action resets to the default core", () => {
    const root = document.createElement("div");
    const reset = vi.fn();

    renderBootError(root, new Error("chunk 404"), reset);

    expect(root.textContent).toContain("chunk 404");
    bootErrorPage().clickReset(root);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("formatBootedMessage", () => {
  it.each(["url", "stored", "build", "fallback"] as const)(
    "names the impl and the %s source",
    (source) => {
      expect(formatBootedMessage("effect", source)).toBe(
        `[core] booted effect from ${source}`,
      );
    },
  );
});

describe("runBoot", () => {
  it("calls onBooted with the resolved result", async () => {
    const onBooted = vi.fn();
    const onError = vi.fn();
    const result = createFakeResult();

    await runBoot(Promise.resolve(result), onBooted, onError);

    expect(onBooted).toHaveBeenCalledWith(result);
    expect(onError).not.toHaveBeenCalled();
  });

  it("routes a rejected boot promise to onError", async () => {
    const onBooted = vi.fn();
    const onError = vi.fn();
    const error = new Error("chunk 404");

    await runBoot(Promise.reject(error), onBooted, onError);

    expect(onBooted).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("routes a throw INSIDE onBooted to onError too (e.g. render blowing up)", async () => {
    const error = new Error("render blew up");
    const onBooted = vi.fn(() => {
      throw error;
    });
    const onError = vi.fn();

    await runBoot(Promise.resolve(createFakeResult()), onBooted, onError);

    expect(onBooted).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });
});

function createEnv(overrides: Partial<BootEnv> = {}): BootEnv {
  return {
    href: "https://x.test/",
    storage: createMemoryStorage(),
    buildDefault: undefined,
    warn: vi.fn(),
    load: vi.fn(async () => {
      return createFakeCore();
    }),
    ...overrides,
  };
}

function createFakeCore(): CoreFactory {
  return {
    createApp: vi.fn(),
    createMachineFactories: vi.fn(),
  } as unknown as CoreFactory;
}

function createFakeResult(): BootResult {
  return { impl: "rxjs", source: "fallback", core: createFakeCore() };
}

function createMemoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(seed));

  return {
    getItem: (key: string): string | null => {
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      data.set(key, value);
    },
    removeItem: (key: string): void => {
      data.delete(key);
    },
    clear: (): void => {
      data.clear();
    },
    key: (index: number): string | null => {
      return Array.from(data.keys())[index] ?? null;
    },
    get length(): number {
      return data.size;
    },
  };
}
