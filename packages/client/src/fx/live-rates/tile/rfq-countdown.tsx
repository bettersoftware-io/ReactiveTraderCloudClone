interface RfqCountdownProps {
  remainingMs: number;
  totalMs: number;
}

export function RfqCountdown({ remainingMs, totalMs }: RfqCountdownProps) {
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: "var(--border-primary)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${fraction * 100}%`,
            backgroundColor:
              fraction > 0.3
                ? "var(--accent-primary)"
                : "var(--accent-aware)",
            transition: "width 0.1s linear",
            borderRadius: 2,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          textAlign: "center",
        }}
      >
        {seconds}s remaining
      </span>
    </div>
  );
}
