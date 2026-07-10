import type { ReactElement } from "react";
import { useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./HeaderChrome.module.css";

/**
 * Account menu — the account section is REAL chrome wired to the session seam
 * (`useSession`): it shows the signed-in operator's identity (initials, name,
 * email, trader id, desk, clearance) from the SessionPresenter. The trigger +
 * dropdown-head avatar is the PROTO hexagon chip (AccountMenu.tsx:26-36,42-56)
 * — an inline SVG hexagon with the operator's initials laid over it, sized
 * 30×30 for the trigger and 38×38 in the panel head. The panel matches the
 * prototype dropdown: identity head (name + email), a TRADER ID / DESK /
 * CLEARANCE details block, a ⚙ Preferences action row (opens the shell's
 * Preferences modal via `onOpenPrefs`), the prototype's ⟳ Reboot HUD row
 * (re-raises the boot splash through the `useBootGate` seam — splash replay
 * only, no app-state reset), and the red sign-out-styled ⏻ LOCK SESSION row
 * (locks the session through the seam — the app's equivalent of the
 * prototype's Sign Out). While open, an invisible fixed backdrop (prototype
 * Header.tsx:65-73) closes the menu on any outside click. Opening/closing the
 * panel is local view state.
 */
export function AccountMenu({ onOpenPrefs }: AccountMenuProps): ReactElement {
  const { useSession, useBootGate } = useViewModel();
  const { state, lock } = useSession();
  const { reboot } = useBootGate();
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
        <>
          {/* Invisible click-away backdrop (prototype Header.tsx:65-73),
              z-15 under the z-60 dropdown. */}
          <button
            type="button"
            data-testid="menu-backdrop"
            aria-label="Close menu"
            className={styles.menuBackdrop}
            onClick={() => {
              setOpen(false);
            }}
          />
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
                <span
                  className={styles.accountEmail}
                  data-testid="account-email"
                >
                  {user.email}
                </span>
              </span>
            </div>
            <div className={styles.accountDetails}>
              <div className={styles.accountMeta} data-testid="account-meta-id">
                <span className={styles.accountMetaKey}>TRADER ID</span>
                <span className={styles.accountMetaVal}>{user.id}</span>
              </div>
              <div
                className={styles.accountMeta}
                data-testid="account-meta-desk"
              >
                <span className={styles.accountMetaKey}>DESK</span>
                <span className={styles.accountMetaVal}>{user.desk}</span>
              </div>
              <div
                className={styles.accountMeta}
                data-testid="account-meta-clearance"
              >
                <span className={styles.accountMetaKey}>CLEARANCE</span>
                <span className={styles.accountClearance}>
                  {user.clearance}
                </span>
              </div>
            </div>
            <button
              type="button"
              data-testid="account-prefs"
              className={styles.actionRow}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenPrefs();
              }}
            >
              ⚙ Preferences
            </button>
            {/* Real chrome: replays the boot splash through the `useBootGate`
                seam (prototype account menu → ⟳ Reboot HUD) — splash replay
                only, the app's state is untouched. */}
            <button
              type="button"
              data-testid="account-reboot"
              className={styles.actionRow}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                reboot();
              }}
            >
              ⟳ Reboot HUD
            </button>
            {/* Real chrome: locks the session through the `useSession` seam,
                raising the LockScreen overlay (prototype account menu → lock),
                styled as the prototype's red Sign Out row. */}
            <button
              type="button"
              data-testid="account-lock"
              className={styles.signOut}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                lock();
              }}
            >
              ⏻ LOCK SESSION
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface AccountMenuProps {
  /** Opens the shell's Preferences modal (state lives in HeaderChrome). */
  onOpenPrefs: () => void;
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
