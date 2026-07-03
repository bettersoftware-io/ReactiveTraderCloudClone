import type { ReactElement } from "react";
import { useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./HeaderChrome.module.css";

/**
 * Account menu — the account section is REAL chrome wired to the session seam
 * (`useSession`): it shows the signed-in operator's identity (initials, name,
 * role, trader id, email, desk, clearance) from the SessionPresenter. The
 * trigger + dropdown-head avatar is the PROTO hexagon chip (Reactive
 * Trader.dc.html:201,207) — an inline SVG hexagon with the operator's
 * initials laid over it, sized 30×30 for the trigger and 38×38 in the panel
 * head. Opening/closing the panel is local view state. The language selector
 * moved out to the standalone `LanguageMenu` (decorative, no port).
 */
export function AccountMenu(): ReactElement {
  const { useSession } = useViewModel();
  const { state, lock } = useSession();
  const { user } = state;
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.menuAnchor}>
      <button
        type="button"
        data-testid="account-toggle"
        aria-label="Account"
        aria-expanded={open}
        className={styles.accountTrigger}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className={styles.avatarWrap}>
          <HexAvatarSvg className={styles.avatarHex} />
          <span className={styles.avatarInitials}>{user.initials}</span>
        </span>
        <span className={styles.caret}>▾</span>
      </button>
      {open ? (
        <div
          data-testid="account-panel"
          className={styles.dropdown}
          role="menu"
        >
          <div className={styles.accountHead}>
            <span className={styles.avatarWrapLarge}>
              <HexAvatarSvg className={styles.avatarHexLarge} />
              <span className={styles.avatarInitialsLarge}>
                {user.initials}
              </span>
            </span>
            <span className={styles.accountIdentity}>
              <span className={styles.accountName}>{user.name}</span>
              <span className={styles.accountRole}>{user.role}</span>
            </span>
          </div>
          <div className={styles.accountMeta} data-testid="account-meta-id">
            <span className={styles.accountMetaKey}>TRADER ID</span>
            <span className={styles.accountMetaVal}>{user.id}</span>
          </div>
          <div className={styles.accountMeta} data-testid="account-meta-email">
            <span className={styles.accountMetaKey}>EMAIL</span>
            <span className={styles.accountMetaVal}>{user.email}</span>
          </div>
          <div className={styles.accountMeta} data-testid="account-meta-desk">
            <span className={styles.accountMetaKey}>DESK</span>
            <span className={styles.accountMetaVal}>{user.desk}</span>
          </div>
          <div
            className={styles.accountMeta}
            data-testid="account-meta-clearance"
          >
            <span className={styles.accountMetaKey}>CLEARANCE</span>
            <span className={styles.accountMetaVal}>{user.clearance}</span>
          </div>
          {/* Real chrome: locks the session through the `useSession` seam,
              raising the LockScreen overlay (prototype account menu → lock). */}
          <button
            type="button"
            data-testid="account-lock"
            className={styles.lockButton}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              lock();
            }}
          >
            LOCK SESSION
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The PROTO hexagon avatar outline (Reactive Trader.dc.html:201,207), shared
 * by the trigger (30×30) and the panel-head (38×38) avatars — only the
 * container size + drop-shadow strength differ between them (see
 * `.avatarWrap`/`.avatarWrapLarge` in HeaderChrome.module.css). `--chip` is a
 * gradient on the 3d skins and SVG `fill` cannot take a gradient (falls back
 * to black), so the fill is a solid `color-mix` tint of the accent colour
 * instead (same fix as LockScreen's `avatarChip`), not the `--chip` token.
 */
interface HexAvatarSvgProps {
  className: string;
}

function HexAvatarSvg({ className }: HexAvatarSvgProps): ReactElement {
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden="true">
      <polygon
        points="15,2 27,9 27,21 15,28 3,21 3,9"
        className={styles.avatarHexFill}
        stroke="var(--accent-primary)"
        strokeWidth="1.3"
      />
    </svg>
  );
}
