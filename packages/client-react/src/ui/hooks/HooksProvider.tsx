import { createContext, type ReactNode, useContext } from "react";
import type { AppHooks } from "./createAppHooks";

const HooksContext = createContext<AppHooks | null>(null);

export function HooksProvider({
  hooks,
  children,
}: {
  hooks: AppHooks;
  children: ReactNode;
}) {
  return (
    <HooksContext.Provider value={hooks}>{children}</HooksContext.Provider>
  );
}

export function useHooks(): AppHooks {
  const ctx = useContext(HooksContext);
  if (!ctx) throw new Error("useHooks must be used within HooksProvider");
  return ctx;
}
