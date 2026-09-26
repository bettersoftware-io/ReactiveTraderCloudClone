import type {
  AppPorts,
  LoginWaitCycle,
  SessionStore,
  Stream,
} from "@rtc/core-api";
import {
  type AuthPort,
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  DEFAULT_LOGIN_WAIT_VARIANT,
  LOGIN_WAIT_DELAY_MS,
  type LoginWaitStyle,
  type LoginWaitVariant,
} from "@rtc/domain";

/** What an `auth` presenter is built from, in every core. */
export interface AuthDeps {
  readonly auth: AuthPort;
  readonly store: SessionStore;
  readonly cycle: LoginWaitCycle;
}

/** The two stream operations the auth wiring needs, supplied by each core
 * from the place it keeps its stream code (the RxJS core's adapters, an
 * alternative core's `bridge/`), so this rule stays rxjs-free. */
export interface AuthDepsPrimitives {
  /** A replay-current preference stream's value now, or `fallback`. */
  readNow<T>(source: Stream<T>, fallback: T): T;
  /** `auth`, with each outcome held back by `delayMs()` (read per attempt). */
  delayAuth(auth: AuthPort, delayMs: () => number): AuthPort;
}

/** The composition-level auth wiring, shared by all three cores so the
 * siblings import it rather than copy it (pluggable-core slice 6).
 *
 * The AuthPort is wrapped so the "Login wait delay" preference holds the
 * outcome back; at "off" the wrapper passes through synchronously, so the
 * default path is byte-for-byte the unwrapped behaviour.
 *
 * The login-wait variant cycle is read and advanced through the preferences
 * seam — the same pattern as boot's variant. The "Login wait style" pin is
 * resolved HERE rather than inside the presenter: when a concrete style is
 * chosen, `current` returns it and `advance` is a no-op, so the presenter
 * keeps asking one question ("which treatment for this attempt?") and this
 * decides whether the answer comes from a cycle or from a pin. That also
 * leaves the cycle pointer untouched while pinned, so switching back to
 * "auto" resumes where the user left off instead of somewhere they never
 * chose. */
export function createAuthDeps(
  ports: AppPorts,
  primitives: AuthDepsPrimitives,
): AuthDeps {
  const { preferences } = ports;

  function pinnedStyle(): LoginWaitStyle {
    return primitives.readNow(
      preferences.loginWaitStyle$(),
      DEFAULT_LOGIN_WAIT_STYLE,
    );
  }

  return {
    auth: primitives.delayAuth(ports.auth, () => {
      return LOGIN_WAIT_DELAY_MS[
        primitives.readNow(
          preferences.loginWaitDelay$(),
          DEFAULT_LOGIN_WAIT_DELAY,
        )
      ];
    }),
    store: ports.sessionStore,
    cycle: {
      current: (): LoginWaitVariant => {
        const style = pinnedStyle();

        if (style !== "auto") {
          return style;
        }

        return primitives.readNow(
          preferences.loginWaitVariant$(),
          DEFAULT_LOGIN_WAIT_VARIANT,
        );
      },
      advance: (next: LoginWaitVariant): void => {
        if (pinnedStyle() !== "auto") {
          return;
        }

        preferences.setLoginWaitVariant(next);
      },
    },
  };
}
