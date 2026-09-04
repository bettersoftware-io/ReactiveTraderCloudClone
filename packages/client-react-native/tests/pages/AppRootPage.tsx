// packages/client-react-native/tests/pages/AppRootPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import type { AuthStatus } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

import { AppRoot } from "#/app/AppRoot";

export interface AppRootPage {
  /** Mounts `<AppRoot simulator><Text>{text}</Text></AppRoot>`, keeping the
   * render result so `unmount()` can be called on it afterwards. */
  mountChild(text: string): Promise<void>;
  hasText(text: string): boolean;
  /** Unmounts the tree `mountChild` produced. Returns the real
   * `RenderResult["unmount"]` promise (not an `await`-then-discard wrapper)
   * — the spec asserts `resolves.toBeUndefined()` against this, which an
   * `async unmount(): Promise<void> { await unmountTree(); }` shape would
   * make unconditionally true (an `async` function that awaits and returns
   * nothing always resolves to `undefined`, regardless of what the awaited
   * call actually resolved to). */
  unmount(): Promise<unknown>;
  unmountAll(): Promise<void>;
  mountAuthProbe(): Promise<void>;
  authStatus(): AuthStatus;
}

/** The framework surface for `AppRoot.test.tsx`. Relies on the spec's own
 * `jest.mock` of `@react-native-async-storage/async-storage` and
 * `#/app/devtools/nativeDevtoolsHub`, hoisted above every import in the spec
 * file. */
export function appRootPage(): AppRootPage {
  let unmountTree: (() => Promise<void>) | undefined;

  return {
    async mountChild(text: string): Promise<void> {
      const view = await render(
        <AppRoot simulator>
          <Text>{text}</Text>
        </AppRoot>,
      );
      unmountTree = view.unmount;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    unmount(): Promise<unknown> {
      if (!unmountTree) {
        throw new Error("mountChild() must be called before unmount()");
      }

      return unmountTree();
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    async mountAuthProbe(): Promise<void> {
      // Nested inside the factory body (not module scope) so the file has no
      // unexported top-level component — mirrors ThemeProvider.test.tsx's
      // `renderProbe` and satisfies Biome's useComponentExportOnlyModules.
      function AuthProbe(): React.JSX.Element {
        const { useAuth } = useViewModel();
        const { state } = useAuth();
        return <Text testID="auth-status">{state.status}</Text>;
      }

      await render(
        <AppRoot simulator>
          <AuthProbe />
        </AppRoot>,
      );
    },
    authStatus(): AuthStatus {
      return screen.getByTestId("auth-status").props.children as AuthStatus;
    },
  };
}
