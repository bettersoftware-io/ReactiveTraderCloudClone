import type { Accessor, JSX } from "solid-js";
import { createSignal, Show } from "solid-js";

import type { SessionUser } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./HeaderChrome.module.css";

/**
 * Account menu — the account section is REAL chrome wired to the auth seam
 * (`useAuth`): it shows the signed-in operator's identity (initials, name,
 * email, trader id, desk, clearance) from the AuthPresenter. The trigger +
 * dropdown-head avatar is the PROTO hexagon chip (AccountMenu.tsx:26-36,42-56)
 * — an inline SVG hexagon with the operator's initials laid over it, sized
 * 30×30 for the trigger and 38×38 in the panel head. The panel matches the
 * prototype dropdown: identity head (name + email), a TRADER ID / DESK /
 * CLEARANCE details block, a ⚙ Preferences action row (opens the shell's
 * Preferences modal via `onOpenPrefs`), the prototype's ⟳ Reboot HUD row
 * (re-raises the boot splash through the `useBootGate` seam — splash replay
 * only, no app-state reset), a neutral ⏻ LOCK SESSION action row (locks the
 * session through the seam, raising the LockScreen overlay), and the single
 * red ⏻ SIGN OUT row below it (logs the session out through the seam — the
 * app's equivalent of the prototype's Sign Out, and the panel's one
 * destructive accent). While open, an invisible
 * fixed backdrop (prototype Header.tsx:65-73) closes the menu on any
 * outside click. Opening/closing the panel is local view state. Renders
 * nothing without a signed-in user (`Show when={state().user}` guard).
 */
export function AccountMenu(props: AccountMenuProps): JSX.Element {
  const { useAuth, useBootGate } = useViewModel();
  const { state, lock, logout } = useAuth();
  const { reboot } = useBootGate();
  const [open, setOpen] = createSignal(false);

  return (
    <Show when={state().user}>
      {(user: Accessor<SessionUser>) => {
        return (
          <div class={styles.menuAnchor}>
            <button
              type="button"
              data-testid="account-toggle"
              aria-label="Account"
              aria-expanded={open()}
              class={styles.accountTrigger}
              onClick={() => {
                setOpen(!open());
              }}
            >
              <span class={styles.avatarWrap}>
                <HexAvatarSvg class={styles.avatarHex} />
                <span class={styles.avatarInitials}>{user().initials}</span>
              </span>
              <span class={styles.caret}>▾</span>
            </button>
            <Show when={open()}>
              {/* Invisible click-away backdrop (prototype Header.tsx:65-73),
                  z-15 under the z-60 dropdown. */}
              <button
                type="button"
                data-testid="menu-backdrop"
                aria-label="Close menu"
                class={styles.menuBackdrop}
                onClick={() => {
                  setOpen(false);
                }}
              />
              <div
                data-testid="account-panel"
                class={styles.dropdown}
                role="menu"
              >
                <div class={styles.accountHead}>
                  <span class={styles.avatarWrapLarge}>
                    <HexAvatarSvg class={styles.avatarHexLarge} />
                    <span class={styles.avatarInitialsLarge}>
                      {user().initials}
                    </span>
                  </span>
                  <span class={styles.accountIdentity}>
                    <span class={styles.accountName}>{user().name}</span>
                    <span
                      class={styles.accountEmail}
                      data-testid="account-email"
                    >
                      {user().email}
                    </span>
                  </span>
                </div>
                <div class={styles.accountDetails}>
                  <div class={styles.accountMeta} data-testid="account-meta-id">
                    <span class={styles.accountMetaKey}>TRADER ID</span>
                    <span class={styles.accountMetaVal}>{user().id}</span>
                  </div>
                  <div
                    class={styles.accountMeta}
                    data-testid="account-meta-desk"
                  >
                    <span class={styles.accountMetaKey}>DESK</span>
                    <span class={styles.accountMetaVal}>{user().desk}</span>
                  </div>
                  <div
                    class={styles.accountMeta}
                    data-testid="account-meta-clearance"
                  >
                    <span class={styles.accountMetaKey}>CLEARANCE</span>
                    <span class={styles.accountClearance}>
                      {user().clearance}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="account-prefs"
                  class={styles.actionRow}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    props.onOpenPrefs();
                  }}
                >
                  ⚙ Preferences
                </button>
                {/* Real chrome: replays the boot splash through the
                    `useBootGate` seam (prototype account menu → ⟳ Reboot
                    HUD) — splash replay only, the app's state is untouched. */}
                <button
                  type="button"
                  data-testid="account-reboot"
                  class={styles.actionRow}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    reboot();
                  }}
                >
                  ⟳ Reboot HUD
                </button>
                {/* Real chrome: locks the session through the `useAuth`
                    seam, raising the LockScreen overlay (prototype account
                    menu → lock). A neutral action row — Sign Out is the
                    panel's one red accent. */}
                <button
                  type="button"
                  data-testid="account-lock"
                  class={styles.actionRow}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    lock();
                  }}
                >
                  ⏻ LOCK SESSION
                </button>
                {/* Real chrome: logs the session out through the `useAuth`
                    seam (the app's equivalent of the prototype's Sign Out). */}
                <button
                  type="button"
                  data-testid="account-logout"
                  class={styles.signOut}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  ⏻ SIGN OUT
                </button>
              </div>
            </Show>
          </div>
        );
      }}
    </Show>
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
  class: string;
}

function HexAvatarSvg(props: HexAvatarSvgProps): JSX.Element {
  return (
    <svg viewBox="0 0 30 30" class={props.class} aria-hidden="true">
      <polygon
        points="15,2 27,9 27,21 15,28 3,21 3,9"
        class={styles.avatarHexFill}
        stroke="var(--accent-primary)"
        stroke-width="1.3"
      />
    </svg>
  );
}
