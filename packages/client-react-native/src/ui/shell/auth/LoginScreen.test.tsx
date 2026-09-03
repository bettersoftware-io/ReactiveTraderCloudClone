import { afterEach, expect, jest, test } from "@jest/globals";

import { loginScreenPage } from "#tests/pages/LoginScreenPage";

const page = loginScreenPage();

afterEach(() => {
  page.unmountAll();
});

test("typing credentials then pressing AUTHENTICATE calls login with them", async () => {
  const login = jest.fn();
  await page.mount("unauthenticated", login);

  await page.typeUsername("trader1");
  await page.typePassword("s3cret");
  await page.pressSubmit();

  expect(login).toHaveBeenCalledTimes(1);
  expect(login).toHaveBeenCalledWith("trader1", "s3cret");
});

test("renders the seeded error message", async () => {
  await page.mount("unauthenticated", () => {}, {
    error: "Invalid credentials",
  });

  expect(page.errorText()).toBe("Invalid credentials");
});

test("renders no error node when state.error is null", async () => {
  await page.mount("unauthenticated", () => {});

  expect(page.exists("login-error")).toBe(false);
});

test("submit is disabled while authenticating, and pressing it does not call login", async () => {
  const login = jest.fn();
  await page.mount("authenticating", login);

  await page.pressSubmit();
  expect(login).not.toHaveBeenCalled();
});

test("toggling the sim switch calls onToggleSimulator with the new value", async () => {
  const onToggleSimulator = jest.fn();
  await page.mount("unauthenticated", () => {}, { onToggleSimulator });

  await page.toggleSimulator(true);

  expect(onToggleSimulator).toHaveBeenCalledTimes(1);
  expect(onToggleSimulator).toHaveBeenCalledWith(true);
});
