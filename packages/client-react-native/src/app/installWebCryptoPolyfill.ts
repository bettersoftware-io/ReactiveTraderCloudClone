import * as ExpoCrypto from "expo-crypto";

/** Supplies the Web Crypto globals that Hermes omits, so shared code can keep
 * calling the platform API it is entitled to assume.
 *
 * **Why this exists.** `@rtc/client-core` and `@rtc/shared` are framework-free
 * and run on three runtimes — browser, Node (server + tests) and Hermes. Two of
 * the three supply `globalThis.crypto`; Hermes supplies none, so
 * `crypto.randomUUID()` throws `Property 'crypto' doesn't exist` the first time
 * a Jarvis turn starts on device (`WsJarvisAdapter.ask`), and again whenever the
 * scripted brain stages a trade confirmation (`ScriptedJarvisEngine`).
 *
 * The gap is in the runtime, not in that code, so the repair belongs here: the
 * shared packages may not import an Expo module without breaking the
 * inward-only dependency rule, and rewriting their call sites to dodge `crypto`
 * would push a platform concern into business logic.
 *
 * **Why not a `Math.random()` id instead.** It would need no dependency and no
 * native rebuild, and it would be wrong. `ScriptedJarvisEngine`'s confirmation
 * ids are documented as *unguessable, not merely unique* — the server keeps one
 * process-wide `pendingConfirmations` map across every connected socket, so a
 * predictable id would let one authenticated client approve another's staged
 * trade. `expo-crypto` is backed by the platform CSPRNG, so that property
 * survives on device instead of being quietly downgraded to satisfy Hermes.
 *
 * **This cannot be caught by the test suite.** `jest-expo` runs on Node, which
 * has a complete `crypto` global, so every test passes while the device throws.
 * `installWebCryptoPolyfill.test.tsx` simulates Hermes by deleting the global;
 * the real proof is a device run. */
export function installWebCryptoPolyfill(): void {
  const target: CryptoCarrier = globalThis;

  // Browsers and Node already have a real CSPRNG. Replacing a platform
  // primitive with a shim would be a downgrade, and running twice (a double
  // import, or a Fast Refresh re-evaluation) must be a no-op.
  if (target.crypto?.randomUUID !== undefined) {
    return;
  }

  // Two narrow, deliberate casts. `expo-crypto` accepts only the integer typed
  // arrays where the DOM lib accepts any non-`ArrayBuffer` `BufferSource`, and
  // returns a plain `string` where the DOM lib promises the templated
  // `${string}-${string}-…` UUID form. Both gaps are in the *type surface*, not
  // the behaviour — every call site in this repo passes a `Uint8Array` and
  // treats the id as an opaque string — so the shim is honest at runtime and
  // the casts are confined to this boundary rather than leaking outward.
  const shim: Pick<Crypto, "getRandomValues" | "randomUUID"> = {
    getRandomValues: ExpoCrypto.getRandomValues as Crypto["getRandomValues"],
    randomUUID: ExpoCrypto.randomUUID as Crypto["randomUUID"],
  };

  target.crypto = { ...target.crypto, ...shim } as Crypto;
}

/** `globalThis` typed for the one property this module owns. Hermes leaves it
 * absent, which the ambient `Crypto` type does not model. */
interface CryptoCarrier {
  crypto?: Crypto;
}
