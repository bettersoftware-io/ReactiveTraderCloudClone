import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { HudLogo } from "../logo/HudLogo";
import { BiometricChannel } from "./BiometricChannel";
import { BiometricDots } from "./BiometricDots";

import styles from "./LockScreen.module.css";

/**
 * Full-screen session-lock overlay (prototype Reactive Trader.dc.html:76-91).
 * Renders nothing unless the session is locked; while locked it shows the
 * operator identity and an AUTHENTICATE control that re-authenticates (unlock).
 * Dumb component: all state arrives through the `useSession` hook seam.
 */
export function LockScreen(): JSX.Element {
  const { useSession } = useViewModel();
  const { state, unlock } = useSession();

  return (
    <Show when={state().locked}>
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
            REACTIVE TRADER OS · {state().user.id}
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
            <span class={styles.initials}>{state().user.initials}</span>
          </div>

          <div data-testid="lock-user-name" class={styles.name}>
            {state().user.name}
          </div>
          <div class={styles.role}>{state().user.role}</div>

          {/* Prototype order: the biometric dots sit between the role line and
              the AUTHENTICATE button; the channel line stays below the button. */}
          <BiometricDots />

          <button
            type="button"
            data-testid="lock-authenticate"
            class={styles.authenticate}
            onClick={unlock}
          >
            AUTHENTICATE ▸
          </button>

          <BiometricChannel />
        </div>
      </div>
    </Show>
  );
}
