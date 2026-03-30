import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createMockServices, type Services } from "./mock-service-factory";
import { createRealServices } from "./real-service-factory";
import { WsAdapter } from "./ws-adapter";

const ServiceContext = createContext<Services | null>(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;

export function ServiceProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => {
    if (SERVER_URL) {
      const ws = new WsAdapter(SERVER_URL);
      return createRealServices(ws);
    }
    return createMockServices();
  }, []);

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
