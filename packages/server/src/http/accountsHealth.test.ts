import { describe, expect, it } from "vitest";

import type { AccountDirectory } from "#/accounts/AccountDirectory";
import { createDisabledAccountDirectory } from "#/accounts/DisabledAccountDirectory";
import { createAccountsHealth } from "#/http/accountsHealth";

describe("accountsHealth", () => {
  it("names a disabled and an in-memory directory without pinging", async () => {
    let pings = 0;
    const disabled = createAccountsHealth({
      directory: createCountingDirectory("disabled", () => {
        pings += 1;
      }),
      cacheMs: 60_000,
      now: createClock(),
    });

    const inMemory = createAccountsHealth({
      directory: createCountingDirectory("in-memory", () => {
        pings += 1;
      }),
      cacheMs: 60_000,
      now: createClock(),
    });

    expect(await disabled.read()).toBe("disabled");
    expect(await inMemory.read()).toBe("in-memory");
    expect(pings).toBe(0);
  });

  it("pings a supabase directory at most once per cache window", async () => {
    let pings = 0;
    let up = true;
    let now = 1_000;
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      kind: "supabase",
      ping: (): Promise<boolean> => {
        pings += 1;

        return Promise.resolve(up);
      },
    };

    const health = createAccountsHealth({
      directory,
      cacheMs: 60_000,
      now: (): number => {
        return now;
      },
    });

    expect(await health.read()).toBe("up");
    up = false;
    now = 60_999;
    expect(await health.read()).toBe("up");
    expect(pings).toBe(1);

    now = 61_000;
    expect(await health.read()).toBe("down");
    expect(pings).toBe(2);
  });

  it("shares one ping between reads that arrive while it is in flight", async () => {
    let pings = 0;
    const answers: ((up: boolean) => void)[] = [];
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      kind: "supabase",
      ping: (): Promise<boolean> => {
        pings += 1;

        return new Promise<boolean>((resolve) => {
          answers.push(resolve);
        });
      },
    };

    const health = createAccountsHealth({
      directory,
      cacheMs: 60_000,
      now: createClock(),
    });

    const first = health.read();
    const second = health.read();

    for (const answer of answers) {
      answer(true);
    }

    expect(await first).toBe("up");
    expect(await second).toBe("up");
    expect(pings).toBe(1);
  });

  it("reads a ping that throws as `down` — never the error itself", async () => {
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      kind: "supabase",
      ping: (): Promise<boolean> => {
        return Promise.reject(
          new Error("https://secret-project.supabase.co sb_secret_x failed"),
        );
      },
    };

    const health = createAccountsHealth({
      directory,
      cacheMs: 60_000,
      now: createClock(),
    });

    expect(await health.read()).toBe("down");
  });
});

function createClock(): () => number {
  return (): number => {
    return 1_000;
  };
}

function createCountingDirectory(
  kind: "disabled" | "in-memory",
  countPing: () => void,
): AccountDirectory {
  return {
    ...createDisabledAccountDirectory(),
    kind,
    ping: (): Promise<boolean> => {
      countPing();

      return Promise.resolve(true);
    },
  };
}
