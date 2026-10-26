import type { WsEffect } from "@rtc/ws-effects";

import type { JarvisLoops } from "../agent/agentLoop.js";
import { accountAdminEffects } from "./accountAdmin.effects.js";
import type { Ctx } from "./context.js";
import { creditEffects } from "./credit.effects.js";
import { equitiesEffects } from "./equities.effects.js";
import { fxEffects } from "./fx.effects.js";
import { jarvisEffects } from "./jarvis.effects.js";
import { opsEffects } from "./ops.effects.js";
import { opsJarvisUsageEffects } from "./opsJarvisUsage.effects.js";

// `opsJarvisUsageEffects` reads only `ctx.usageMeter` and `ctx.jarvisBudget`,
// which are always present on the `ServiceContainer` regardless of whether
// Jarvis itself is wired — so it belongs in the unconditional set, not behind
// `buildEffects`' `loops` gate (the ops usage dock stays queryable even with
// Jarvis absent, correctly reporting an all-zero snapshot).
export const allEffects: WsEffect<Ctx>[] = [
  ...fxEffects,
  ...creditEffects,
  ...opsEffects,
  ...opsJarvisUsageEffects,
  ...equitiesEffects,
  ...accountAdminEffects,
];

/** `allEffects` plus the JARVIS_* effects. `jarvisEffects` itself always
 * registers the availability responder — even with `loops === null` — and
 * adds the per-connection session effect only when a loop set is present
 * (see `createJarvisLoops`'s env precedence). */
export function buildEffects(loops: JarvisLoops | null): WsEffect<Ctx>[] {
  return [...allEffects, ...jarvisEffects(loops)];
}
