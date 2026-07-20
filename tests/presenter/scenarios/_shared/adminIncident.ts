// tests/presenter/scenarios/_shared/adminIncident.ts

import { filter } from "rxjs";

import type { ConnectionStatus } from "@rtc/domain";

import type { AwaitHelpers } from "../_await";
import type { IncidentPresenterCtx } from "../_buildApp";

// String-literal stand-ins for the ConnectionStatus const enum. Same trick as
// connection.ts — verbatimModuleSyntax + isolatedModules forbid accessing
// ambient const enum values from a different package. The members are
// string-valued so the cast is safe at runtime.
export const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
export const CS_DISCONNECTED = "DISCONNECTED" as unknown as ConnectionStatus;

export type IncidentWorld = AwaitHelpers & {
  ctx: IncidentPresenterCtx;
};

export async function operatorInjectsIncident(
  w: IncidentWorld,
  kind: "serviceDown" | "latencySpike" | "errorBurst",
): Promise<void> {
  w.ctx.app.presenters.incident.intents.inject(kind);
}

export async function operatorClearsIncident(w: IncidentWorld): Promise<void> {
  w.ctx.app.presenters.incident.intents.clear();
}

export async function expectStatusEqualsWithin(
  w: IncidentWorld,
  status: ConnectionStatus,
  seconds: number,
): Promise<void> {
  await w.awaitFirstWithin(
    w.ctx.app.presenters.connection.status$.pipe(
      filter((s) => {
        return s === status;
      }),
    ),
    seconds * 1000,
  );
}
