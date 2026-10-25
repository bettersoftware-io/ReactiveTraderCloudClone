import type { SupabaseDirectoryOptions } from "#/accounts/SupabaseAccountDirectory.js";
import {
  createSupabaseRestClient,
  readField,
  readString,
} from "#/accounts/supabaseRest.js";

import type {
  KeyKind,
  SpendOwner,
  SpendStore,
  SpendTotals,
} from "./SpendStore.js";

const HOUSE_OWNER = "house";

/** PostgREST returns `numeric` as a JSON number or, when it would lose
 * precision, a string. Both are read; anything not finite is rejected. */
function readUsd(value: unknown): number | null {
  const parsed =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/**
 * The spend store over the `jarvis_spend_daily` table and the
 * `record_jarvis_spend` function, reached with the server's secret key over
 * plain `fetch` like the account directory. A timeout, a network failure, any
 * 5xx, a refusal or a body that is not the expected shape is `unavailable` —
 * the caller treats that as "do not spend the house's money".
 */
export function createSupabaseSpendStore(
  options: SupabaseDirectoryOptions,
): SpendStore {
  const { call } = createSupabaseRestClient(options);

  return {
    kind: "supabase",

    async read(
      owner: SpendOwner,
      day: string,
      keyKind: KeyKind,
    ): Promise<SpendTotals | "unavailable"> {
      const reply = await call({
        method: "GET",
        path: readPath(owner, day, keyKind),
      });

      if (reply.kind !== "ok" || !Array.isArray(reply.body)) {
        return "unavailable";
      }

      let ownerUsd = 0;
      let houseUsd = 0;

      for (const row of reply.body) {
        const usd = readUsd(readField(row, "spend_usd"));
        const rowOwner = readString(row, "owner");

        if (usd === null || rowOwner === null) {
          return "unavailable";
        }

        if (rowOwner === owner) {
          ownerUsd += usd;
        } else if (rowOwner === HOUSE_OWNER) {
          houseUsd += usd;
        }
      }

      return { ownerUsd, houseUsd };
    },

    async record(
      owner: SpendOwner,
      day: string,
      keyKind: KeyKind,
      usd: number,
    ): Promise<SpendTotals | "unavailable"> {
      const reply = await call({
        method: "POST",
        path: "/rest/v1/rpc/record_jarvis_spend",
        body: { p_owner: owner, p_day: day, p_key_kind: keyKind, p_usd: usd },
      });

      // A `returns table` function answers a one-row array.
      if (reply.kind !== "ok" || !Array.isArray(reply.body)) {
        return "unavailable";
      }

      return toTotals(reply.body[0]);
    },
  };
}

/** The read: the owner's row and the house row for one day and key kind.
 * The top-level filters take plain percent-encoded values (PostgREST does
 * not strip quotes there); inside `in.(…)` each item is double-quoted so the
 * `:` in an owner key is part of the value. */
function readPath(owner: SpendOwner, day: string, keyKind: KeyKind): string {
  const owners = [owner, HOUSE_OWNER]
    .map((value) => {
      return encodeURIComponent(`"${value}"`);
    })
    .join(",");

  return (
    "/rest/v1/jarvis_spend_daily?select=owner,spend_usd" +
    `&day=eq.${encodeURIComponent(day)}` +
    `&key_kind=eq.${encodeURIComponent(keyKind)}` +
    `&owner=in.(${owners})`
  );
}

function toTotals(row: unknown): SpendTotals | "unavailable" {
  const ownerUsd = readUsd(readField(row, "owner_usd"));
  const houseUsd = readUsd(readField(row, "house_usd"));

  return ownerUsd === null || houseUsd === null
    ? "unavailable"
    : { ownerUsd, houseUsd };
}
