import type { ReactElement } from "react";
import { useState } from "react";

import type { WorkspaceTab } from "@rtc/client-core";
import { PANEL_SPECS, staticPanelIdsFor } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./HeaderChrome.module.css";

/** The app-head "View" dropdown (Phase 3 close/reopen): one checkbox row per
 * static panel of the active tab. The row REFLECTS the machine's
 * last-visible floor (disabled when closing would empty the tab) — the
 * reducer enforces it, so a click on a disabled row is a no-op either way.
 * Docked Jarvis panels are deliberately absent: they already carry
 * undock/dismiss controls of their own (recorded Phase 3 decision). */
export function ViewMenu({ activeTab }: ViewMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const { useLayout } = useViewModel();
  const { state, close, reopen } = useLayout(activeTab);

  const panelIds = staticPanelIdsFor(activeTab);
  const closed = new Set(state.closed);
  const visibleCount = panelIds.length - closed.size;

  function toggleViewMenu(): void {
    setOpen(!open);
  }

  function togglePanelVisibility(panelId: string): void {
    if (closed.has(panelId)) {
      reopen(panelId);
      return;
    }
    close(panelId);
  }

  return (
    <div className={styles.menuAnchor}>
      <button
        type="button"
        data-testid="view-menu-toggle"
        aria-label="View"
        aria-expanded={open}
        className={styles.iconButton}
        onClick={toggleViewMenu}
      >
        <svg
          viewBox="0 0 24 24"
          className={styles.bellIcon}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M15 3v18" />
          <path d="M3 9h12" />
        </svg>
      </button>
      {open ? (
        <div
          data-testid="view-menu-panel"
          className={styles.dropdown}
          role="menu"
        >
          <div className={styles.dropdownHead}>
            <span className={styles.dropdownTitle}>VIEW</span>
            <span className={styles.dropdownMeta}>
              {visibleCount}/{panelIds.length} visible
            </span>
          </div>
          <ul className={styles.viewList}>
            {panelIds.map((panelId) => {
              const isVisible = !closed.has(panelId);
              return (
                <ViewMenuRow
                  key={panelId}
                  panelId={panelId}
                  isVisible={isVisible}
                  // The machine refuses to hide the last visible static
                  // leaf; the row mirrors that floor as a disabled state.
                  isFloor={isVisible && visibleCount === 1}
                  onToggle={togglePanelVisibility}
                />
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

interface ViewMenuProps {
  activeTab: WorkspaceTab;
}

function ViewMenuRow({
  panelId,
  isVisible,
  isFloor,
  onToggle,
}: ViewMenuRowProps): ReactElement {
  function togglePanelVisibility(): void {
    onToggle(panelId);
  }

  return (
    <li>
      <button
        type="button"
        data-testid={`view-menu-row-${panelId}`}
        role="menuitemcheckbox"
        aria-checked={isVisible}
        aria-disabled={isFloor}
        disabled={isFloor}
        className={styles.viewRow}
        onClick={togglePanelVisibility}
      >
        <span className={styles.viewCheck} aria-hidden="true">
          {isVisible ? "✓" : ""}
        </span>
        <span>{PANEL_SPECS[panelId]?.title ?? panelId}</span>
      </button>
    </li>
  );
}

interface ViewMenuRowProps {
  panelId: string;
  isVisible: boolean;
  isFloor: boolean;
  /** Slot: the menu decides what a toggle does (close vs reopen). */
  onToggle: (panelId: string) => void;
}
