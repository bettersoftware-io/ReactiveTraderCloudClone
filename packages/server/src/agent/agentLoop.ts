import type { Observable } from "rxjs";

import type { JarvisEvent } from "@rtc/shared";

import type { ServiceContainer } from "../services/serviceContainer.js";
import { ScriptedAgentLoop } from "./ScriptedAgentLoop.js";

/** The P3 seam: AnthropicAgentLoop implements this same surface. */
export interface AgentLoop {
  runTurn(text: string): Observable<JarvisEvent>;
  resolveConfirmation(confirmationId: string, approved: boolean): void;
}

/** RTC_JARVIS_FAKE=1 → scripted loop; otherwise Jarvis is absent (effects
 * not registered). P3 adds the ANTHROPIC_API_KEY branch here. */
export function createAgentLoop(
  env: NodeJS.ProcessEnv,
  services: ServiceContainer,
): AgentLoop | null {
  if (env.RTC_JARVIS_FAKE === "1") {
    return new ScriptedAgentLoop(services);
  }

  return null;
}
