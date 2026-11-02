import { describe, expect, it, vi } from "vitest";

import type { AccountAdminAction } from "@rtc/domain";

import type { AccountDirectory } from "#/accounts/AccountDirectory";
import {
  type AccountAdminService,
  createAccountAdminService,
} from "#/accounts/accountAdminService";
import type { AccountStatusCache } from "#/accounts/accountStatusCache";
import type { DevAccountSeed } from "#/accounts/devAccounts";
import { createInMemoryAccountDirectory } from "#/accounts/InMemoryAccountDirectory";
import { createRevocationLedger } from "#/accounts/revocationLedger";
import type { SessionRegistry } from "#/accounts/sessionRegistry";
import { createInMemorySpendStore } from "#/services/jarvisBudget/InMemorySpendStore";
import type {
  SpendOwner,
  SpendStore,
} from "#/services/jarvisBudget/SpendStore";
import type { Caller } from "#/services/serviceContainer";

describe("AccountAdminService", () => {
  describe("the caller gate", () => {
    it("refuses a null caller forbidden", async () => {
      const { service } = createFixture();

      expect(await service.list(null)).toEqual(createForbidden());
      expect(await service.act(null, OTHER_ID, { kind: "approve" })).toEqual(
        createForbidden(),
      );
    });

    it("refuses a roster caller forbidden", async () => {
      const { service } = createFixture();
      const roster: Caller = {
        username: "trader1",
        accountId: null,
        issuedAt: null,
      };

      expect(await service.list(roster)).toEqual(createForbidden());
    });

    it("refuses a caller whose account is missing forbidden", async () => {
      const { service } = createFixture();

      expect(await service.list(createCaller(MISSING_ID))).toEqual(
        createForbidden(),
      );
    });

    it("refuses a demoted administrator (current access is user)", async () => {
      const { service } = createFixture();

      expect(await service.list(createCaller(DEMOTED_ID))).toEqual(
        createForbidden(),
      );
      expect(
        await service.act(createCaller(DEMOTED_ID), OTHER_ID, {
          kind: "approve",
        }),
      ).toEqual(createForbidden());
    });

    it("refuses a blocked administrator", async () => {
      const { service } = createFixture();

      expect(await service.list(createCaller(BLOCKED_ADMIN_ID))).toEqual(
        createForbidden(),
      );
    });

    it("refuses an administrator whose stamp is after their issued-at", async () => {
      const { service, directory } = createFixture();
      await directory.revokeSessions(ADMIN_ID, ISSUED_AT + 1);

      expect(await service.list(createCaller(ADMIN_ID))).toEqual(
        createForbidden(),
      );
    });

    it("refuses an administrator whose ledger stamp is after their issued-at", async () => {
      const { service, revocations } = createFixture();
      revocations.record(ADMIN_ID, ISSUED_AT + 1);

      expect(await service.list(createCaller(ADMIN_ID))).toEqual(
        createForbidden(),
      );
    });

    it("refuses a token without an issued-at", async () => {
      const { service } = createFixture();

      expect(
        await service.list({
          username: "Desk Admin",
          accountId: ADMIN_ID,
          issuedAt: null,
        }),
      ).toEqual(createForbidden());
    });

    it("lets a token issued exactly at the stamp through", async () => {
      const { service, directory } = createFixture();
      await directory.revokeSessions(ADMIN_ID, ISSUED_AT);

      expect((await service.list(createCaller(ADMIN_ID))).ok).toBe(true);
    });

    it("answers unavailable when the directory is down", async () => {
      const { service } = createFixture({ down: true });

      expect(await service.list(createCaller(ADMIN_ID))).toEqual({
        ok: false,
        refusal: "unavailable",
      });
    });
  });

  describe("act refusals", () => {
    it.each(createActions())(
      "refuses $kind on the caller's own account as self",
      async (action) => {
        const { service, writes } = createFixture();

        expect(
          await service.act(createCaller(ADMIN_ID), ADMIN_ID, action),
        ).toEqual({ ok: false, refusal: "self" });
        expect(writes).toHaveBeenCalledTimes(0);
      },
    );

    it("refuses self before it validates the rename", async () => {
      const { service, writes } = createFixture();

      expect(
        await service.act(createCaller(ADMIN_ID), ADMIN_ID, {
          kind: "rename",
          displayName: "Ann\u200b",
        }),
      ).toEqual({ ok: false, refusal: "self" });
      expect(writes).toHaveBeenCalledTimes(0);
    });

    it("refuses the caller's own id in uppercase as self with no write", async () => {
      const { service, writes, cache, sessions } = createFixture();

      expect(
        await service.act(createCaller(ADMIN_ID), ADMIN_ID.toUpperCase(), {
          kind: "block",
        }),
      ).toEqual({ ok: false, refusal: "self" });
      expect(writes).toHaveBeenCalledTimes(0);
      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(sessions.closeAll).not.toHaveBeenCalled();
    });

    it("blocks an uppercase id and closes the lowercase one", async () => {
      const { service, directory, cache, sessions } = createFixture();

      expect(
        await service.act(createCaller(ADMIN_ID), OTHER_ID.toUpperCase(), {
          kind: "block",
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(await directory.findAccount(OTHER_ID)).toMatchObject({
        account: { status: "blocked" },
      });
      expect(cache.invalidate).toHaveBeenCalledWith(OTHER_ID);
      expect(sessions.closeAll).toHaveBeenCalledWith(OTHER_ID);
    });

    it.each(["Ann​", "", "   "])(
      "refuses the rename %j as invalid_name with no write",
      async (displayName) => {
        const { service, writes, cache, sessions } = createFixture();

        expect(
          await service.act(createCaller(ADMIN_ID), OTHER_ID, {
            kind: "rename",
            displayName,
          }),
        ).toEqual({ ok: false, refusal: "invalid_name" });
        expect(writes).toHaveBeenCalledTimes(0);
        expect(cache.invalidate).not.toHaveBeenCalled();
        expect(sessions.closeAll).not.toHaveBeenCalled();
      },
    );

    it.each(createActions())(
      "answers not_found for $kind on an unknown account",
      async (action) => {
        const { service, cache, sessions } = createFixture();

        expect(
          await service.act(createCaller(ADMIN_ID), MISSING_ID, action),
        ).toEqual({ ok: false, refusal: "not_found" });
        expect(cache.invalidate).not.toHaveBeenCalled();
        expect(sessions.closeAll).not.toHaveBeenCalled();
      },
    );

    it.each(createActions())(
      "passes unavailable through for $kind, invalidates the cached status (the write may have landed) and closes nothing",
      async (action) => {
        const { service, cache, sessions } = createFixture({
          writesDown: true,
        });

        expect(
          await service.act(createCaller(ADMIN_ID), OTHER_ID, action),
        ).toEqual({ ok: false, refusal: "unavailable" });
        expect(cache.invalidate).toHaveBeenCalledTimes(1);
        expect(cache.invalidate).toHaveBeenCalledWith(OTHER_ID);
        expect(sessions.closeAll).not.toHaveBeenCalled();
      },
    );
  });

  describe("act successes", () => {
    it("approve activates the account and only invalidates", async () => {
      const { service, directory, cache, sessions } = createFixture();

      expect(
        await service.act(createCaller(ADMIN_ID), OTHER_ID, {
          kind: "approve",
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(await directory.findAccount(OTHER_ID)).toMatchObject({
        outcome: "found",
        account: { status: "active" },
      });
      expect(cache.invalidate).toHaveBeenCalledWith(OTHER_ID);
      expect(sessions.closeAll).not.toHaveBeenCalled();
    });

    it("block stamps, invalidates, then closes the sockets", async () => {
      const { service, directory, cache, sessions, order } = createFixture();

      expect(
        await service.act(createCaller(ADMIN_ID), OTHER_ID, { kind: "block" }),
      ).toEqual({ ok: true, value: undefined });

      const found = await directory.findAccount(OTHER_ID);

      expect(found).toMatchObject({
        outcome: "found",
        account: { status: "blocked", sessionsNotBefore: NOW },
      });
      expect(cache.invalidate).toHaveBeenCalledWith(OTHER_ID);
      expect(sessions.closeAll).toHaveBeenCalledWith(OTHER_ID);
      expect(order).toEqual(["invalidate", "closeAll"]);
    });

    it("unblock invalidates and does not close the sockets", async () => {
      const { service, directory, cache, sessions } = createFixture();
      await directory.setBlocked(OTHER_ID, true, STAMP);

      expect(
        await service.act(createCaller(ADMIN_ID), OTHER_ID, {
          kind: "unblock",
        }),
      ).toEqual({ ok: true, value: undefined });
      // Back to the seeded status; the block's stamp is left as it was.
      expect(await directory.findAccount(OTHER_ID)).toMatchObject({
        outcome: "found",
        account: { status: "pending", sessionsNotBefore: STAMP },
      });
      expect(cache.invalidate).toHaveBeenCalledWith(OTHER_ID);
      expect(sessions.closeAll).not.toHaveBeenCalled();
    });

    it("rename stores the normalized name, stamps, and closes the sockets", async () => {
      const { service, directory, cache, sessions } = createFixture();

      expect(
        await service.act(createCaller(ADMIN_ID), OTHER_ID, {
          kind: "rename",
          displayName: " Ann  Lee ",
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(await directory.findAccount(OTHER_ID)).toMatchObject({
        outcome: "found",
        account: { displayName: "Ann Lee", sessionsNotBefore: NOW },
      });
      expect(cache.invalidate).toHaveBeenCalledWith(OTHER_ID);
      expect(sessions.closeAll).toHaveBeenCalledWith(OTHER_ID);
    });

    it("rename stores the NFKC form", async () => {
      const { service, directory } = createFixture();

      await service.act(createCaller(ADMIN_ID), OTHER_ID, {
        kind: "rename",
        displayName: "Ａnn", // fullwidth A
      });

      expect(await directory.findAccount(OTHER_ID)).toMatchObject({
        account: { displayName: "Ann" },
      });
    });

    it("delete removes the account, invalidates, and closes the sockets", async () => {
      const { service, directory, cache, sessions } = createFixture();

      expect(
        await service.act(createCaller(ADMIN_ID), OTHER_ID, {
          kind: "delete",
        }),
      ).toEqual({ ok: true, value: undefined });
      expect(await directory.findAccount(OTHER_ID)).toEqual({
        outcome: "missing",
      });
      expect(cache.invalidate).toHaveBeenCalledWith(OTHER_ID);
      expect(sessions.closeAll).toHaveBeenCalledWith(OTHER_ID);
    });

    describe("delete and the account's spend rows", () => {
      it("deletes the spend rows of that account only", async () => {
        const { service, spend } = createFixture();
        await seedSpend(spend);

        await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE);

        expect(
          await spend.read(`account:${OTHER_ID}`, "2026-10-25", "house"),
        ).toMatchObject({ ownerUsd: 0 });
        expect(
          await spend.read(`account:${OTHER_ID}`, "2026-10-26", "own"),
        ).toMatchObject({ ownerUsd: 0 });
        expect(
          await spend.read(`account:${ADMIN_ID}`, "2026-10-25", "house"),
        ).toMatchObject({ ownerUsd: 0.3 });
      });

      it("blocks, forgets the owner in the budget, deletes the spend rows, then the account", async () => {
        const { service, steps } = createFixture();

        await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE);

        expect(
          steps.filter((step) => {
            return (
              step.startsWith("account ") ||
              step.startsWith("spend ") ||
              step.startsWith("owner ")
            );
          }),
        ).toEqual([
          "account blocked",
          `owner forgotten account:${OTHER_ID}`,
          "spend deleted",
          "account deleted",
        ]);
      });

      it("ends the open sessions as soon as the block lands", async () => {
        const { service, sessions, cache } = createFixture({
          spendDown: true,
        });

        await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE);

        expect(sessions.closeAll).toHaveBeenCalledWith(OTHER_ID);
        expect(cache.invalidate).toHaveBeenCalledWith(OTHER_ID);
      });

      it("does not forget the owner when the block is unavailable", async () => {
        const { service, budget } = createFixture({ blockDown: true });

        await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE);

        expect(budget.forgetOwner).not.toHaveBeenCalled();
      });

      it("does nothing else when the block is unavailable", async () => {
        const { service, directory, spend, steps } = createFixture({
          blockDown: true,
        });
        await seedSpend(spend);

        expect(
          await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE),
        ).toEqual({ ok: false, refusal: "unavailable" });
        expect(steps).not.toContain("spend deleted");
        expect(steps).not.toContain("account deleted");
        expect(await directory.findAccount(OTHER_ID)).toMatchObject({
          account: { status: "pending" },
        });
      });

      it("leaves the account blocked, not deleted, when the spend delete is unavailable", async () => {
        const { service, directory, spend, steps } = createFixture({
          spendDown: true,
        });
        await seedSpend(spend);

        expect(
          await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE),
        ).toEqual({ ok: false, refusal: "unavailable" });
        expect(steps).not.toContain("account deleted");
        expect(await directory.findAccount(OTHER_ID)).toMatchObject({
          account: { status: "blocked" },
        });
        expect(
          await spend.read(`account:${OTHER_ID}`, "2026-10-25", "house"),
        ).toMatchObject({ ownerUsd: 0.1 });
      });

      it("leaves the account blocked with its spend gone when the account delete is unavailable", async () => {
        const { service, directory, spend } = createFixture({
          accountDeleteDown: true,
        });
        await seedSpend(spend);

        expect(
          await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE),
        ).toEqual({ ok: false, refusal: "unavailable" });
        expect(await directory.findAccount(OTHER_ID)).toMatchObject({
          account: { status: "blocked" },
        });
        expect(
          await spend.read(`account:${OTHER_ID}`, "2026-10-25", "house"),
        ).toMatchObject({ ownerUsd: 0 });
      });

      it.each<[string, keyof Outages]>([
        ["block", "block"],
        ["spend delete", "spend"],
        ["account delete", "account"],
      ])(
        "finishes the delete on a retry after the %s failed",
        async (_name, step) => {
          const { service, directory, outages } = createFixture({
            blockDown: step === "block",
            spendDown: step === "spend",
            accountDeleteDown: step === "account",
          });

          expect(
            await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE),
          ).toEqual({ ok: false, refusal: "unavailable" });

          outages[step] = false;

          expect(
            await service.act(createCaller(ADMIN_ID), OTHER_ID, REMOVE),
          ).toEqual({ ok: true, value: undefined });
          expect(await directory.findAccount(OTHER_ID)).toEqual({
            outcome: "missing",
          });
        },
      );

      it("answers not_found for an unknown account without touching spend", async () => {
        const { service, steps } = createFixture();

        expect(
          await service.act(createCaller(ADMIN_ID), MISSING_ID, REMOVE),
        ).toEqual({ ok: false, refusal: "not_found" });
        expect(steps).not.toContain("spend deleted");
      });

      it("leaves the account's spend rows alone for every other action", async () => {
        const { service, spend, steps } = createFixture();
        await seedSpend(spend);

        await service.act(createCaller(ADMIN_ID), OTHER_ID, {
          kind: "block",
        });

        expect(steps).not.toContain("spend deleted");
        expect(
          await spend.read(`account:${OTHER_ID}`, "2026-10-25", "house"),
        ).toMatchObject({ ownerUsd: 0.1 });
      });
    });
  });

  describe("list", () => {
    it("marks isSelf only on the caller's own row and maps joinedAt", async () => {
      const { service } = createFixture();
      const answer = await service.list(createCaller(ADMIN_ID));

      if (!answer.ok) {
        throw new Error("expected a list");
      }

      const selves = answer.value.filter((row) => {
        return row.isSelf;
      });

      expect(
        selves.map((row) => {
          return row.id;
        }),
      ).toEqual([ADMIN_ID]);
      expect(answer.value).toHaveLength(4);
      expect(
        answer.value.find((row) => {
          return row.id === ADMIN_ID;
        }),
      ).toEqual({
        id: ADMIN_ID,
        email: `${ADMIN_ID}@rtc.test`,
        displayName: "Seed a1",
        access: "admin",
        status: "active",
        joinedAt: CREATED_AT,
        isSelf: true,
      });
    });

    it("asks the directory for at most the list limit", async () => {
      const { service, listAccounts } = createFixture();
      await service.list(createCaller(ADMIN_ID));

      expect(listAccounts).toHaveBeenCalledWith(LIST_LIMIT);
    });

    it("answers unavailable when the listing fails", async () => {
      const { service } = createFixture({ listingDown: true });

      expect(await service.list(createCaller(ADMIN_ID))).toEqual({
        ok: false,
        refusal: "unavailable",
      });
    });
  });
});

const LIST_LIMIT = 77;

const REMOVE = { kind: "delete" } as const;

async function seedSpend(spend: SpendStore): Promise<void> {
  await spend.record(`account:${OTHER_ID}`, "2026-10-25", "house", 0.1);
  await spend.record(`account:${OTHER_ID}`, "2026-10-26", "own", 0.2);
  await spend.record(`account:${ADMIN_ID}`, "2026-10-25", "house", 0.3);
}

interface ForbiddenAnswer {
  readonly ok: false;
  readonly refusal: "forbidden";
}

function createForbidden(): ForbiddenAnswer {
  return { ok: false, refusal: "forbidden" };
}

function createCaller(accountId: string): Caller {
  return { username: "x", accountId, issuedAt: ISSUED_AT };
}

interface FixtureOptions {
  readonly down?: boolean;
  readonly writesDown?: boolean;
  readonly listingDown?: boolean;
  readonly spendDown?: boolean;
  readonly blockDown?: boolean;
  readonly accountDeleteDown?: boolean;
}

/** Which delete step answers `unavailable`; flip to let a retry through. */
interface Outages {
  block: boolean;
  spend: boolean;
  account: boolean;
}

interface Fixture {
  readonly service: AccountAdminService;
  readonly directory: AccountDirectory;
  readonly revocations: ReturnType<typeof createRevocationLedger>;
  readonly cache: { invalidate: ReturnType<typeof vi.fn> } & AccountStatusCache;
  readonly sessions: {
    closeAll: ReturnType<typeof vi.fn>;
  } & SessionRegistry;
  /** Every directory write that actually ran (approve/block/rename/delete). */
  readonly writes: ReturnType<typeof vi.fn>;
  readonly listAccounts: ReturnType<typeof vi.fn>;
  readonly order: string[];
  readonly steps: string[];
  readonly spend: SpendStore;
  readonly outages: Outages;
  readonly budget: { forgetOwner: ReturnType<typeof vi.fn> };
}

function createFixture(options: FixtureOptions = {}): Fixture {
  const seeds: readonly DevAccountSeed[] = [
    createSeed(ADMIN_ID, "admin", "active"),
    createSeed(OTHER_ID, "user", "pending"),
    createSeed(DEMOTED_ID, "user", "active"),
    createSeed(BLOCKED_ADMIN_ID, "admin", "blocked"),
  ];
  const base = createInMemoryAccountDirectory({ now: fixedNow, seeds });
  const order: string[] = [];
  const steps: string[] = [];
  const outages: Outages = {
    block: options.blockDown === true,
    spend: options.spendDown === true,
    account: options.accountDeleteDown === true,
  };
  const memorySpend = createInMemorySpendStore();
  const budget = {
    forgetOwner: vi.fn((owner: SpendOwner): Promise<void> => {
      steps.push(`owner forgotten ${owner}`);

      return Promise.resolve();
    }),
  };

  const spend: SpendStore = {
    ...memorySpend,
    deleteOwner: (owner: SpendOwner) => {
      steps.push("spend deleted");

      return outages.spend
        ? Promise.resolve("unavailable" as const)
        : memorySpend.deleteOwner(owner);
    },
  };
  const writes = vi.fn();
  const listAccounts = vi.fn((limit: number) => {
    return options.listingDown === true
      ? Promise.resolve({ outcome: "unavailable" as const })
      : base.listAccounts(limit);
  });

  function writeThrough<A extends unknown[]>(
    run: (...args: A) => ReturnType<AccountDirectory["setApproved"]>,
  ): (...args: A) => ReturnType<AccountDirectory["setApproved"]> {
    return (...args: A) => {
      writes();

      return options.writesDown === true
        ? Promise.resolve("unavailable" as const)
        : run(...args);
    };
  }

  const directory: AccountDirectory = {
    ...base,
    findAccount: (id: string) => {
      return options.down === true
        ? Promise.resolve({ outcome: "unavailable" as const })
        : base.findAccount(id);
    },
    listAccounts,
    setApproved: writeThrough(base.setApproved),
    setBlocked: (...args: Parameters<AccountDirectory["setBlocked"]>) => {
      steps.push(args[1] ? "account blocked" : "account unblocked");

      return outages.block
        ? Promise.resolve("unavailable" as const)
        : writeThrough(base.setBlocked)(...args);
    },
    rename: writeThrough(base.rename),
    deleteAccount: (id: string) => {
      steps.push("account deleted");

      return outages.account
        ? Promise.resolve("unavailable" as const)
        : writeThrough(base.deleteAccount)(id);
    },
  };

  const cache = {
    read: vi.fn(),
    invalidate: vi.fn(() => {
      order.push("invalidate");
    }),
  } as Fixture["cache"];

  const sessions = {
    register: vi.fn(),
    epochOf: vi.fn(),
    closeAll: vi.fn(() => {
      order.push("closeAll");

      return 0;
    }),
  } as Fixture["sessions"];
  const revocations = createRevocationLedger(10);

  return {
    service: createAccountAdminService({
      directory,
      statusCache: cache,
      sessions,
      revocations,
      spend,
      budget,
      now: fixedNow,
      listLimit: LIST_LIMIT,
    }),
    directory,
    revocations,
    cache,
    sessions,
    writes,
    listAccounts,
    order,
    steps,
    spend,
    outages,
    budget,
  };
}

function fixedNow(): number {
  return NOW;
}

function createSeed(
  id: string,
  access: DevAccountSeed["access"],
  status: DevAccountSeed["status"],
): DevAccountSeed {
  return {
    id,
    email: `${id}@rtc.test`,
    displayName: `Seed ${id.slice(-2)}`,
    access,
    status,
  };
}

const NOW = 5_000;
const STAMP = 1_234;
const CREATED_AT = 5_000;
const ADMIN_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_ID = "00000000-0000-4000-8000-0000000000b1";
const DEMOTED_ID = "00000000-0000-4000-8000-0000000000c1";
const BLOCKED_ADMIN_ID = "00000000-0000-4000-8000-0000000000d1";
const MISSING_ID = "00000000-0000-4000-8000-0000000000ff";
const ISSUED_AT = 1_000;

function createActions(): readonly AccountAdminAction[] {
  return [
    { kind: "approve" },
    { kind: "block" },
    { kind: "unblock" },
    { kind: "rename", displayName: "Ann Lee" },
    { kind: "delete" },
  ];
}
