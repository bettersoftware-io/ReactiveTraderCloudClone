import { useHooks } from "../hooks/useHooks";

import styles from "./AdminPanel.module.css";

export function AdminPanel() {
  const { value, loading, message, setValue } = useHooks().useThroughput();

  if (loading) {
    return <div className={styles.loading}>Loading throughput...</div>;
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Throughput Control</h2>

      <div className={styles.row}>
        <input
          type="range"
          min={0}
          max={1000}
          step={10}
          value={value}
          onChange={(e) => {
            return setValue(Number(e.target.value));
          }}
          className={styles.slider}
        />

        <div className={styles.inputGroup}>
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
            className={styles.numberInput}
          />
          <span className={styles.unit}>Updates/sec</span>
        </div>
      </div>

      {!!message && (
        <div
          data-error={message.isError ? "true" : "false"}
          className={styles.message}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
