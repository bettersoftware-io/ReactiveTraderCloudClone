import type { WsEffect } from "@rtc/ws-effects";

import type { AgentLoop } from "../agent/agentLoop.js";
import { adminEffects } from "./admin.effects.js";
import type { Ctx } from "./context.js";
import { creditEffects } from "./credit.effects.js";
import { equitiesEffects } from "./equities.effects.js";
import { fxEffects } from "./fx.effects.js";
import { jarvisEffects } from "./jarvis.effects.js";

export const allEffects: WsEffect<Ctx>[] = [
  ...fxEffects,
  ...creditEffects,
  ...adminEffects,
  ...equitiesEffects,
];

/** `allEffects` plus the JARVIS_* effects when `loop` is present. `loop` is
 * null unless RTC_JARVIS_FAKE=1 (see `createAgentLoop`), so the Jarvis wire
 * handlers are simply absent — not registered-but-inert — when it's off. */
export function buildEffects(loop: AgentLoop | null): WsEffect<Ctx>[] {
  return loop === null ? allEffects : [...allEffects, ...jarvisEffects(loop)];
}
