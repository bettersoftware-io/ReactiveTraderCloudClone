import { useContext } from "react";
import { ConnectionContext } from "./ConnectionProvider";
import type { ConnectionStatus } from "@rtc/domain";

export function useConnection(): ConnectionStatus {
  const ctx = useContext(ConnectionContext);
  if (ctx === null)
    throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}
