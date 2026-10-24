import type { TestContext } from "../testContext.ts";
import { loginScreenOf } from "./login.ts";

const ADMIN_TIMEOUT_MS = 10_000;

/** Open the Admin tab from the signed-in app shell. */
export async function openAdminTab(ctx: TestContext): Promise<void> {
  await loginScreenOf(ctx).openAdminTab();
}

/** Approve the pending account whose email reads `email`, and wait for its
 *  Approve button to go. */
export async function approveAccount(
  ctx: TestContext,
  email: string,
): Promise<void> {
  await loginScreenOf(ctx).approveAccount(email, ADMIN_TIMEOUT_MS);
}

/** Assert the signed-in user's header has no Admin tab. */
export async function expectAdminTabAbsent(ctx: TestContext): Promise<void> {
  await loginScreenOf(ctx).waitAdminTabAbsent(ADMIN_TIMEOUT_MS);
}

/** Open `/admin` directly in the signed-in page. */
export async function openAdminRoute(ctx: TestContext): Promise<void> {
  await loginScreenOf(ctx).openPath("/admin");
}
