import type { ReactElement } from "react";

import styles from "./HeaderChrome.module.css";

/** One workspace nav tab — a standalone component (not a render helper) so it
 * shows up in DevTools and the wiring is explicit at the call site. Renders
 * with `data-testid="tab-{tab}"` and `data-active`, and reports clicks through
 * `onSelect` — the Cypress/Playwright workspace contract for all four tabs. */
export function NavTab({ tab, active, onSelect }: NavTabProps): ReactElement {
  return (
    <button
      type="button"
      data-testid={`tab-${tab}`}
      data-active={active ? "true" : "false"}
      className={styles.navButton}
      onClick={() => {
        onSelect(tab);
      }}
    >
      {TAB_LABEL[tab]}
    </button>
  );
}

/** The four real workspace tabs the shell switches between. Equities added in
 *  Phase 4; the e2e Workspace page object clicks `tab-${tab}`. */
export type WorkspaceTab = "fx" | "credit" | "admin" | "equities";

const TAB_LABEL: Record<WorkspaceTab, string> = {
  fx: "FX",
  credit: "Credit",
  admin: "Admin",
  equities: "Equities",
};

interface NavTabProps {
  tab: WorkspaceTab;
  active: boolean;
  onSelect: (tab: WorkspaceTab) => void;
}
