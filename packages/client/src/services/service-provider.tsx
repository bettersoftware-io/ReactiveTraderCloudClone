import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createMockServices, type Services } from "./mock-service-factory";

const ServiceContext = createContext<Services | null>(null);

export function ServiceProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => createMockServices(), []);

  return (
    <ServiceContext.Provider value={services}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useServices(): Services {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error("useServices must be used within ServiceProvider");
  return ctx;
}
