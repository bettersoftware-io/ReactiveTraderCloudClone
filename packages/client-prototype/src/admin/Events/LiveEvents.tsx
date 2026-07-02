import type { ReactElement } from "react";

import { EventRow } from "#/admin/Events/EventRow";
import styles from "#/admin/Events/LiveEvents.module.css";
import type { AdminEvent } from "#/admin/types";

export interface LiveEventsProps {
  events: AdminEvent[];
}

// PROTO L712-717: the live event feed — a count header over a scrollable log.
export function LiveEvents(props: LiveEventsProps): ReactElement {
  const { events } = props;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>LIVE EVENTS</span>
        <span className={styles.count}>{events.length} events</span>
      </div>
      <div className={styles.list}>
        {events.map((event) => {
          return <EventRow key={event.id} event={event} />;
        })}
      </div>
    </div>
  );
}
