import type { WsEffect } from "@rtc/ws-effects";

import { adminEffects } from "./admin.effects.js";
import type { Ctx } from "./context.js";
import { creditEffects } from "./credit.effects.js";
import { equitiesEffects } from "./equities.effects.js";
import { fxEffects } from "./fx.effects.js";

export const allEffects: WsEffect<Ctx>[] = [
  ...fxEffects,
  ...creditEffects,
  ...adminEffects,
  ...equitiesEffects,
];
