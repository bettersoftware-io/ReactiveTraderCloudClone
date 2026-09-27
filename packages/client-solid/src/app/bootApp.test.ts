import { describe, expect, it, vi } from "vitest";

import type { CoreFactory } from "@rtc/core-api";

import { bootErrorPage } from "#tests/ui/pages/BootErrorPage";

import type { BootEnv } from "./bootApp";
import { bootCore, renderBootError } from "./bootApp";
import { CORE_CHOICE_KEY } from "./coreSelection";

describe("bootCore", () => {
  it("boots the URL's core and publishes nothing itself", async () => {
    const load = vi.fn(async () => {
      return createFakeCore();
    });

    const result = await bootCore(
      createEnv({ href: "https://x.test/?core=effect", load }),
    );

    expect(result.impl).toBe("effect");
    expect(load).toHaveBeenCalledWith("effect");
  });

  it("clears an unknown stored choice and warns", async () => {
    const storage = createMemoryStorage({ [CORE_CHOICE_KEY]: "gone" });
    const warn = vi.fn();
    const result = await bootCore(createEnv({ storage, warn }));

    expect(result.impl).toBe("rxjs");
    expect(storage.getItem(CORE_CHOICE_KEY)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"gone"'));
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
});

describe("renderBootError", () => {
  it("renders a boot error whose action resets to the default core", async () => {
    const root = document.createElement("div");
    const reset = vi.fn();

    renderBootError(root, new Error("chunk 404"), reset);

    expect(root.textContent).toContain("chunk 404");
    bootErrorPage().clickReset(root);
    expect(reset).toHaveBeenCalledTimes(1);
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
