import type { JSX } from "solid-js";

import styles from "./HudLogo.module.css";

/**
 * Animated HUD hex logo (prototype Logo.tsx:5-80) — the double hexagon with
 * compass ticks, a slow-spinning dashed orbit, a counter-rotating triangle
 * pair, and the solid core + ring. Colours ride the theme tokens
 * (`--accent-primary` / `--accent-2`) so the mark re-tints with the active
 * skin. Decorative only (aria-hidden); the logo fills its parent, so callers
 * own the size and glow (drop-shadow) via a sized wrapper element — 38×38 in
 * the header brand, 64×64 on the lock screen.
 *
 * The prototype rotated the orbit circle and triangle group INSIDE one SVG,
 * but transforms on SVG child elements can never run on the compositor —
 * Chrome re-resolved style and layout for them on the main thread on every
 * frame, forever. The rotating parts therefore live in their own stacked
 * SVG layers whose HTML wrappers carry the rotation (compositor-offloaded);
 * the painted output is identical.
 */
export function HudLogo(): JSX.Element {
  return (
    <span class={styles.root} aria-hidden="true">
      <svg class={styles.svg} viewBox="0 0 48 48" aria-hidden="true">
        <g
          fill="none"
          stroke="var(--accent-primary)"
          stroke-width="1.4"
          stroke-linejoin="round"
        >
          <polygon
            points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5"
            opacity="0.9"
          />
          <polygon
            points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
            stroke="var(--accent-2)"
            stroke-width="1"
            opacity="0.6"
          />
        </g>
        <g
          stroke="var(--accent-primary)"
          stroke-width="1.6"
          stroke-linecap="round"
          opacity="0.85"
        >
          <line x1="24" y1="2" x2="24" y2="6" />
          <line x1="24" y1="42" x2="24" y2="46" />
          <line x1="5" y1="13" x2="8.5" y2="15" />
          <line x1="43" y1="13" x2="39.5" y2="15" />
          <line x1="5" y1="35" x2="8.5" y2="33" />
          <line x1="43" y1="35" x2="39.5" y2="33" />
        </g>
        <circle cx="24" cy="24" r="3.4" fill="var(--accent-primary)" />
        <circle
          cx="24"
          cy="24"
          r="6.4"
          fill="none"
          stroke="var(--accent-primary)"
          stroke-width="1"
        />
      </svg>
      <span class={styles.spin}>
        <svg class={styles.svg} viewBox="0 0 48 48" aria-hidden="true">
          <circle
            cx="24"
            cy="24"
            r="11"
            fill="none"
            stroke="var(--accent-2)"
            stroke-width="1"
            stroke-dasharray="3 5"
            opacity="0.85"
          />
        </svg>
      </span>
      <span class={styles.spinRev}>
        <svg class={styles.svg} viewBox="0 0 48 48" aria-hidden="true">
          <path
            d="M24 15 L31.8 28.5 L16.2 28.5 Z"
            fill="none"
            stroke="var(--accent-primary)"
            stroke-width="1.2"
            stroke-linejoin="round"
            opacity="0.8"
          />
          <path
            d="M24 33 L16.2 19.5 L31.8 19.5 Z"
            fill="none"
            stroke="var(--accent-primary)"
            stroke-width="1.2"
            stroke-linejoin="round"
            opacity="0.5"
          />
        </svg>
      </span>
    </span>
  );
}
