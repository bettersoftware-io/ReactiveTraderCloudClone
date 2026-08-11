import { afterEach, describe, expect, jest, test } from "@jest/globals";
import * as ExpoCrypto from "expo-crypto";

import { installWebCryptoPolyfill } from "#/app/installWebCryptoPolyfill";

/** The gap this file guards cannot be observed by the runner it runs in.
 *
 * `jest-expo` executes on Node, and Node ≥ 19 exposes a complete
 * `globalThis.crypto` including `randomUUID`. Hermes — the engine the shipped
 * app actually runs on — exposes **no `crypto` global at all**, so
 * `crypto.randomUUID()` throws `Property 'crypto' doesn't exist` on device
 * while every test here passes.
 *
 * That asymmetry is why the bug reached a device: the test runtime is strictly
 * *more* capable than the production runtime, so tests are optimistic by
 * construction about anything the platform is expected to supply. These tests
 * simulate Hermes by deleting the global rather than pretending jest can see
 * the real thing — and the real proof remains a device run.
 *
 * `expo-crypto` is a native module, so jest-expo auto-mocks it to `undefined`.
 * The mock below returns per-call sentinels, which keeps the subject of these
 * tests where it belongs: **that the polyfill hands `expo-crypto`'s output
 * back unchanged, per call, and installs only when the global is missing**.
 * Whether Expo's native CSPRNG is itself sound is Expo's test, not ours — so
 * nothing here asserts a UUID *shape*, which would only be testing the mock. */

describe("installWebCryptoPolyfill", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, "crypto", original);
    }

    jest.clearAllMocks();
  });

  test("supplies randomUUID on a Hermes-shaped runtime that has no crypto global", () => {
    removeCryptoGlobal();
    // Guards the guard: if this were still defined, every assertion below would
    // pass against Node's own crypto and prove nothing about the polyfill.
    expect(cryptoCarrier().crypto).toBeUndefined();

    installWebCryptoPolyfill();
    const id = globalThis.crypto.randomUUID();

    expect(ExpoCrypto.randomUUID).toHaveBeenCalledTimes(1);
    // Compared against what the mock actually returned, not a literal: the
    // mock's counter outlives `clearAllMocks`, so a hard-coded sentinel would
    // depend on which tests ran first.
    expect(id).toBe(jest.mocked(ExpoCrypto.randomUUID).mock.results[0]?.value);
  });

  test("passes each call through rather than caching one id", () => {
    removeCryptoGlobal();
    installWebCryptoPolyfill();

    const ids = [
      globalThis.crypto.randomUUID(),
      globalThis.crypto.randomUUID(),
      globalThis.crypto.randomUUID(),
    ];

    expect(ExpoCrypto.randomUUID).toHaveBeenCalledTimes(3);
    expect(new Set(ids).size).toBe(3);
  });

  test("supplies getRandomValues, the primitive the unguessable ids rest on", () => {
    removeCryptoGlobal();
    installWebCryptoPolyfill();

    const filled = globalThis.crypto.getRandomValues(new Uint8Array(4));

    expect(ExpoCrypto.getRandomValues).toHaveBeenCalledTimes(1);
    expect(Array.from(filled)).toEqual([7, 7, 7, 7]);
  });

  test("leaves a runtime that already has crypto untouched", () => {
    // Browsers and Node supply a real CSPRNG. Replacing a platform primitive
    // with a shim would be a downgrade, not a fix.
    const existing = globalThis.crypto;

    installWebCryptoPolyfill();

    expect(globalThis.crypto).toBe(existing);
    expect(ExpoCrypto.randomUUID).not.toHaveBeenCalled();
  });

  test("is safe to run twice — a double import must not reinstall", () => {
    removeCryptoGlobal();
    installWebCryptoPolyfill();
    const first = globalThis.crypto;

    installWebCryptoPolyfill();

    expect(globalThis.crypto).toBe(first);
  });
});

jest.mock("expo-crypto", () => {
  let calls = 0;

  return {
    getRandomValues: jest.fn((array: Uint8Array) => {
      array.fill(7);
      return array;
    }),
    randomUUID: jest.fn(() => {
      calls += 1;
      return `expo-uuid-${calls}`;
    }),
  };
});

interface CryptoCarrier {
  crypto?: Crypto;
}

function cryptoCarrier(): CryptoCarrier {
  return globalThis as CryptoCarrier;
}

function removeCryptoGlobal(): void {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });
}
