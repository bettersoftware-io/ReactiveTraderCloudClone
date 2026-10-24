import { describe, expect, it } from "vitest";

import { createDisabledAccountDirectory } from "#/accounts/DisabledAccountDirectory";

describe("DisabledAccountDirectory — admin operations", () => {
  it("lists nothing: unavailable", async () => {
    expect(await createDisabledAccountDirectory().listAccounts(500)).toEqual({
      outcome: "unavailable",
    });
  });

  it("every write is unavailable", async () => {
    const directory = createDisabledAccountDirectory();

    expect(await directory.setApproved(ID)).toBe("unavailable");
    expect(await directory.setBlocked(ID, true, 1)).toBe("unavailable");
    expect(await directory.rename(ID, "Ann", 1)).toBe("unavailable");
    expect(await directory.deleteAccount(ID)).toBe("unavailable");
    expect(await directory.revokeSessions(ID, 1)).toBe("unavailable");
  });
});

const ID = "1f3a9c2e-0000-4000-8000-000000000000";
