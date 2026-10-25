import type { BudgetState } from "../services/jarvisBudget/JarvisBudgetService.js";
import type { JarvisTier } from "../services/jarvisBudget/jarvisTier.js";
import type { Caller } from "../services/serviceContainer.js";
import type { Ctx } from "./context.js";

/** A connection's caller tier and that caller's budget, read together. */
export interface ConnectionBudget {
  readonly tier: JarvisTier;
  readonly state: BudgetState;
}

/**
 * Each connection's tier lookup, made once (spec §3.1: the role is read once
 * per connection, so a role change takes effect at the next one). Keyed by
 * the connection's scoped container — `scopeServicesToConnection` builds a
 * fresh one per socket — so the Jarvis availability, chat and Ops usage
 * effects of one socket share a single lookup, and the entry goes when the
 * socket's container does.
 */
const tierByConnection = new WeakMap<Ctx, Promise<JarvisTier>>();

/** The connection's tier. A lookup that throws or rejects reads as a
 * member: a failure must never widen what the house key pays for. */
export function readConnectionTier(
  ctx: Ctx,
  caller: Caller,
): Promise<JarvisTier> {
  let tier = tierByConnection.get(ctx);

  if (tier === undefined) {
    tier = Promise.resolve()
      .then((): Promise<JarvisTier> => {
        return ctx.jarvisTier(caller);
      })
      .catch((error: unknown): JarvisTier => {
        console.error(
          `jarvis-budget: tier lookup failed, reading the caller as a member: ${error instanceof Error ? error.message : String(error)}`,
        );

        return "member";
      });
    tierByConnection.set(ctx, tier);
  }

  return tier;
}

/** The caller's tier and budget now. Reading the budget also loads the
 * caller's copy of today's spend, which a turn's meter needs first. */
export async function readConnectionBudget(
  ctx: Ctx,
  caller: Caller,
): Promise<ConnectionBudget> {
  const tier = await readConnectionTier(ctx, caller);

  return { tier, state: await ctx.jarvisBudget.stateFor(caller, tier) };
}
