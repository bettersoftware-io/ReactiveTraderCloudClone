import { expect, jest, test } from "@jest/globals";

import { useActiveModulePage } from "#tests/pages/UseActiveModulePage";

import { MODULE_ROUTES } from "./moduleRoutes";

const mockPathname = jest.fn<() => string>();

test("derives the module from the pathname when nothing is pinned", async () => {
  mockPathname.mockReturnValue("/credit");
  const page = useActiveModulePage();
  await page.mount(undefined);
  expect(page.probeLabel()).toBe("CREDIT");
});

test("a pinned module wins over the pathname", async () => {
  mockPathname.mockReturnValue("/credit");
  const equities = MODULE_ROUTES.find((m) => {
    return m.key === "equities";
  });
  const page = useActiveModulePage();
  await page.mount(equities ?? null);
  expect(page.probeLabel()).toBe("EQUITIES");
});

test("an explicit null provider falls back to the pathname, not to RATES", async () => {
  mockPathname.mockReturnValue("/analytics");
  const page = useActiveModulePage();
  await page.mount(null);
  expect(page.probeLabel()).toBe("ANALYTICS");
});

jest.mock("expo-router", () => {
  return {
    usePathname: (): string => {
      return mockPathname();
    },
  };
});
