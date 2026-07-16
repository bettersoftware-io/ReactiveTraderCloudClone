import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { ServiceRow } from "./ServiceRow";
import { servicesVm, type ServiceRowVm } from "./servicesVm";

import styles from "./ServiceHealth.module.css";

/**
 * Service-health list — one row per topology node (status, utilisation,
 * latency, uptime). PROTO Services/ServiceHealth.tsx received a static
 * Service[] prop; here ServiceHealth is the composition point, wired to
 * useTopology() and the pure servicesVm (derives the presentational fields
 * the prototype hardcoded on its seed data).
 */
export function ServiceHealth(): JSX.Element {
  const { useTopology } = useViewModel();
  const topology = useTopology();

  const rows = createMemo((): readonly ServiceRowVm[] => {
    const current = topology();
    return current ? servicesVm(current.nodes) : [];
  });

  return (
    <div data-testid="admin-service-health" class={styles.card}>
      <div class={styles.title}>SERVICE HEALTH</div>
      <Show
        when={rows().length > 0}
        fallback={<div class={styles.empty}>NO TOPOLOGY DATA</div>}
      >
        <For each={rows()}>
          {(row: ServiceRowVm) => {
            return <ServiceRow row={row} />;
          }}
        </For>
      </Show>
    </div>
  );
}
