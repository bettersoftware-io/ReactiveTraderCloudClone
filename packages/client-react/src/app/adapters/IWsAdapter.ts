// Re-export shim — IWsAdapter moved to @rtc/client-core (Task 4).
// WsAdapter.ts imports from this path; the shim keeps that import valid
// without editing WsAdapter.ts.
export type { IWsAdapter, MessageHandler } from "@rtc/client-core";
