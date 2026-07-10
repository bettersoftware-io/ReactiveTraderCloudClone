// tests/presenter/vitest-quickpickle-fake-timers/steps/adminIncident.steps.ts
//
// Quickpickle mirror of tests/presenter/steps/adminIncident.steps.ts.
// Runs under vitest fake timers; vi.advanceTimersByTimeAsync drives awaitFirstWithin.
//
// NOTE: ConnectionStatus is a `const enum` — use string-literal stand-ins.
import { After, Given, Then, When } from "quickpickle";
import { filter, type Subscription } from "rxjs";

import type { ConnectionStatus } from "@rtc/domain";

import {
  buildIncidentPresenterApp,
  type IncidentPresenterCtx,
} from "#/presenter/scenarios/_buildApp";

import type { VitestFakePresenterWorld } from "../world";

// String-literal stand-ins for ConnectionStatus const enum values.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_DISCONNECTED = "DISCONNECTED" as unknown as ConnectionStatus;

interface IncidentStepCtx extends IncidentPresenterCtx {
  /** Keeps status$ shareReplay warm across all steps. */
  statusSub: Subscription;
}

const incidentMap = new WeakMap<VitestFakePresenterWorld, IncidentStepCtx>();

After(async (state: VitestFakePresenterWorld) => {
  const ctx = incidentMap.get(state);

  if (ctx) {
    ctx.statusSub.unsubscribe();
    ctx.bridgeSub.unsubscribe();
    ctx.app.presenters.incident.dispose();
    incidentMap.delete(state);
  }
});

Given("the app is connected", async (state: VitestFakePresenterWorld) => {
  const incidentCtx = buildIncidentPresenterApp();
  const { app } = incidentCtx;
  const statusSub = app.presenters.connection.status$.subscribe();
  incidentMap.set(state, { ...incidentCtx, statusSub });
  await state.awaitFirstWithin(
    app.presenters.connection.status$.pipe(
      filter((s) => {
        return s === CS_CONNECTED;
      }),
    ),
    5_000,
  );
});

When(
  "the operator injects a {string} incident from the admin panel",
  async (state: VitestFakePresenterWorld, kind: string) => {
    const ctx = incidentMap.get(state);

    if (!ctx) {
      throw new Error("incident app not initialised");
    }

    ctx.app.presenters.incident.intents.inject(
      kind as "serviceDown" | "latencySpike" | "errorBurst",
    );
  },
);

Then(
  "the connection banner shows a disconnection",
  async (state: VitestFakePresenterWorld) => {
    const ctx = incidentMap.get(state);

    if (!ctx) {
      throw new Error("incident app not initialised");
    }

    await state.awaitFirstWithin(
      ctx.app.presenters.connection.status$.pipe(
        filter((s) => {
          return s === CS_DISCONNECTED;
        }),
      ),
      5_000,
    );
  },
);

When(
  "the operator clears the incident",
  async (state: VitestFakePresenterWorld) => {
    const ctx = incidentMap.get(state);

    if (!ctx) {
      throw new Error("incident app not initialised");
    }

    ctx.app.presenters.incident.intents.clear();
  },
);

Then("the connection is restored", async (state: VitestFakePresenterWorld) => {
  const ctx = incidentMap.get(state);

  if (!ctx) {
    throw new Error("incident app not initialised");
  }

  await state.awaitFirstWithin(
    ctx.app.presenters.connection.status$.pipe(
      filter((s) => {
        return s === CS_CONNECTED;
      }),
    ),
    5_000,
  );
});
