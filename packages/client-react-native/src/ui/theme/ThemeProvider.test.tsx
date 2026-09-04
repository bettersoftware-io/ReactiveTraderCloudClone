// packages/client-react-native/src/ui/theme/ThemeProvider.test.tsx
import { afterEach, expect, test } from "@jest/globals";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { themeProviderPage } from "#tests/pages/ThemeProviderPage";

const page = themeProviderPage();

afterEach(() => {
  return page.unmountAll();
});

test("provides the token cell for the resolved skin × mode", async () => {
  await page.mount("terminal", "light");
  expect(page.bgTile()).toBe(rnThemeTokens.terminal.light.bgTile);
});

test("useTheme throws outside a provider", async () => {
  // RNTL 14's render is async: the guard throws during the act flush, so the
  // render promise rejects rather than throwing synchronously.
  await expect(page.mountBare()).rejects.toThrow(/ThemeProvider/);
});

test("fills the platform system monospace for the classic skin", async () => {
  // classic bundles no mono font (token `fontMono` is undefined); the provider
  // must resolve it to a real platform monospace so digits align. Before the
  // resolution this rendered `undefined`.
  await page.mount("classic", "dark");
  const mono = page.fontMono();
  expect(typeof mono).toBe("string");
  expect((mono as string).length).toBeGreaterThan(0);
});
