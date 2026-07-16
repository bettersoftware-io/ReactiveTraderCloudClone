import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for AuthGate. The gate renders `LoginScreen` while
 * `useAuth().state.status !== "authenticated"`, and the gated app content
 * (children) once authenticated. The harness mounts AuthGate around a
 * sentinel child (data-testid "auth-gate-child") so a spec can assert whether
 * the app content is mounted, without depending on the real App tree.
 */
export class AuthGatePage extends MountedComponent<Record<string, never>> {
  /** True when the LoginScreen overlay is mounted. */
  showsLogin(): boolean {
    return within(this.root).queryByTestId("login-screen") !== null;
  }

  /** True when the gated app content (children) is mounted. */
  showsChildren(): boolean {
    return within(this.root).queryByTestId("auth-gate-child") !== null;
  }
}
