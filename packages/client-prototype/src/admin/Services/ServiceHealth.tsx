import type { ReactElement } from "react";

import styles from "#/admin/Services/ServiceHealth.module.css";
import { ServiceRow } from "#/admin/Services/ServiceRow";
import type { Service } from "#/admin/types";

export interface ServiceHealthProps {
  services: Service[];
}

// PROTO L708-711: the service-health list.
export function ServiceHealth(props: ServiceHealthProps): ReactElement {
  const { services } = props;

  return (
    <div className={styles.card}>
      <div className={styles.title}>SERVICE HEALTH</div>
      {services.map((service) => {
        return <ServiceRow key={service.name} service={service} />;
      })}
    </div>
  );
}
