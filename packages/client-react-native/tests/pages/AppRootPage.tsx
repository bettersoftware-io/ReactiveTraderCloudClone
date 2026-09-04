// packages/client-react-native/tests/pages/AppRootPage.tsx
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { AppRoot } from "#/app/AppRoot";

export interface AppRootPage {
  /** Mounts `<AppRoot simulator><Text>{text}</Text></AppRoot>`, keeping the
   * render result so `unmount()` can be called on it afterwards. */
  mountChild(text: string): Promise<void>;
  hasText(text: string): boolean;
  /** Unmounts the tree `mountChild` produced — the assertion under test is
   * that this resolves without throwing/rejecting. */
  unmount(): Promise<void>;
  mountAuthProbe(): Promise<void>;
  authStatus(): unknown;
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
    async unmount(): Promise<void> {
      if (!unmountTree) {
        throw new Error("mountChild() must be called before unmount()");
      }

      await unmountTree();
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
    authStatus(): unknown {
      return screen.getByTestId("auth-status").props.children;
    },
  };
}
