import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { ServiceRow } from "./ServiceRow";
import { servicesVm } from "./servicesVm";

import styles from "./ServiceHealth.module.css";

/**
 * Service-health list — one row per topology node (status, utilisation,
 * latency, uptime). PROTO Services/ServiceHealth.tsx received a static
 * Service[] prop; here ServiceHealth is the composition point, wired to
 * useTopology() and the pure servicesVm (derives the presentational fields
 * the prototype hardcoded on its seed data).
 */
export function ServiceHealth(): ReactElement {
  const { useTopology } = useViewModel();
  const topology = useTopology();
  const rows = topology ? servicesVm(topology.nodes) : [];

  return (
    <div data-testid="admin-service-health" className={styles.card}>
      <div className={styles.title}>SERVICE HEALTH</div>
      {rows.length === 0 ? (
        <div className={styles.empty}>NO TOPOLOGY DATA</div>
      ) : (
        rows.map((row) => {
          return <ServiceRow key={row.name} row={row} />;
        })
      )}
    </div>
  );
}
