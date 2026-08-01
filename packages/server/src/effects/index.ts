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

/** `allEffects` plus the JARVIS_* effects. `jarvisEffects` itself always
 * registers the availability responder — even with `loop === null` — and
 * adds the per-connection session effect only when a loop is present (see
 * `createAgentLoop`'s env precedence). */
export function buildEffects(loop: AgentLoop | null): WsEffect<Ctx>[] {
  return [...allEffects, ...jarvisEffects(loop)];
}
