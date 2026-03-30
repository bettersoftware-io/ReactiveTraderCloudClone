import type { CSSProperties, ReactNode } from "react";

interface StaleIndicatorProps {
  stale: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * Wraps children with a greyed-out overlay when data is stale.
 */
export function StaleIndicator({ stale, children, style }: StaleIndicatorProps) {
  return (
    <div
      data-stale={stale || undefined}
      style={{
        position: "relative",
        ...style,
      }}
    >
      {children}
      {stale && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            borderRadius: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.8)",
              fontWeight: 500,
            }}
          >
            Reconnecting...
          </span>
        </div>
      )}
    </div>
  );
}
