import type { ReactElement } from "react";

import styles from "./ReactorWait.module.css";

/**
 * The `reactor` login-wait treatment: counter-rotating arcs, an indeterminate
 * bar, and a pulsing status line.
 *
 * The rings are wrapped in their own <div>s because the rotation animation is
 * applied to the WRAPPER, never to the <circle> — SVG-child transforms never
 * composite (docs/performance.md), so spinning the circle directly would
 * repaint every frame for the life of the request.
 */
export function ReactorWait(): ReactElement {
  return (
    <div data-testid="auth-wait-reactor" className={styles.wait}>
      {/* The two inner <svg>s repeat aria-hidden even though this wrapper
          already carries it — not redundant: Biome's error-severity
          lint/a11y/noSvgWithoutTitle requires a title element or
          aria-hidden on the <svg> itself, not an ancestor, and this repo
          disallows lint disables. Removing them fails the build. */}
      <div className={styles.rings} aria-hidden="true">
        <div className={styles.ringOuter}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              className={styles.arcOuter}
            />
          </svg>
        </div>
        <div className={styles.ringInner}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              className={styles.arcInner}
            />
          </svg>
        </div>
      </div>

      <div className={styles.track} aria-hidden="true">
        <div className={styles.bar} />
      </div>

      <div className={styles.status} role="status" aria-live="polite">
        ▸ AWAITING AUTH GRANT
      </div>
    </div>
  );
}
