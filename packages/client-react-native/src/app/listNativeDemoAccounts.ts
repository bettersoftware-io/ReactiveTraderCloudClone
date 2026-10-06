import { type DemoAccount, listDemoAccounts } from "@rtc/domain";

import { DEV_CREDENTIALS } from "#/app/nativeAuthConfig";

/**
 * The sign-ins the sign-in screen may offer as a hint: the ones this
 * composition verifies on the device. In simulator mode that is the roster,
 * checked by `AuthSimulator` against `DEV_CREDENTIALS`. Against a real server
 * it is nothing — those credentials are the server's, and the app has no way
 * to know which of them work. The same rule the web clients follow.
 */
export function listNativeDemoAccounts(
  simulator: boolean,
): readonly DemoAccount[] {
  return simulator ? listDemoAccounts(DEV_CREDENTIALS) : NO_DEMO_ACCOUNTS;
}

const NO_DEMO_ACCOUNTS: readonly DemoAccount[] = [];
