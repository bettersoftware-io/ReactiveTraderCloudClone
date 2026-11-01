import type { WsEffect } from "@better-software/rx-ws-effects";

import type { JarvisLoops, OwnKeyLoopBuilder } from "../agent/agentLoop.js";
import { accountAdminEffects } from "./accountAdmin.effects.js";
import type { Ctx } from "./context.js";
import { creditEffects } from "./credit.effects.js";
import { equitiesEffects } from "./equities.effects.js";
import { fxEffects } from "./fx.effects.js";
import { jarvisEffects } from "./jarvis.effects.js";
import { opsEffects } from "./ops.effects.js";
import { opsJarvisUsageEffects } from "./opsJarvisUsage.effects.js";

// `opsJarvisUsageEffects` reads only `ctx.usageMeter` and `ctx.jarvisBudget`,
// which are always present on the `ServiceContainer`, so it belongs with the
// rest of the shared set, apart from the effects `buildEffects` adds.
export const allEffects: WsEffect<Ctx>[] = [
  ...fxEffects,
  ...creditEffects,
  ...opsEffects,
  ...opsJarvisUsageEffects,
  ...equitiesEffects,
  ...accountAdminEffects,
];

/** `allEffects` plus the JARVIS_* effects. */
export function buildEffects(
  loops: JarvisLoops,
  buildOwnKeyLoop: OwnKeyLoopBuilder,
): WsEffect<Ctx>[] {
  return [...allEffects, ...jarvisEffects(loops, buildOwnKeyLoop)];
}
