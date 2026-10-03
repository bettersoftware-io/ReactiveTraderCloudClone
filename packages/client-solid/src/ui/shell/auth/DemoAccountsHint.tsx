import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import { type DemoAccount, sharedDemoPassword } from "@rtc/domain";

import styles from "./DemoAccountsHint.module.css";
import waitStyles from "./wait/authWait.module.css";

/**
 * The demo-accounts hint under the sign-in form (hardening spec §7 D9): one
 * click-to-fill row per account, plus the password printed once when every
 * account shares it. Renders nothing when the host lists no accounts — a
 * plain live build, where every credential belongs to the server. Dumb
 * component: picking a row only reports the account through `onPick`; what
 * that does to the form is the login screen's business.
 */
export function DemoAccountsHint(props: DemoAccountsHintProps): JSX.Element {
  const password = createMemo((): string | null => {
    return sharedDemoPassword(props.accounts);
  });

  function pickFor(account: DemoAccount) {
    return (): void => {
      props.onPick(account);
    };
  }

  return (
    <Show when={props.accounts.length > 0}>
      <div
        data-testid="login-demo-accounts"
        class={props.busy ? `${styles.hint} ${waitStyles.recede}` : styles.hint}
      >
        <div class={styles.heading}>DEMO ACCOUNTS · SIMULATED DATA</div>

        <ul class={styles.list} aria-label="Demo accounts">
          <For each={props.accounts}>
            {(account: DemoAccount) => {
              return (
                <li>
                  <button
                    type="button"
                    data-testid="login-demo-account"
                    data-username={account.username}
                    aria-label={`Fill the sign-in form as ${account.username}, ${account.role}`}
                    class={styles.account}
                    disabled={props.busy}
                    onClick={pickFor(account)}
                  >
                    <span class={styles.username}>{account.username}</span>
                    <span class={styles.role}>{account.role}</span>
                    <span class={styles.arrow} aria-hidden="true">
                      ▸
                    </span>
                  </button>
                </li>
              );
            }}
          </For>
        </ul>

        <div class={styles.foot}>
          <Show when={password() !== null}>
            <span>
              password ·{" "}
              <span data-testid="login-demo-password" class={styles.password}>
                {password()}
              </span>
            </span>
          </Show>
          <span>click to fill</span>
        </div>
      </div>
    </Show>
  );
}

interface DemoAccountsHintProps {
  accounts: readonly DemoAccount[];
  /** True while a sign-in is in flight: the rows are disabled and the block
   * recedes with the fields. */
  busy: boolean;
  /** Slot: an account row was picked. */
  onPick: (account: DemoAccount) => void;
}
