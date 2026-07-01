import type { ReactElement } from "react";

import styles from "#/shell/Header/Logo.module.css";

export function Logo(): ReactElement {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg className={styles.svg} viewBox="0 0 48 48" aria-hidden="true">
        <g
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <polygon
            points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5"
            opacity="0.9"
          />
          <polygon
            points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
            stroke="var(--accent2)"
            strokeWidth="1"
            opacity="0.6"
          />
        </g>
        <g
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.85"
        >
          <line x1="24" y1="2" x2="24" y2="6" />
          <line x1="24" y1="42" x2="24" y2="46" />
          <line x1="5" y1="13" x2="8.5" y2="15" />
          <line x1="43" y1="13" x2="39.5" y2="15" />
          <line x1="5" y1="35" x2="8.5" y2="33" />
          <line x1="43" y1="35" x2="39.5" y2="33" />
        </g>
        <circle
          className={styles.spin}
          cx="24"
          cy="24"
          r="11"
          fill="none"
          stroke="var(--accent2)"
          strokeWidth="1"
          strokeDasharray="3 5"
          opacity="0.85"
        />
        <g className={styles.spinRev}>
          <path
            d="M24 15 L31.8 28.5 L16.2 28.5 Z"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            opacity="0.8"
          />
          <path
            d="M24 33 L16.2 19.5 L31.8 19.5 Z"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            opacity="0.5"
          />
        </g>
        <circle cx="24" cy="24" r="3.4" fill="var(--accent)" />
        <circle
          cx="24"
          cy="24"
          r="6.4"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
