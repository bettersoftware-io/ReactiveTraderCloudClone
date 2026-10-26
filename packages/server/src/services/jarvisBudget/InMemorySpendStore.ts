import type {
  KeyKind,
  SpendOwner,
  SpendStore,
  SpendTotals,
} from "./SpendStore.js";

/** Float sums of cents-sized amounts drift (0.05 + 0.07 is
 * 0.12000000000000001); a database `numeric` does not, so neither may this. */
function roundUsd(usd: number): number {
  return Math.round(usd * 1e9) / 1e9;
}

/**
 * The spend store for a server with no Supabase project (dev, tests). It
 * mirrors `record_jarvis_spend`: house-key spend also lands in a per-day
 * house total; own-key spend never does. Lost on restart, like every other
 * in-memory store here.
 */
export function createInMemorySpendStore(): SpendStore {
  const totals = new Map<string, number>();

  function keyOf(owner: string, day: string, keyKind: KeyKind): string {
    return JSON.stringify([owner, day, keyKind]);
  }

  function totalsFor(
    owner: SpendOwner,
    day: string,
    keyKind: KeyKind,
  ): SpendTotals {
    return {
      ownerUsd: totals.get(keyOf(owner, day, keyKind)) ?? 0,
      // Own-key spend never touches the house total.
      houseUsd:
        keyKind === "house"
          ? (totals.get(keyOf("house", day, "house")) ?? 0)
          : 0,
    };
  }

  function add(
    owner: string,
    day: string,
    keyKind: KeyKind,
    usd: number,
  ): void {
    const key = keyOf(owner, day, keyKind);

    totals.set(key, roundUsd((totals.get(key) ?? 0) + usd));
  }

  return {
    kind: "in-memory",
    read(
      owner: SpendOwner,
      day: string,
      keyKind: KeyKind,
    ): Promise<SpendTotals> {
      return Promise.resolve(totalsFor(owner, day, keyKind));
    },
    record(
      owner: SpendOwner,
      day: string,
      keyKind: KeyKind,
      usd: number,
    ): Promise<SpendTotals> {
      add(owner, day, keyKind, usd);

      if (keyKind === "house") {
        add("house", day, "house", usd);
      }

      return Promise.resolve(totalsFor(owner, day, keyKind));
    },
  };
}
