import type { JSX } from "solid-js";
import { createMemo, createSignal, For, Show, untrack } from "solid-js";

import type { WorkspaceTab } from "@rtc/client-core";
import { PANEL_SPECS, staticPanelIdsFor } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./HeaderChrome.module.css";

/** The app-head "View" dropdown (Phase 3 close/reopen): one checkbox row per
 * static panel of the active tab. The row REFLECTS the machine's
 * last-visible floor (disabled when closing would empty the tab) — the
 * reducer enforces it, so a click on a disabled row is a no-op either way.
 * Docked Jarvis panels are deliberately absent: they already carry
 * undock/dismiss controls of their own (recorded Phase 3 decision).
 *
 * Reading `props.activeTab` once at setup is intentional — HeaderChrome
 * mounts this component under a keyed `<Show>`, so a tab switch remounts it
 * and re-resolves the per-tab layout singleton (the `WorkspaceEngine`
 * precedent; `useLayout` is not a MaybeAccessor hook because it returns
 * intents, not a pure subscription). */
export function ViewMenu(props: ViewMenuProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const { useLayout } = useViewModel();
  const tab = untrack((): WorkspaceTab => {
    return props.activeTab;
  });
  const { state, close, reopen } = useLayout(tab);

  const panelIds = staticPanelIdsFor(tab);
  const closedSet = createMemo((): ReadonlySet<string> => {
    return new Set(state().closed);
  });

  const visibleCount = createMemo((): number => {
    return panelIds.length - closedSet().size;
  });

  function toggleViewMenu(): void {
    setOpen(!open());
  }

  function togglePanelVisibility(panelId: string): void {
    if (closedSet().has(panelId)) {
      reopen(panelId);
      return;
    }

    close(panelId);
  }

  return (
    <div class={styles.menuAnchor}>
      <button
        type="button"
        data-testid="view-menu-toggle"
        aria-label="View"
        aria-expanded={open()}
        class={styles.iconButton}
        onClick={toggleViewMenu}
      >
        <svg
          viewBox="0 0 24 24"
          class={styles.bellIcon}
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M15 3v18" />
          <path d="M3 9h12" />
        </svg>
      </button>
      <Show when={open()}>
        <div data-testid="view-menu-panel" class={styles.dropdown} role="menu">
          <div class={styles.dropdownHead}>
            <span class={styles.dropdownTitle}>VIEW</span>
            <span class={styles.dropdownMeta}>
              {visibleCount()}/{panelIds.length} visible
            </span>
          </div>
          <ul class={styles.viewList}>
            <For each={panelIds}>
              {(panelId: string): JSX.Element => {
                function isVisible(): boolean {
                  return !closedSet().has(panelId);
                }

                // The machine refuses to hide the last visible static
                // leaf; the row mirrors that floor as a disabled state.
                function isFloor(): boolean {
                  return isVisible() && visibleCount() === 1;
                }

                function togglePanelRow(): void {
                  togglePanelVisibility(panelId);
                }

                return (
                  <li>
                    <button
                      type="button"
                      data-testid={`view-menu-row-${panelId}`}
                      role="menuitemcheckbox"
                      aria-checked={isVisible()}
                      aria-disabled={isFloor()}
                      disabled={isFloor()}
                      class={styles.viewRow}
                      onClick={togglePanelRow}
                    >
                      <span class={styles.viewCheck} aria-hidden="true">
                        {isVisible() ? "✓" : ""}
                      </span>
                      <span>{PANEL_SPECS[panelId]?.title ?? panelId}</span>
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

interface ViewMenuProps {
  activeTab: WorkspaceTab;
}
