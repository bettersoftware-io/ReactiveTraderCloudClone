/**
 * The rules for a person's own model key, free of any stream library: what is
 * stored, when it is restored, sent or wiped, and the masked form a presenter
 * may show. Each core's `jarvisOwnKey` member is a shell over it (it folds
 * `auth.state$` into `authChanged`). The raw key passes through `save` and the
 * `setOwnKey` the transport gave us, and nowhere else.
 */
import type {
  AuthViewState,
  JarvisOwnKeyPresenter,
  JarvisPort,
  OwnKeyInput,
  OwnKeyStore,
  SavedOwnKey,
  StoredOwnKey,
} from "@rtc/core-api";
import type { JarvisOwnKeySetting } from "@rtc/domain";

// Known provider prefixes, longest first. Anything else is not assumed to
// have a public prefix: a mistyped paste must not be shown back to the person.
const KNOWN_PREFIXES = ["sk-ant-", "sk-or-", "sk-"] as const;
const LONG_KEY_CHARS = 16;

function lastChars(key: string, count: number): string {
  return count === 0 ? "" : key.slice(key.length - count);
}

/** The only form of a key a state value may carry: the vendor tag and the
 * last four characters of a long key (`sk-ant-…1234`); a short key shows no
 * more than its last two characters, and a very short one none. */
export function maskOwnKey(key: string): string {
  if (key.length >= LONG_KEY_CHARS) {
    const tag = KNOWN_PREFIXES.find((prefix) => {
      return key.startsWith(prefix);
    });
    return `${tag ?? ""}…${lastChars(key, 4)}`;
  }

  return `…${lastChars(key, Math.min(2, Math.floor(key.length / 4)))}`;
}

export interface OwnKeyController {
  /** Call on every auth reading: the signed-in username, or `null` for
   * anything else. Returns what to show, or `null` when no key is held. */
  authChanged(owner: string | null): SavedOwnKey | null;
  save(owner: string, input: OwnKeyInput): SavedOwnKey;
  /** Resends the held key with the new cap; `null` when no key is held. */
  setCap(capUsd: number | null): SavedOwnKey | null;
  remove(): void;
}

export interface OwnKeyControllerDeps {
  readonly store: OwnKeyStore | undefined;
  readonly setOwnKey:
    | ((setting: JarvisOwnKeySetting | null) => void)
    | undefined;
}

function toSaved(stored: StoredOwnKey): SavedOwnKey {
  return {
    provider: stored.provider,
    masked: maskOwnKey(stored.key),
    capUsd: stored.capUsd,
    remember: stored.remember,
  };
}

function toSetting(stored: StoredOwnKey): JarvisOwnKeySetting {
  return {
    provider: stored.provider,
    key: stored.key,
    capUsd: stored.capUsd,
  };
}

export function createOwnKeyController(
  deps: OwnKeyControllerDeps,
): OwnKeyController {
  // The key this session holds. Mirrors the store, and is all there is on a
  // platform that supplies none.
  let held: StoredOwnKey | null = null;
  // The signed-in owner last seen, or `null` before one was. The boot's first
  // unauthenticated reading precedes sign-in restoration and must not wipe a
  // remembered key; and a repeated reading of the same owner (lock, unlock)
  // must not resend a key the server already holds.
  let currentOwner: string | null = null;

  function wipe(): void {
    held = null;
    deps.store?.clear();
  }

  function hold(stored: StoredOwnKey): SavedOwnKey {
    held = stored;
    deps.store?.write(stored);
    deps.setOwnKey?.(toSetting(stored));
    return toSaved(stored);
  }

  return {
    authChanged: (owner: string | null): SavedOwnKey | null => {
      if (owner === null) {
        if (currentOwner === null) {
          return null;
        }

        currentOwner = null;
        wipe();
        deps.setOwnKey?.(null);
        return null;
      }

      if (owner === currentOwner) {
        return held === null ? null : toSaved(held);
      }

      const previousOwner = currentOwner;
      currentOwner = owner;

      if (previousOwner !== null) {
        wipe();
        deps.setOwnKey?.(null);
        return null;
      }

      const candidate = deps.store?.read() ?? held;

      if (candidate === null) {
        return null;
      }

      if (candidate.owner !== owner) {
        wipe();
        return null;
      }

      held = candidate;
      deps.setOwnKey?.(toSetting(candidate));
      return toSaved(candidate);
    },

    save: (owner: string, input: OwnKeyInput): SavedOwnKey => {
      currentOwner = owner;
      return hold({ owner, ...input });
    },

    setCap: (capUsd: number | null): SavedOwnKey | null => {
      return held === null ? null : hold({ ...held, capUsd });
    },

    remove: (): void => {
      wipe();
      deps.setOwnKey?.(null);
    },
  };
}

/** The part of an auth reading the fold looks at. */
type OwnKeyAuthReading = Pick<AuthViewState, "status" | "user">;

/** Whose key an auth reading is about: the signed-in account's email, or
 * `null` for anything but `authenticated`. */
export function ownKeyOwner(auth: OwnKeyAuthReading): string | null {
  return auth.status === "authenticated" ? (auth.user?.email ?? null) : null;
}

/** What a core's `jarvisOwnKey` member is a shell over: it hands every auth
 * reading to `readAuth` and supplies the replaying cell `publish` writes. The
 * intents are the presenter's own. */
export interface OwnKeyFold
  extends Pick<JarvisOwnKeyPresenter, "save" | "setCap" | "remove"> {
  readAuth(auth: OwnKeyAuthReading): void;
}

export interface OwnKeyFoldDeps {
  readonly jarvis: Pick<JarvisPort, "setOwnKey">;
  readonly store: OwnKeyStore | undefined;
  /** Writes what `saved$` shows. Called only when that changes. */
  readonly publish: (saved: SavedOwnKey | null) => void;
}

/** The `jarvisOwnKey` member's rules over `createOwnKeyController`. A repeated
 * reading of one owner (a lock, an unlock) reaches the controller not at all;
 * with nobody signed in the intents do nothing, because a key belongs to an
 * owner and a remembered one must survive until its owner is known; and a port
 * without `setOwnKey` has no server to give a key to (the simulator), so the
 * whole member is inert and `saved$` stays `null`. */
export function createOwnKeyFold(deps: OwnKeyFoldDeps): OwnKeyFold {
  const { jarvis, publish } = deps;

  if (jarvis.setOwnKey === undefined) {
    return INERT_OWN_KEY_FOLD;
  }

  const controller = createOwnKeyController({
    store: deps.store,
    // Through the port, so a class-based adapter keeps its own `this`.
    setOwnKey: (setting: JarvisOwnKeySetting | null): void => {
      jarvis.setOwnKey?.(setting);
    },
  });
  let owner: string | null = null;
  let shown: SavedOwnKey | null = null;

  function show(next: SavedOwnKey | null): void {
    if (next === null && shown === null) {
      return;
    }

    shown = next;
    publish(next);
  }

  return {
    readAuth: (auth: OwnKeyAuthReading): void => {
      const next = ownKeyOwner(auth);

      if (next !== owner) {
        owner = next;
        show(controller.authChanged(next));
      }
    },
    save: (input: OwnKeyInput): void => {
      if (owner !== null) {
        show(controller.save(owner, input));
      }
    },
    setCap: (capUsd: number | null): void => {
      if (owner !== null) {
        show(controller.setCap(capUsd));
      }
    },
    remove: (): void => {
      if (owner !== null) {
        controller.remove();
        show(null);
      }
    },
  };
}

function dropOwnKeyCall(): void {}

const INERT_OWN_KEY_FOLD: OwnKeyFold = {
  readAuth: dropOwnKeyCall,
  save: dropOwnKeyCall,
  setCap: dropOwnKeyCall,
  remove: dropOwnKeyCall,
};
