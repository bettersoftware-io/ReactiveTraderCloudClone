import { type Accessor, type JSX, Show } from "solid-js";

import type { PanelId } from "@rtc/client-core";

import styles from "./PanelHead.module.css";

/** The header's LEFT half: the panel's registered head slot (FX's Live
 * Rates ▸ Watchlist tabs + CHARTS chip) or, absent one, its title rendered
 * as a single accent tab. Shared by both layout engines — the in-house
 * engine renders it inside its `.panelHeader`; the dockview engine portals
 * it into dockview's tab (its drag surface) — so a panel's header is the
 * same nodes whichever engine is on. Solid twin of client-react's
 * PanelHeadSlot: props are read at their JSX use sites (never destructured)
 * so a later `headContent` / `title` change re-renders the one binding. Its
 * styles live in PanelHead.module.css together with PanelHeadControls' and
 * PanelStrip's — one stylesheet for the whole shared header. */
export function PanelHeadSlot(props: PanelHeadSlotProps): JSX.Element {
  return (
    <Show
      when={props.headContent}
      fallback={
        <span
          data-testid={`panel-${props.panelId}-title`}
          class={styles.panelTitle}
        >
          {props.title}
        </span>
      }
    >
      {(head: Accessor<() => JSX.Element>): JSX.Element => {
        return <div class={styles.panelHeadContent}>{head()()}</div>;
      }}
    </Show>
  );
}

export interface PanelHeadSlotProps {
  panelId: PanelId;
  title: string;
  /** The panel's entry in the head registry, when it has one. */
  headContent?: () => JSX.Element;
}
