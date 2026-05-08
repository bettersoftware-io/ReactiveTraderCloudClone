import { useThroughput } from "./hooks/useThroughput";

export function AdminPanel() {
  const { value, loading, message, setValue } = useThroughput();

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--text-secondary)" }}>
        Loading throughput...
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 480,
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 24,
        }}
      >
        Throughput Control
      </h2>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <input
          type="range"
          min={0}
          max={1000}
          step={10}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          style={{ flex: 1 }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number"
            min={0}
            max={1000}
            step={10}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 1000) {
                setValue(n);
              }
            }}
            style={{
              width: 72,
              padding: "4px 8px",
              fontSize: 14,
              border: "1px solid var(--border-primary)",
              borderRadius: 3,
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
              textAlign: "right",
            }}
          />
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            Updates/sec
          </span>
        </div>
      </div>

      {message && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 4,
            fontSize: 13,
            backgroundColor: message.isError
              ? "var(--status-error, #d32f2f)"
              : "var(--accent-primary)",
            color: "#fff",
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
