import type { PageContext } from "@ui-contract/harness/component";
import { RoutedComponent } from "@ui-contract/harness/RoutedComponent";

import {
  HeaderChromePage,
  type HeaderChromeProps,
} from "../chrome/HeaderChromePage";
import { LoginScreenPage } from "./LoginScreenPage";

/**
 * Page object for the real `App` shell under the real `AuthGate`, as
 * `AppRoot` mounts them (the `AuthGatedAppShell` token): signing in
 * unmounts `LoginScreen` for the app, signing out the reverse, over one
 * World and one page history. Composes the login and header page objects
 * over the same root; both are pure DOM queries against it, so the
 * props-less context passes straight through (the `JarvisDriverPage` cast).
 */
export class AuthGatedAppPage extends RoutedComponent<Record<string, never>> {
  readonly login: LoginScreenPage;

  readonly header: HeaderChromePage;

  constructor(ctx: PageContext<Record<string, never>>) {
    super(ctx);
    this.login = new LoginScreenPage(ctx);
    this.header = new HeaderChromePage(
      ctx as unknown as PageContext<HeaderChromeProps>,
    );
  }

  /** True while the gate shows the login screen rather than the app. */
  showsLogin(): boolean {
    return this.login.hasRoot();
  }

  /** Signs in through the auth seam: the login screen unmounts and the app
   * mounts. */
  signIn(): void {
    this.setAuthStatus("authenticated");
  }

  /** Signs out through the auth seam: the app unmounts and the login
   * screen mounts. */
  signOut(): void {
    this.setAuthStatus("unauthenticated");
  }
}
