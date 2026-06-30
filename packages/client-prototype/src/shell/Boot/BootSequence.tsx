import type { CSSProperties, ReactElement } from "react";

import styles from "#/shell/Boot/BootSequence.module.css";
import { useBootSequence } from "#/shell/Boot/useBootSequence";

export interface BootSequenceProps {
  onDone(): void;
}

export function BootSequence(props: BootSequenceProps): ReactElement {
  const { onDone } = props;
  const boot = useBootSequence({ onDone });
  return (
    <div className={styles.boot}>
      <canvas
        ref={boot.canvasRef}
        width={320}
        height={320}
        className={styles.canvas}
      />
      <div className={styles.bar}>
        <div
          className={styles.fill}
          // eslint-disable-next-line no-restricted-syntax -- runtime progress geometry via CSS var
          style={{ "--pct": `${boot.pct}%` } as CSSProperties}
        />
      </div>
      <div className={styles.log}>
        {boot.lines.map((line) => {
          return <div key={line}>{line}</div>;
        })}
      </div>
      <button
        type="button"
        data-testid="boot-skip"
        className={styles.skip}
        onClick={boot.skip}
      >
        SKIP ▸
      </button>
    </div>
  );
}
