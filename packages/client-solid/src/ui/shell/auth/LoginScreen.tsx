import type { JSX } from "solid-js";
import { createSignal, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { HudLogo } from "../logo/HudLogo";

import styles from "./LoginScreen.module.css";

/**
 * Full-screen sign-in form (prototype-styled to match LockScreen). Renders
 * unconditionally while mounted — AuthGate mounts it only for the
 * unauthenticated branch of the auth lifecycle. Dumb component: all state
 * arrives through the `useAuth` seam; the typed credentials live in local
 * signals only and are never logged.
 */
export function LoginScreen(): JSX.Element {
  const { useAuth } = useViewModel();
  const { state, login } = useAuth();

  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");

  return (
    <div data-testid="login-screen" class={styles.overlay}>
      <div class={styles.grid} aria-hidden="true" />
      <div class={styles.panel}>
        <div class={styles.badge} aria-hidden="true">
          <HudLogo />
        </div>

        <div data-testid="login-title" class={styles.title}>
          REACTIVE TRADER OS · SIGN IN
        </div>

        <form
          class={styles.form}
          onSubmit={(event: SubmitEvent) => {
            event.preventDefault();
            login(username(), password());
          }}
        >
          <label class={styles.field}>
            <span class={styles.label}>Username</span>
            <input
              data-testid="login-username"
              class={styles.input}
              type="text"
              autocomplete="username"
              value={username()}
              onInput={(event: InputChangeEvent) => {
                setUsername(event.currentTarget.value);
              }}
            />
          </label>

          <label class={styles.field}>
            <span class={styles.label}>Password</span>
            <input
              data-testid="login-password"
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
            <div data-testid="login-error" class={styles.error}>
              {state().error}
            </div>
          </Show>

          <button
            type="submit"
            data-testid="login-submit"
            class={styles.submit}
            disabled={state().status === "authenticating"}
          >
            AUTHENTICATE ▸
          </button>
        </form>
      </div>
    </div>
  );
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
