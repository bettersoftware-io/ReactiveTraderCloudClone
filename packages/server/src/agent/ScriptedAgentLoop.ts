import { of } from "rxjs";

import { ScriptedJarvisEngine } from "@rtc/shared";

import type { ServiceContainer } from "../services/serviceContainer.js";
import type { AgentLoop, AgentSession } from "./agentLoop.js";
import { ScriptedAgentSession } from "./ScriptedAgentSession.js";

/**
 * `AgentLoop` over the scripted brain: wraps `ScriptedJarvisEngine` with the
 * container's domain simulators as its ports — they implement the exact
 * port interfaces `ScriptedJarvisDeps` expects, so they pass straight
 * through. `of(false)`: the server always paces deltas (no instant-reveal
 * shortcut — that's a client-side reduced-motion/Freeze concern).
 *
 * The engine instance is shared process-wide (its `pendingConfirmations` map
 * is one process-wide table, keyed by unguessable per-turn ids), while
 * `createSession()` mints a fresh `ScriptedAgentSession` per socket to own
 * that socket's cancel/dispose lifecycle AND its own confirmation-ownership
 * guard independently of every other connection — see
 * `ScriptedAgentSession`'s doc comment for why that guard still matters on
 * top of a shared engine.
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

  createSession(): AgentSession {
    return new ScriptedAgentSession(this.engine);
  }
}
