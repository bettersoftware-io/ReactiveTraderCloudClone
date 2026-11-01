import { describe, expect, it, type Mock, type Mocked, vi } from "vitest";

import type { OwnKeyStore, StoredOwnKey } from "@rtc/core-api";
import type { JarvisOwnKeySetting } from "@rtc/domain";

import {
  createOwnKeyController,
  maskOwnKey,
  type OwnKeyController,
} from "#/presenters/ownKeyController";

describe("maskOwnKey", () => {
  it("keeps the vendor tag and the last four characters", () => {
    expect(maskOwnKey("sk-ant-api03-abcdefghij1234")).toBe("sk-ant-…1234");
  });

  it("shows no more than the last two characters of a short key", () => {
    const masked = maskOwnKey("sk-ant-ab12");

    expect(masked).toBe("…12");
  });

  it("shows nothing of a very short key", () => {
    expect(maskOwnKey("abc")).toBe("…");
  });

  it("never contains the middle of a long key", () => {
    expect(maskOwnKey(KEY)).not.toContain("abcdefghij");
  });

  it("an OpenRouter key keeps its provider prefix", () => {
    expect(maskOwnKey("sk-or-v1-abcdefghijklmnop9876")).toBe("sk-or-…9876");
  });

  it("a plain sk- key keeps only sk-", () => {
    expect(maskOwnKey("sk-abcdefghijklmnopqrstuvwxyz-Q1w2")).toBe("sk-…Q1w2");
  });

  it.each([
    "correct-horse-battery-staple",
    "my-very-secret-passphrase-1234",
    "AKIA-not-a-provider-key-0000",
  ])("an unknown shape (%s) shows only an ellipsis and the suffix", (key) => {
    expect(maskOwnKey(key)).toBe(`…${key.slice(-4)}`);
  });

  it.each([
    "sk-ant-api03-abcdefghij1234",
    "sk-or-v1-abcdefghijklmnop9876",
    "sk-abcdefghijklmnopqrstuvwxyz-Q1w2",
    "correct-horse-battery-staple",
    "x".repeat(40),
  ])("%s exposes at most a prefix of 7 and a suffix of 4", (key) => {
    expect(maskOwnKey(key).length).toBeLessThanOrEqual(7 + 1 + 4);
  });
});

describe("createOwnKeyController", () => {
  it("a stored key for the signed-in owner is restored and sent", () => {
    const { controller, setOwnKey } = build(stored("ann"));

    const saved = controller.authChanged("ann");

    expect(saved).toEqual({
      provider: "anthropic",
      masked: "sk-ant-…1234",
      capUsd: 1,
      remember: true,
    });
    expect(setOwnKey).toHaveBeenCalledExactlyOnceWith({
      provider: "anthropic",
      key: KEY,
      capUsd: 1,
    });
  });

  it("the first unauthenticated reading keeps a remembered key", () => {
    const { controller, store, setOwnKey } = build(stored("ann"));

    expect(controller.authChanged(null)).toBe(null);

    expect(store.clear).not.toHaveBeenCalled();
    expect(setOwnKey).not.toHaveBeenCalled();
  });

  it("sign-out wipes the store and sends clear", () => {
    const { controller, store, setOwnKey } = build(stored("ann"));
    controller.authChanged("ann");
    setOwnKey.mockClear();

    expect(controller.authChanged(null)).toBe(null);

    expect(store.clear).toHaveBeenCalledOnce();
    expect(setOwnKey).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("a different owner wipes the key and sends nothing", () => {
    const { controller, store, setOwnKey } = build(stored("ann"));

    expect(controller.authChanged("bob")).toBe(null);

    expect(store.clear).toHaveBeenCalledOnce();
    expect(setOwnKey).not.toHaveBeenCalled();
  });

  it("a repeated reading for the same owner sends nothing", () => {
    const { controller, setOwnKey } = build(stored("ann"));
    controller.authChanged("ann");
    setOwnKey.mockClear();

    const again = controller.authChanged("ann");

    expect(again?.masked).toBe("sk-ant-…1234");
    expect(setOwnKey).not.toHaveBeenCalled();
  });

  it("a live owner switch sends clear", () => {
    const { controller, store, setOwnKey } = build(stored("ann"));
    controller.authChanged("ann");
    setOwnKey.mockClear();

    expect(controller.authChanged("bob")).toBe(null);

    expect(store.clear).toHaveBeenCalledOnce();
    expect(setOwnKey).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("signing in with nothing stored sends nothing", () => {
    const { controller, setOwnKey } = build(null);

    expect(controller.authChanged("ann")).toBe(null);
    expect(setOwnKey).not.toHaveBeenCalled();
  });

  it("save stores the key under the owner, sends it, and returns only the masked form", () => {
    const { controller, store, setOwnKey } = build(null);

    const saved = controller.save("ann", {
      provider: "anthropic",
      key: KEY,
      capUsd: 2,
      remember: false,
    });

    expect(JSON.stringify(saved)).not.toContain(KEY);
    expect(saved.masked).toBe("sk-ant-…1234");
    expect(store.write).toHaveBeenCalledExactlyOnceWith({
      owner: "ann",
      provider: "anthropic",
      key: KEY,
      capUsd: 2,
      remember: false,
    });
    expect(setOwnKey).toHaveBeenCalledExactlyOnceWith({
      provider: "anthropic",
      key: KEY,
      capUsd: 2,
    });
  });

  it("setCap resends with the new cap and keeps the key", () => {
    const { controller, store, setOwnKey } = build(stored("ann"));
    controller.authChanged("ann");
    setOwnKey.mockClear();

    const saved = controller.setCap(null);

    expect(saved?.capUsd).toBe(null);
    expect(store.write).toHaveBeenCalledExactlyOnceWith({
      ...stored("ann"),
      capUsd: null,
    });
    expect(setOwnKey).toHaveBeenCalledExactlyOnceWith({
      provider: "anthropic",
      key: KEY,
      capUsd: null,
    });
  });

  it("setCap with no key held does nothing", () => {
    const { controller, store, setOwnKey } = build(null);

    expect(controller.setCap(5)).toBe(null);
    expect(store.write).not.toHaveBeenCalled();
    expect(setOwnKey).not.toHaveBeenCalled();
  });

  it("remove clears the store and sends clear", () => {
    const { controller, store, setOwnKey } = build(stored("ann"));
    controller.authChanged("ann");
    setOwnKey.mockClear();

    controller.remove();

    expect(store.clear).toHaveBeenCalledOnce();
    expect(setOwnKey).toHaveBeenCalledExactlyOnceWith(null);
    expect(controller.setCap(3)).toBe(null);
  });

  it("works without a store: the key is held for the session", () => {
    const setOwnKey = vi.fn<(setting: JarvisOwnKeySetting | null) => void>();
    const controller = createOwnKeyController({ store: undefined, setOwnKey });
    controller.save("ann", {
      provider: "anthropic",
      key: KEY,
      capUsd: 1,
      remember: false,
    });

    expect(controller.setCap(4)?.capUsd).toBe(4);
  });

  it("works without a transport that takes a key", () => {
    const { store } = build(stored("ann"));
    const controller = createOwnKeyController({ store, setOwnKey: undefined });

    expect(controller.authChanged("ann")?.masked).toBe("sk-ant-…1234");
  });
});

function stored(owner: string): StoredOwnKey {
  return {
    owner,
    provider: "anthropic",
    key: KEY,
    capUsd: 1,
    remember: true,
  };
}

interface Built {
  readonly controller: OwnKeyController;
  readonly store: Mocked<OwnKeyStore>;
  readonly setOwnKey: Mock<(setting: JarvisOwnKeySetting | null) => void>;
}

function build(initial: StoredOwnKey | null): Built {
  let held = initial;
  const store = {
    read: vi.fn((): StoredOwnKey | null => {
      return held;
    }),
    write: vi.fn((next: StoredOwnKey): void => {
      held = next;
    }),
    clear: vi.fn((): void => {
      held = null;
    }),
  } satisfies OwnKeyStore;
  const setOwnKey = vi.fn<(setting: JarvisOwnKeySetting | null) => void>();

  return {
    controller: createOwnKeyController({ store, setOwnKey }),
    store,
    setOwnKey,
  };
}

const KEY = "sk-ant-api03-abcdefghij1234";
