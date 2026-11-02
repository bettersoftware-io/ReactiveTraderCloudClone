import type { TestContext } from "../testContext.ts";
import { assertEquals, assertFalse, assertTrue } from "./assert.ts";

const SERVER_ANSWER_SECONDS = 20;

/** Opens Preferences and waits for the modal. */
export async function openPreferences(ctx: TestContext): Promise<void> {
  await ctx.po.preferences.open();
  await ctx.po.preferences.waitModalVisible(5_000);
}

/** Closes Preferences with its footer DONE button. */
export async function closePreferences(ctx: TestContext): Promise<void> {
  await ctx.po.preferences.close();
  await ctx.po.preferences.waitModalHidden(5_000);
}

/**
 * Saves `key` in the open Preferences and waits for the server to accept it.
 * The saved readout shows the masked form, never the key.
 */
export async function saveKeyAndExpectAccepted(
  ctx: TestContext,
  key: string,
): Promise<void> {
  await ctx.po.preferences.saveOwnKey(key);
  await ctx.po.preferences.waitOwnKeyStatus(
    "Accepted",
    SERVER_ANSWER_SECONDS * 1_000,
  );

  const masked = await ctx.po.preferences.ownKeyMasked();
  assertFalse(masked.includes(key), "the saved readout shows the whole key");
  assertTrue(masked.length > 0, "the saved readout is empty");
}

/** With Preferences open after a reload: the key is still saved, and the
 *  server accepts it again on the new connection. */
export async function expectKeyRestoredAndAccepted(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.preferences.waitOwnKeyStatus(
    "Accepted",
    SERVER_ANSWER_SECONDS * 1_000,
  );
  assertTrue(
    (await ctx.po.preferences.ownKeyMasked()).length > 0,
    "no saved key after the reload",
  );
}

/** Picks the own-key brain `brain` in the open Preferences. */
export async function chooseOwnBrain(
  ctx: TestContext,
  brain: string,
): Promise<void> {
  await ctx.po.preferences.chooseOwnBrain(brain, SERVER_ANSWER_SECONDS * 1_000);
}

/** Asks a live-desk question and expects the reply tagged with `brainName`:
 *  the turn ran on the person's key, not the house's. */
export async function expectReplyRanOnBrain(
  ctx: TestContext,
  brainName: string,
): Promise<void> {
  await ctx.po.jarvis.openViaOrb();
  await ctx.po.jarvis.waitForOverlayVisible();
  await ctx.po.jarvis.ask("Where is EURUSD?");
  await ctx.po.jarvis.waitForNonNarratorReplyDone(
    SERVER_ANSWER_SECONDS * 1_000,
  );
  await ctx.po.jarvis.waitForNonNarratorReplyBrainTag(
    brainName,
    SERVER_ANSWER_SECONDS * 1_000,
  );
  await ctx.po.jarvis.closeViaButton();
}

/** Signs out and expects the login screen with no own key left in either
 *  browser storage. */
export async function signOutAndExpectNoKeyInStorage(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.preferences.ownKeyInBrowserStorage(),
    "the key was never in browser storage, so the wipe below proves nothing",
  );
  await ctx.po.preferences.signOut();
  await ctx.po.preferences.waitSignedOut(10_000);
  assertEquals(await ctx.po.preferences.ownKeyInBrowserStorage(), false);
}
