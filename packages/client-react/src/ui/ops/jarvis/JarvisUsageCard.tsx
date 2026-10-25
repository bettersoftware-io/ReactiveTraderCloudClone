import type { ReactElement } from "react";

import {
  JARVIS_BRAIN_LABELS,
  type JarvisBrainUsageRow,
  type JarvisUsage,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./JarvisUsageCard.module.css";

/**
 * Jarvis token-usage/cost telemetry card (Ops surface) — per-brain rows for
 * today's UTC day (`currentWindow`) and cumulative since server start
 * (`sinceBoot`), from `useJarvisUsage()`. Dumb render only: the day always
 * resets at 00:00 UTC, so the reset line is a fixed string (no clock, no
 * ticking countdown — dumb UI has no timers), and the caveat line makes the
 * `sinceBoot` figures' actual scope explicit (they reset whenever the server
 * process restarts, not on any fixed schedule).
 *
 * A brain row's `cacheReadTokens` sitting at 0 (most visibly on `haiku` rows)
 * is an EXPECTED consequence of Anthropic's cache floor, not a data
 * problem — and isn't even rendered here (only turns/in-out tokens/cost are
 * in scope per this card's spec), so there's nothing to flag either way.
 *
 * The budget envelope fields (`budgetUsd`/`spentWindowUsd`/`gateLevel`) are
 * all absent on a pre-round server — the budget line renders only when
 * `budgetUsd` is present. The cap is the house-wide daily budget, always a
 * number once present; `gateLevel === "hard"` means the day's budget is spent.
 */
export function JarvisUsageCard(): ReactElement {
  const { useJarvisUsage } = useViewModel();
  const usage: JarvisUsage | null = useJarvisUsage();

  return (
    <div data-testid="ops-jarvis-usage-card" className={styles.card}>
      <div className={styles.title}>JARVIS USAGE</div>
      {usage === null ? (
        <div className={styles.empty}>NO USAGE DATA</div>
      ) : (
        <>
          {usage.budgetUsd !== undefined ? (
            <div
              data-testid="ops-jarvis-budget-line"
              className={styles.budgetLine}
            >
              {`$${(usage.spentWindowUsd ?? 0).toFixed(2)} of $${(usage.budgetUsd ?? 0).toFixed(2)} house budget today (UTC)`}
              {usage.gateLevel === "hard" ? (
                <span
                  data-testid="ops-jarvis-gate-badge"
                  className={styles.gateBadge}
                  data-gate={usage.gateLevel}
                >
                  · EXHAUSTED
                </span>
              ) : null}
            </div>
          ) : null}
          <UsageSection title="TODAY (UTC)" rows={usage.currentWindow} />
          <div className={styles.resetLine}>Resets 00:00 UTC</div>
          <UsageSection title="SINCE BOOT" rows={usage.sinceBoot} />
          <div className={styles.caveat}>
            per-model rows reset on server restart
          </div>
        </>
      )}
    </div>
  );
}

/** One window's per-brain rows — a small header + list, empty-safe (a window
 * with no turns yet renders nothing between sections rather than an
 * "EMPTY"-of-its-own that would just repeat the card's own NO USAGE DATA). */
function UsageSection({ title, rows }: UsageSectionProps): ReactElement {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {rows.length === 0 ? (
        <div className={styles.sectionEmpty}>No turns yet</div>
      ) : (
        <div className={styles.list}>
          {rows.map((row) => {
            return (
              <div key={row.brain} className={styles.row}>
                <span className={styles.brain}>
                  {JARVIS_BRAIN_LABELS[row.brain]}
                </span>
                <span className={styles.stat}>
                  {row.turns.toLocaleString("en-US")} turns
                </span>
                <span className={styles.stat}>
                  {row.inputTokens.toLocaleString("en-US")} in /{" "}
                  {row.outputTokens.toLocaleString("en-US")} out
                </span>
                <span className={styles.cost}>
                  ${row.estimatedCostUsd.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface UsageSectionProps {
  title: string;
  rows: readonly JarvisBrainUsageRow[];
}
