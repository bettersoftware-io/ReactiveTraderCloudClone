import type { Accessor, JSX } from "solid-js";
import { createSignal, Show } from "solid-js";

import type { SessionUser } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { HudLogo } from "../logo/HudLogo";
import { BiometricChannel } from "./BiometricChannel";
import { BiometricDots } from "./BiometricDots";

import styles from "./LockScreen.module.css";

/**
 * Full-screen session-lock overlay (prototype Reactive Trader.dc.html:76-91).
 * Renders nothing unless the session is locked; while locked it shows the
 * operator identity and a password-gated AUTHENTICATE control that
 * re-authenticates (unlock) against the real credentials seam. Dumb
 * component: all state arrives through the `useAuth` hook seam; the typed
 * password lives in local component state only and is never logged.
 */
export function LockScreen(): JSX.Element {
  const { useAuth } = useViewModel();
  const { state, unlock } = useAuth();
  const [password, setPassword] = createSignal("");

  return (
    <Show when={state().locked && state().user}>
      {(user: Accessor<SessionUser>) => {
        return (
          <div data-testid="lock-screen" class={styles.overlay}>
            <div class={styles.grid} aria-hidden="true" />
            <div class={styles.panel}>
              {/* Hex emblem (prototype line 80) — the shared animated HUD logo. */}
              <div class={styles.badge} aria-hidden="true">
                <HudLogo />
              </div>

              <div data-testid="lock-title" class={styles.title}>
                SESSION LOCKED
              </div>
              <div class={styles.subtitle}>
                REACTIVE TRADER OS · {user().id}
              </div>

              {/* Operator avatar — hex chip with initials (prototype line 83). */}
              <div class={styles.avatar}>
                <svg
                  viewBox="0 0 28 28"
                  class={styles.avatarHex}
                  aria-hidden="true"
                >
                  <polygon
                    points="14,1.5 25,7.75 25,20.25 14,26.5 3,20.25 3,7.75"
                    class={styles.avatarChip}
                    stroke="var(--accent-primary)"
                    stroke-width="1.3"
                  />
                </svg>
                <span class={styles.initials}>{user().initials}</span>
              </div>

              <div data-testid="lock-user-name" class={styles.name}>
                {user().name}
              </div>
              <div class={styles.role}>{user().role}</div>

              {/* Prototype order: the biometric dots sit between the role line and
                  the AUTHENTICATE button; the channel line stays below the button. */}
              <BiometricDots />

              <form
                class={styles.form}
                onSubmit={(event: SubmitEvent) => {
                  event.preventDefault();
                  unlock(password());
                }}
              >
                <label class={styles.field}>
                  <span class={styles.label}>Password</span>
                  <input
                    data-testid="lock-password"
                    class={styles.input}
                    type="password"
                    autocomplete="current-password"
                    value={password()}
                    onInput={(event: InputChangeEvent) => {
                      setPassword(event.currentTarget.value);
                    }}
                  />
                </label>

                <Show when={state().error !== null}>
                  <div data-testid="lock-error" class={styles.error}>
                    {state().error}
                  </div>
                </Show>

                <button
                  type="submit"
                  data-testid="lock-authenticate"
                  class={styles.authenticate}
                >
                  AUTHENTICATE ▸
                </button>
              </form>

              <BiometricChannel />
            </div>
          </div>
        );
      }}
    </Show>
  );
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
