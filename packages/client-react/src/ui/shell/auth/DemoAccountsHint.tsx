import type { ReactElement } from "react";

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
export function DemoAccountsHint({
  accounts,
  busy,
  onPick,
}: DemoAccountsHintProps): ReactElement | null {
  if (accounts.length === 0) {
    return null;
  }

  const password = sharedDemoPassword(accounts);

  function pickFor(account: DemoAccount) {
    return (): void => {
      onPick(account);
    };
  }

  return (
    <div
      data-testid="login-demo-accounts"
      className={busy ? `${styles.hint} ${waitStyles.recede}` : styles.hint}
    >
      <div className={styles.heading}>DEMO ACCOUNTS · SIMULATED DATA</div>

      <ul className={styles.list} aria-label="Demo accounts">
        {accounts.map((account) => {
          return (
            <li key={account.username}>
              <button
                type="button"
                data-testid="login-demo-account"
                data-username={account.username}
                aria-label={`Fill the sign-in form as ${account.username}, ${account.role}`}
                className={styles.account}
                disabled={busy}
                onClick={pickFor(account)}
              >
                <span className={styles.username}>{account.username}</span>
                <span className={styles.role}>{account.role}</span>
                <span className={styles.arrow} aria-hidden="true">
                  ▸
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.foot}>
        {password !== null ? (
          <span>
            password ·{" "}
            <span data-testid="login-demo-password" className={styles.password}>
              {password}
            </span>
          </span>
        ) : null}
        <span>click to fill</span>
      </div>
    </div>
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
