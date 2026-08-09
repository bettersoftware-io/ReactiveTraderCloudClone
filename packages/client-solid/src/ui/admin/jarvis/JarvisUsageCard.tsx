import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

import type { AdminJarvisUsagePayload } from "@rtc/client-core";
import { JARVIS_BRAIN_LABELS } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

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
 * (see `AdminJarvisUsagePayload`'s doc) — rendered as "—" rather than the
 * misleading epoch-zero clock read `clock(0)` would otherwise print.
 *
 * The budget-gate envelope fields (`budgetUsd`/`softBudgetUsd`/
 * `spentWindowUsd`/`gateLevel`) are all absent on a pre-round server — the
 * budget line renders only when `budgetUsd` is present (`null` means
 * budgeting is disabled server-side; a real number means it's on).
 */
export function JarvisUsageCard(): JSX.Element {
  const { useJarvisUsage } = useViewModel();
  const usage = useJarvisUsage();

  return (
    <div data-testid="admin-jarvis-usage-card" class={styles.card}>
      <div class={styles.title}>JARVIS USAGE</div>
      <Show
        when={usage() !== null}
        fallback={<div class={styles.empty}>NO USAGE DATA</div>}
      >
        <Show when={usage()?.budgetUsd !== undefined}>
          <div data-testid="admin-jarvis-budget-line" class={styles.budgetLine}>
            {usage()?.budgetUsd === null
              ? "BUDGET OFF"
              : `$${(usage()?.spentWindowUsd ?? 0).toFixed(2)} of $${(usage()?.budgetUsd ?? 0).toFixed(2)} this window — soft gate at $${(usage()?.softBudgetUsd ?? 0).toFixed(2)}`}
            <Show
              when={
                usage()?.gateLevel === "soft" || usage()?.gateLevel === "hard"
              }
            >
              <span
                data-testid="admin-jarvis-gate-badge"
                class={styles.gateBadge}
                data-gate={usage()?.gateLevel}
              >
                {usage()?.gateLevel?.toUpperCase()} GATE
              </span>
            </Show>
          </div>
        </Show>
        <UsageSection
          title="CURRENT WINDOW"
          rows={() => {
            return usage()?.currentWindow ?? [];
          }}
        />
        <div class={styles.resetLine}>
          Window resets{" "}
          {usage()?.windowEndMs === 0 ? "—" : clock(usage()?.windowEndMs ?? 0)}
        </div>
        <UsageSection
          title="SINCE BOOT"
          rows={() => {
            return usage()?.sinceBoot ?? [];
          }}
        />
        <div class={styles.caveat}>resets on server restart</div>
      </Show>
    </div>
  );
}

/** One window's per-brain rows — a small header + list, empty-safe (a window
 * with no turns yet renders nothing between sections rather than an
 * "EMPTY"-of-its-own that would just repeat the card's own NO USAGE DATA). */
function UsageSection(props: UsageSectionProps): JSX.Element {
  return (
    <div class={styles.section}>
      <div class={styles.sectionTitle}>{props.title}</div>
      <Show
        when={props.rows().length > 0}
        fallback={<div class={styles.sectionEmpty}>No turns yet</div>}
      >
        <div class={styles.list}>
          <For each={props.rows()}>
            {(row: JarvisBrainUsageRow) => {
              return (
                <div class={styles.row}>
                  <span class={styles.brain}>
                    {JARVIS_BRAIN_LABELS[row.brain]}
                  </span>
                  <span class={styles.stat}>
                    {row.turns.toLocaleString("en-US")} turns
                  </span>
                  <span class={styles.stat}>
                    {row.inputTokens.toLocaleString("en-US")} in /{" "}
                    {row.outputTokens.toLocaleString("en-US")} out
                  </span>
                  <span class={styles.cost}>
                    ${row.estimatedCostUsd.toFixed(2)}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

interface UsageSectionProps {
  title: string;
  rows: () => readonly JarvisBrainUsageRow[];
}

/** One per-brain usage row, as carried by both `AdminJarvisUsagePayload`
 * windows — referenced structurally off the client-core-exported payload
 * type rather than importing `@rtc/shared`'s `JarvisBrainUsageRow` directly
 * (client-solid has no direct dependency on `@rtc/shared`; only
 * `AdminJarvisUsagePayload` itself is re-exported through
 * `@rtc/client-core`'s `jarvisUsagePort`). */
type JarvisBrainUsageRow = AdminJarvisUsagePayload["currentWindow"][number];

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
