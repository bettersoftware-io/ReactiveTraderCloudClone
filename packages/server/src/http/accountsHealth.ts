import type { AccountDirectory } from "../accounts/AccountDirectory.js";

type DirectoryHealth = "up" | "down" | "in-memory" | "disabled";

export interface AccountsHealth {
  read(): Promise<DirectoryHealth>;
}

interface AccountsHealthOptions {
  readonly directory: Pick<AccountDirectory, "kind" | "ping">;
  readonly cacheMs: number;
  readonly now: () => number;
}

/**
 * `/health/accounts`: one cheap read of the account store, at most once per
 * `cacheMs` (reads that arrive while it is in flight share it), so a public
 * GET cannot be turned into a query flood. The keep-alive workflow calls it
 * twice a week — that read is what keeps a free-plan Supabase project from
 * being paused for inactivity — and fails loudly on `down`, which is how a
 * paused project is noticed. Answers one of four words and nothing else: a
 * ping that throws is `down`, never its message. Never rejects.
 */
export function createAccountsHealth(
  options: AccountsHealthOptions,
): AccountsHealth {
  let readAt = Number.NEGATIVE_INFINITY;
  let latest: Promise<DirectoryHealth> = Promise.resolve("down");

  return {
    read(): Promise<DirectoryHealth> {
      if (options.directory.kind !== "supabase") {
        return Promise.resolve(options.directory.kind);
      }

      const now = options.now();

      if (now < readAt + options.cacheMs) {
        return latest;
      }

      readAt = now;
      latest = pingDirectory(options.directory);

      return latest;
    },
  };
}

async function pingDirectory(
  directory: Pick<AccountDirectory, "ping">,
): Promise<DirectoryHealth> {
  try {
    return (await directory.ping()) ? "up" : "down";
  } catch {
    return "down";
  }
}
