// tests/presenter/steps/adminIncident.steps.ts
//
// Drives the IncidentMachine → ConnectionStatusPresenter coupling via the
// real in-process app.  buildIncidentPresenterApp() wires a reactive bridge so
// that inject() / clear() drive the custom connectionEvents port without
// requiring import.meta.env (Vite-only).
//
// NOTE: ConnectionStatus is a `const enum` in @rtc/domain source. With
// verbatimModuleSyntax + isolatedModules, ambient const enums cannot be
// accessed as values from a different package. We use their string literals
// directly (safe because all members are string-valued).
import { After, Given, Then, When } from "@cucumber/cucumber";
import { filter, type Subscription } from "rxjs";

import type { ConnectionStatus } from "@rtc/domain";

import {
  buildIncidentPresenterApp,
  type IncidentPresenterCtx,
} from "../scenarios/_buildApp";
import type { PresenterWorld } from "../scenarios/_world";

// String-literal stand-ins for ConnectionStatus const enum values.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;

const CS_DISCONNECTED = "DISCONNECTED" as unknown as ConnectionStatus;

interface IncidentStepCtx extends IncidentPresenterCtx {
  /** Keeps status$ shareReplay warm across all steps (continuous-subscription invariant). */
  statusSub: Subscription;
}

/** Per-scenario incident app, keyed by the cucumber world object. */
const incidentMap = new WeakMap<PresenterWorld, IncidentStepCtx>();

After(function cleanupIncidentAppAfter(this: PresenterWorld) {
  const ctx = incidentMap.get(this);

  if (ctx) {
    ctx.statusSub.unsubscribe();
    ctx.bridgeSub.unsubscribe();
    ctx.app.presenters.incident.dispose();
    incidentMap.delete(this);
  }
});

Given(
  "the app is connected",
  async function appIsConnected(this: PresenterWorld) {
    const incidentCtx = buildIncidentPresenterApp();
    const { app } = incidentCtx;
    // Hold one continuous subscription across all steps so shareReplay
    // refCount never hits 0 (continuous-subscription invariant).
    const statusSub = app.presenters.connection.status$.subscribe();
    incidentMap.set(this, { ...incidentCtx, statusSub });
    await this.awaitFirstWithin(
      app.presenters.connection.status$.pipe(
        filter((s) => {
          return s === CS_CONNECTED;
        }),
      ),
      5_000,
    );
  },
);

When(
  "the operator injects a {string} incident from the admin panel",
  function operatorInjectsIncident(this: PresenterWorld, kind: string) {
    const ctx = incidentMap.get(this);

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
  async function connectionBannerShowsDisconnection(this: PresenterWorld) {
    const ctx = incidentMap.get(this);

    if (!ctx) {
      throw new Error("incident app not initialised");
    }

    await this.awaitFirstWithin(
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
  function operatorClearsIncident(this: PresenterWorld) {
    const ctx = incidentMap.get(this);

    if (!ctx) {
      throw new Error("incident app not initialised");
    }

    ctx.app.presenters.incident.intents.clear();
  },
);

Then(
  "the connection is restored",
  async function connectionIsRestored(this: PresenterWorld) {
    const ctx = incidentMap.get(this);

    if (!ctx) {
      throw new Error("incident app not initialised");
    }

    await this.awaitFirstWithin(
      ctx.app.presenters.connection.status$.pipe(
        filter((s) => {
          return s === CS_CONNECTED;
        }),
      ),
      5_000,
    );
  },
);
