import type { ReactElement } from "react";

import type { JarvisUsageSnapshot } from "@rtc/client-core";
import { JARVIS_BRAIN_LABELS } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./JarvisUsageCard.module.css";

/**
 * Jarvis token-usage/cost telemetry card (Admin surface) — per-brain rows for
 * the live rate-limit window (`currentWindow`) and cumulative since server
 * start (`sinceBoot`), from `useJarvisUsage()`. Dumb render only: the window
 * reset is printed as an ABSOLUTE time (no ticking countdown — dumb UI has no
 * timers), and the caveat line makes the `sinceBoot` figures' actual scope
 * explicit (they reset whenever the server process restarts, not on any
 * fixed schedule).
 *
 * A brain row's `cacheReadTokens` sitting at 0 (most visibly on `haiku` rows)
 * is an EXPECTED consequence of Anthropic's cache floor, not a data
 * problem — and isn't even rendered here (only turns/in-out tokens/cost are
 * in scope per this card's spec), so there's nothing to flag either way.
 *
 * `windowEndMs === 0` is the snapshot's own "no turn recorded yet" sentinel
 * (see `JarvisUsageSnapshot`'s doc) — rendered as "—" rather than the
 * misleading epoch-zero clock read `clock(0)` would otherwise print.
 */
export function JarvisUsageCard(): ReactElement {
  const { useJarvisUsage } = useViewModel();
  const usage = useJarvisUsage();

  return (
    <div data-testid="admin-jarvis-usage-card" className={styles.card}>
      <div className={styles.title}>JARVIS USAGE</div>
      {usage === null ? (
        <div className={styles.empty}>NO USAGE DATA</div>
      ) : (
        <>
          <UsageSection title="CURRENT WINDOW" rows={usage.currentWindow} />
          <div className={styles.resetLine}>
            Window resets{" "}
            {usage.windowEndMs === 0 ? "—" : clock(usage.windowEndMs)}
          </div>
          <UsageSection title="SINCE BOOT" rows={usage.sinceBoot} />
          <div className={styles.caveat}>resets on server restart</div>
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

/** One per-brain usage row, as carried by both `JarvisUsageSnapshot` windows —
 * referenced structurally off the client-core-exported snapshot type rather
 * than importing `@rtc/shared`'s `JarvisBrainUsageRow` directly (client-react
 * has no direct dependency on `@rtc/shared`; only `JarvisUsageSnapshot`
 * itself is re-exported through `@rtc/client-core`'s `jarvisUsagePort`). */
type JarvisBrainUsageRow = JarvisUsageSnapshot["currentWindow"][number];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// HH:MM:SS from the window-end epoch ms — pure, locale-stable formatting
// (same idiom as LiveEventLog's `clock`), and deliberately NOT a ticking
// countdown: dumb UI holds no timers, so this is the absolute reset time,
// re-rendered only when a fresh snapshot arrives.
function clock(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
