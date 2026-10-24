import {
  type AccountAdminAction,
  type AccountAdminRefusal,
  type AccountSummary,
  isValidDisplayName,
  normalizeDisplayName,
} from "@rtc/domain";

import type { Caller } from "../services/serviceContainer.js";
import type {
  AccountDirectory,
  AccountRecord,
  AdminWrite,
} from "./AccountDirectory.js";
import type { AccountStatusCache } from "./accountStatusCache.js";
import type { RevocationLedger } from "./revocationLedger.js";
import { hasSessionEnded } from "./sessionEnd.js";
import type { SessionRegistry } from "./sessionRegistry.js";

export interface AccountAdminServiceDeps {
  readonly directory: AccountDirectory;
  readonly statusCache: AccountStatusCache;
  readonly sessions: SessionRegistry;
  readonly revocations: RevocationLedger;
  readonly now: () => number;
  /** `ADMIN_ACCOUNT_LIST_MAX`. */
  readonly listLimit: number;
}

export type AdminAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: AccountAdminRefusal };

export interface AccountAdminService {
  list(caller: Caller | null): Promise<AdminAnswer<readonly AccountSummary[]>>;
  act(
    caller: Caller | null,
    accountId: string,
    action: AccountAdminAction,
  ): Promise<AdminAnswer<void>>;
}

type Gate =
  | { readonly ok: true; readonly adminId: string }
  | { readonly ok: false; readonly refusal: AccountAdminRefusal };

interface Refused {
  readonly ok: false;
  readonly refusal: AccountAdminRefusal;
}

function refused(refusal: AccountAdminRefusal): Refused {
  return { ok: false, refusal };
}

/**
 * The administrator rules. The gate reads the directory itself, never the
 * status cache or the token's claims: a socket admitted hours ago must lose
 * its power the moment the record changes. Refusals carry the refusal word
 * only; nothing here logs.
 */
export function createAccountAdminService(
  deps: AccountAdminServiceDeps,
): AccountAdminService {
  async function admit(caller: Caller | null): Promise<Gate> {
    if (caller === null || caller.accountId === null) {
      return refused("forbidden");
    }

    const found = await deps.directory.findAccount(caller.accountId);

    if (found.outcome !== "found") {
      return refused(found.outcome === "missing" ? "forbidden" : "unavailable");
    }

    const record = found.account;

    // Deliberate defense in depth: `hasSessionEnded` also ends a non-active
    // account, but the gate states the rule itself rather than lean on it.
    if (record.access !== "admin" || record.status !== "active") {
      return refused("forbidden");
    }

    const verdict = hasSessionEnded(
      caller.issuedAt,
      {
        status: record.status,
        sessionsNotBefore: record.sessionsNotBefore,
      },
      deps.revocations.notBefore(record.id),
    );

    if (verdict === "unavailable") {
      return refused("unavailable");
    }

    return verdict === "ended"
      ? refused("forbidden")
      : { ok: true, adminId: record.id };
  }

  function summarize(record: AccountRecord, adminId: string): AccountSummary {
    return {
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      access: record.access,
      status: record.status,
      joinedAt: record.createdAt,
      isSelf: record.id === adminId,
    };
  }

  function write(
    accountId: string,
    action: AccountAdminAction,
    displayName: string,
  ): Promise<AdminWrite> {
    switch (action.kind) {
      case "approve": {
        return deps.directory.setApproved(accountId);
      }

      case "block": {
        return deps.directory.setBlocked(accountId, true, deps.now());
      }

      case "unblock": {
        return deps.directory.setBlocked(accountId, false, deps.now());
      }

      case "rename": {
        return deps.directory.rename(accountId, displayName, deps.now());
      }

      case "delete": {
        return deps.directory.deleteAccount(accountId);
      }
    }
  }

  return {
    async list(
      caller: Caller | null,
    ): Promise<AdminAnswer<readonly AccountSummary[]>> {
      const gate = await admit(caller);

      if (!gate.ok) {
        return gate;
      }

      const listing = await deps.directory.listAccounts(deps.listLimit);

      if (listing.outcome === "unavailable") {
        return refused("unavailable");
      }

      return {
        ok: true,
        value: listing.accounts.map((record): AccountSummary => {
          return summarize(record, gate.adminId);
        }),
      };
    },
    async act(
      caller: Caller | null,
      accountId: string,
      action: AccountAdminAction,
    ): Promise<AdminAnswer<void>> {
      const gate = await admit(caller);

      if (!gate.ok) {
        return gate;
      }

      // Sessions and caches are keyed by the canonical lowercase id.
      const target = accountId.toLowerCase();

      if (target === gate.adminId) {
        return refused("self");
      }

      let displayName = "";

      if (action.kind === "rename") {
        displayName = normalizeDisplayName(action.displayName);

        if (!isValidDisplayName(displayName)) {
          return refused("invalid_name");
        }
      }

      const written = await write(target, action, displayName);

      if (written === "unavailable") {
        // The write may still have landed (a timeout after the store
        // committed): dropping the cached status is always safe, so the next
        // upgrade reads the truth. Closing sockets on an unknown outcome is
        // not, so that waits for an answer that says the write happened.
        deps.statusCache.invalidate(target);

        return refused(written);
      }

      if (written !== "ok") {
        return refused(written);
      }

      deps.statusCache.invalidate(target);

      if (
        action.kind === "block" ||
        action.kind === "rename" ||
        action.kind === "delete"
      ) {
        deps.sessions.closeAll(target);
      }

      return { ok: true, value: undefined };
    },
  };
}
