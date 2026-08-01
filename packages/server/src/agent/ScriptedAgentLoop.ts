import { type Observable, of } from "rxjs";

import type { JarvisEvent } from "@rtc/shared";
import { ScriptedJarvisEngine } from "@rtc/shared";

import type { ServiceContainer } from "../services/serviceContainer.js";
import type { AgentLoop } from "./agentLoop.js";

/**
 * `AgentLoop` over the scripted brain: wraps `ScriptedJarvisEngine` with the
 * container's domain simulators as its ports — they implement the exact
 * port interfaces `ScriptedJarvisDeps` expects, so they pass straight
 * through. `of(false)`: the server always paces deltas (no instant-reveal
 * shortcut — that's a client-side reduced-motion/Freeze concern).
 */
export class ScriptedAgentLoop implements AgentLoop {
  private readonly engine: ScriptedJarvisEngine;

  constructor(services: ServiceContainer) {
    this.engine = new ScriptedJarvisEngine({
      referenceData: services.referenceData,
      pricing: services.pricing,
      blotter: services.blotter,
      analytics: services.analytics,
      execution: services.execution,
      instantReveal$: of(false),
    });
  }

  runTurn(text: string): Observable<JarvisEvent> {
    return this.engine.ask(text);
  }

  resolveConfirmation(confirmationId: string, approved: boolean): void {
    this.engine.confirm(confirmationId, approved);
  }
}
