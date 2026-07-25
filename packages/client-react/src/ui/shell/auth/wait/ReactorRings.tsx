import type { ReactElement, ReactNode } from "react";

import styles from "./ReactorRings.module.css";

/**
 * Wraps a child emblem (the shared `HudLogo`) with two counter-rotating arcs
 * and a pulse, so the emblem itself reads as "spinning up" while a
 * reactor-variant wait is in flight — the approved design has the rings spin
 * up AROUND the existing hex emblem, not as a standalone cluster elsewhere on
 * the panel.
 *
 * A pure wrapper: it never reaches inside its child. `HudLogo` is also
 * rendered bare by `HeaderChrome`, so any rings/pulse baked into `HudLogo`
 * itself would leak into the app header too — this component instead takes
 * the emblem as `children` and lays the rings around it.
 *
 * The rings live in their own wrapping <div>s because the rotation animation
 * is applied to the WRAPPER, never to the <circle> — SVG-child transforms
 * never composite (docs/performance.md), so spinning the circle directly
 * would repaint every frame for the life of the request.
 */
export function ReactorRings({ children }: ReactorRingsProps): ReactElement {
  return (
    <div className={styles.root}>
      {/* The two inner <svg>s repeat aria-hidden even though this wrapper
          already carries it — not redundant: Biome's error-severity
          lint/a11y/noSvgWithoutTitle requires a title element or
          aria-hidden on the <svg> itself, not an ancestor, and this repo
          disallows lint disables. Removing them fails the build. */}
      <div className={styles.ringOuter} aria-hidden="true">
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
      <div className={styles.ringInner} aria-hidden="true">
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
      <div className={styles.emblem}>{children}</div>
    </div>
  );
}

interface ReactorRingsProps {
  children: ReactNode;
}
