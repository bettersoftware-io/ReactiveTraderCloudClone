import { firstValueFrom, toArray } from "rxjs";
import { describe, expect, it } from "vitest";

import { createUnavailableAccountAdmin } from "./accountAdminPort.js";

describe("createUnavailableAccountAdmin", () => {
  it("answers unavailable once, then completes, for listAccounts", async () => {
    const answers = await firstValueFrom(
      createUnavailableAccountAdmin().listAccounts().pipe(toArray()),
    );

    expect(answers).toEqual([{ ok: false, reason: "unavailable" }]);
  });

  it("answers unavailable once, then completes, for actOn", async () => {
    const answers = await firstValueFrom(
      createUnavailableAccountAdmin()
        .actOn("id", { kind: "delete" })
        .pipe(toArray()),
    );

    expect(answers).toEqual([{ ok: false, reason: "unavailable" }]);
  });
});
