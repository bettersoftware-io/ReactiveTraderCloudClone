import { type Observable, Subject } from "rxjs";

import type { JarvisOwnKeyView, JarvisProvider } from "@rtc/domain";
import type { JarvisKeyPayload } from "@rtc/shared";

import type { OwnKeyCheckLimiter } from "./OwnKeyCheckLimiter.js";
import type { VerifyOwnKey } from "./verifyOwnKey.js";

export interface ConnectionOwnKeyDeps {
  readonly verify: VerifyOwnKey;
  readonly limiter: OwnKeyCheckLimiter;
  /** Who the limiter charges: the caller, not the connection. */
  readonly identity: string;
}

/**
 * One connection's own model key, checked with its provider and held in
 * memory only. The key lives in a `#private` field, so serialising or
 * inspecting this object cannot reach it; it leaves only through `use`.
 */
export class ConnectionOwnKey {
  readonly #deps: ConnectionOwnKeyDeps;

  readonly #changes = new Subject<void>();

  #provider: JarvisProvider | null = null;

  #key: string | null = null;

  #capUsd: number | null = null;

  #status: JarvisOwnKeyView["status"] = "checking";

  #generation = 0;

  #controller: AbortController | null = null;

  #inFlight: Promise<void> = Promise.resolve();

  #disposed = false;

  constructor(deps: ConnectionOwnKeyDeps) {
    this.#deps = deps;
  }

  get changes$(): Observable<void> {
    return this.#changes.asObservable();
  }

  apply(payload: JarvisKeyPayload): void {
    if (this.#disposed) {
      return;
    }

    if (payload.action === "clear") {
      this.#drop();
      this.#changes.next();

      return;
    }

    if (this.#key === payload.key && this.#provider === payload.provider) {
      this.#capUsd = payload.capUsd;
      this.#changes.next();

      return;
    }

    this.#abortCheck();
    this.#provider = payload.provider;
    this.#capUsd = payload.capUsd;

    if (!this.#deps.limiter.allow(this.#deps.identity)) {
      this.#key = null;
      this.#status = "limited";
      this.#changes.next();

      return;
    }

    this.#key = payload.key;
    this.#status = "checking";
    this.#changes.next();
    this.#startCheck(payload.provider, payload.key);
  }

  view(): JarvisOwnKeyView | null {
    if (this.#provider === null) {
      return null;
    }

    return {
      provider: this.#provider,
      status: this.#status,
      capUsd: this.#capUsd,
    };
  }

  /** Resolves once no check is in flight; a turn waits on this. */
  settled(): Promise<void> {
    return this.#inFlight;
  }

  /** Only the session factory calls this. Null unless the key is accepted. */
  use<T>(build: (provider: JarvisProvider, key: string) => T): T | null {
    if (
      this.#status !== "accepted" ||
      this.#provider === null ||
      this.#key === null
    ) {
      return null;
    }

    return build(this.#provider, this.#key);
  }

  /** The provider turned the key down mid-turn. */
  markRefused(): void {
    if (this.#disposed || this.#key === null) {
      return;
    }

    this.#status = "refused";
    this.#changes.next();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#drop();
    this.#changes.complete();
  }

  #drop(): void {
    this.#abortCheck();
    this.#provider = null;
    this.#key = null;
    this.#capUsd = null;
    this.#status = "checking";
  }

  #abortCheck(): void {
    this.#generation++;
    this.#controller?.abort();
    this.#controller = null;
  }

  #startCheck(provider: JarvisProvider, key: string): void {
    const generation = this.#generation;
    const controller = new AbortController();

    this.#controller = controller;

    const previous = this.#inFlight;
    const check = this.#deps
      .verify(provider, key, controller.signal)
      .catch((): "unreachable" => {
        return "unreachable";
      })
      .then((verdict) => {
        if (generation !== this.#generation || this.#disposed) {
          return;
        }

        this.#controller = null;
        this.#status = verdict;
        this.#changes.next();
      });

    // `settled` covers every check still open, not just the latest.
    this.#inFlight = Promise.all([previous, check]).then(() => {
      return undefined;
    });
  }
}
