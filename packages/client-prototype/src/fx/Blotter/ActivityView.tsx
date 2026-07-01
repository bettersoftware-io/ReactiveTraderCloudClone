import type { CSSProperties, ReactElement } from "react";

import styles from "#/fx/Blotter/ActivityView.module.css";
import type { ActivityEvent } from "#/fx/types";

export interface ActivityViewProps {
  events: ActivityEvent[];
}

const EMPTY_TEXT = "No activity yet — execute a trade to populate the feed";

// PROTO 492-496 (fxActivityView / sb614): one row per event — timestamp,
// then a tag colored via `--tag-color`, then the message — or the empty
// state when nothing has happened yet.
export function ActivityView(props: ActivityViewProps): ReactElement {
  const { events } = props;

  if (events.length === 0) {
    return <div className={styles.empty}>{EMPTY_TEXT}</div>;
  }

  return (
    <div>
      {events.map((event) => {
        return (
          <ActivityRow
            key={`${event.t}-${event.tag}-${event.msg}`}
            event={event}
          />
        );
      })}
    </div>
  );
}

// — private subcomponent ——————————————————————————————————————————————————————

interface ActivityRowProps {
  event: ActivityEvent;
}

function ActivityRow(props: ActivityRowProps): ReactElement {
  const { event } = props;
  const tagStyle = { "--tag-color": event.color } as CSSProperties;

  return (
    <div className={styles.row}>
      <span className={styles.time}>{event.t}</span>
      <span className={styles.tag} style={tagStyle}>
        {event.tag}
      </span>
      <span className={styles.msg}>{event.msg}</span>
    </div>
  );
}
