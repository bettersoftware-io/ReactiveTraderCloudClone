import type { ReactElement } from "react";

import { KpiCard } from "#/admin/Kpis/KpiCard";
import styles from "#/admin/Kpis/KpiRow.module.css";
import type { AdminKpi } from "#/admin/types";

export interface KpiRowProps {
  kpis: AdminKpi[];
}

// PROTO L685-697: the 4-up KPI strip.
export function KpiRow(props: KpiRowProps): ReactElement {
  const { kpis } = props;

  return (
    <div className={styles.row}>
      {kpis.map((kpi) => {
        return <KpiCard key={kpi.key} kpi={kpi} />;
      })}
    </div>
  );
}
