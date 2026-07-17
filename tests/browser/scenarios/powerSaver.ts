import type { PowerSaverPO } from "../page-objects/contracts/PowerSaver";
import type { TestContext } from "../testContext";
import { assertEquals } from "./assert";

function powerSaverPO(ctx: TestContext): PowerSaverPO {
  const po = ctx.po.powerSaver;

  if (po === undefined) {
    throw new Error(
      "power-saver page object not available on this driver (Playwright-only)",
    );
  }

  return po;
}

export async function clickQuickToggle(ctx: TestContext): Promise<void> {
  await powerSaverPO(ctx).click();
}

export async function expectDocumentFlag(
  ctx: TestContext,
  value: "true" | "false",
): Promise<void> {
  const flag = await powerSaverPO(ctx).documentFlag();
  assertEquals(
    flag,
    value,
    `expected html[data-power-saver="${value}"], got "${flag}"`,
  );
}
