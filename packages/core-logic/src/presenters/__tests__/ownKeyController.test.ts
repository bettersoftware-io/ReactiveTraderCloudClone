import { describe, expect, it, type Mock, type Mocked, vi } from "vitest";

import type {
  AuthViewState,
  JarvisPort,
  OwnKeyInput,
  OwnKeyStore,
  SavedOwnKey,
  StoredOwnKey,
} from "@rtc/core-api";
import {
  type JarvisOwnKeySetting,
  ROSTER,
  type RosterEntry,
} from "@rtc/domain";

import {
  createOwnKeyController,
  createOwnKeyFold,
  maskOwnKey,
  type OwnKeyController,
  ownKeyOwner,
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

  it("a different owner wipes the key and sends clear", () => {
    const { controller, store, setOwnKey } = build(stored("ann"));

    expect(controller.authChanged("bob")).toBe(null);

    expect(store.clear).toHaveBeenCalledOnce();
    expect(setOwnKey).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("an owner with nothing to restore sends clear: the transport outlives a composition", () => {
    const { controller, store, setOwnKey } = build(null);

    expect(controller.authChanged("ann")).toBe(null);

    expect(store.clear).not.toHaveBeenCalled();
    expect(setOwnKey).toHaveBeenCalledExactlyOnceWith(null);
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

describe("ownKeyOwner", () => {
  it("is the email while authenticated, a lock included", () => {
    expect(ownKeyOwner({ status: "authenticated", user: DEMO.user })).toBe(
      DEMO.user.email,
    );
  });

  it.each(["unauthenticated", "authenticating"] as const)(
    "is null while %s, even with a user on the state",
    (status) => {
      expect(ownKeyOwner({ status, user: DEMO.user })).toBe(null);
    },
  );
});

describe("createOwnKeyFold", () => {
  it("without setOwnKey is inert, even with a store holding a key", () => {
    const { store } = build(stored(DEMO.user.email));
    const publish = vi.fn<(saved: SavedOwnKey | null) => void>();
    const fold = createOwnKeyFold({ jarvis: {}, store, publish });

    fold.readAuth(SIGNED_IN);
    fold.save(INPUT);
    fold.setCap(3);
    fold.remove();

    expect(publish).not.toHaveBeenCalled();
    expect(store.read).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });

  it("calls the port as a method, so a class adapter keeps its this", () => {
    const jarvis = new ClassPort();
    const fold = createOwnKeyFold({
      jarvis,
      store: undefined,
      publish: vi.fn(),
    });

    fold.readAuth(SIGNED_IN);
    fold.save(INPUT);

    expect(jarvis.received.at(-1)?.key).toBe(KEY);
  });

  it("publishes a change once, and neither null over null nor a repeated reading", () => {
    const publish = vi.fn<(saved: SavedOwnKey | null) => void>();
    const setOwnKey = vi.fn<(setting: JarvisOwnKeySetting | null) => void>();
    const fold = createOwnKeyFold({
      jarvis: { setOwnKey },
      store: undefined,
      publish,
    });

    fold.readAuth(SIGNED_OUT);
    fold.readAuth(SIGNED_IN);
    expect(publish).not.toHaveBeenCalled();
    setOwnKey.mockClear();

    fold.save(INPUT);
    fold.readAuth(SIGNED_IN);
    expect(publish).toHaveBeenCalledOnce();
    expect(setOwnKey).toHaveBeenCalledOnce();

    fold.readAuth(SIGNED_OUT);
    fold.readAuth(SIGNED_OUT);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith(null);
  });

  it("does nothing on an intent once stopped, and wipes nothing", () => {
    const { store, setOwnKey } = build(stored(DEMO.user.email));
    const publish = vi.fn<(saved: SavedOwnKey | null) => void>();
    const fold = createOwnKeyFold({ jarvis: { setOwnKey }, store, publish });
    fold.readAuth(SIGNED_IN);
    setOwnKey.mockClear();
    publish.mockClear();

    fold.stop();
    fold.save(INPUT);
    fold.setCap(3);
    fold.remove();

    expect(store.write).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(setOwnKey).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("an inert fold can be stopped", () => {
    const fold = createOwnKeyFold({
      jarvis: {},
      store: undefined,
      publish: vi.fn(),
    });

    expect(() => {
      fold.stop();
    }).not.toThrow();
  });

  it("does nothing on an intent while nobody is signed in", () => {
    const { store, setOwnKey } = build(stored(DEMO.user.email));
    const publish = vi.fn<(saved: SavedOwnKey | null) => void>();
    const fold = createOwnKeyFold({
      jarvis: { setOwnKey },
      store,
      publish,
    });

    fold.readAuth(SIGNED_OUT);
    fold.save(INPUT);
    fold.setCap(3);
    fold.remove();

    expect(store.write).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(setOwnKey).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

class ClassPort implements Pick<JarvisPort, "setOwnKey"> {
  readonly received: (JarvisOwnKeySetting | null)[] = [];

  setOwnKey(setting: JarvisOwnKeySetting | null): void {
    this.received.push(setting);
  }
}

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
const DEMO: RosterEntry = ROSTER[0];
const INPUT: OwnKeyInput = {
  provider: "anthropic",
  key: KEY,
  capUsd: 1,
  remember: false,
};

const SIGNED_IN: Pick<AuthViewState, "status" | "user"> = {
  status: "authenticated",
  user: DEMO.user,
};

const SIGNED_OUT: Pick<AuthViewState, "status" | "user"> = {
  status: "unauthenticated",
  user: null,
};
