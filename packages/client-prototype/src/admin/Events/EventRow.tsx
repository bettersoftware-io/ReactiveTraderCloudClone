import type { ReactElement } from "react";

import styles from "#/admin/Events/LiveEvents.module.css";
import type { AdminEvent } from "#/admin/types";

export interface EventRowProps {
  event: AdminEvent;
}

// PROTO L716: one event row — time, severity tag (coloured via data-sev),
// service, message.
export function EventRow(props: EventRowProps): ReactElement {
  const { event } = props;

  return (
    <div className={styles.row}>
      <span className={styles.time}>{event.t}</span>
      <span className={styles.sev} data-sev={event.sev}>
        {event.sev}
      </span>
      <span className={styles.svc}>{event.svc}</span>
      <span className={styles.msg}>{event.msg}</span>
    </div>
  );
}
