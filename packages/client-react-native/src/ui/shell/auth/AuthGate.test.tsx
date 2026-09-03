import { afterEach, expect, test } from "@jest/globals";

import { authGatePage } from "#tests/pages/AuthGatePage";

const page = authGatePage();

afterEach(() => {
  page.unmountAll();
});

test("unauthenticated: renders LoginScreen, not the children", async () => {
  await page.mount("unauthenticated");

  expect(page.exists("login-screen")).toBe(true);
  expect(page.exists("child-marker")).toBe(false);
});

test("authenticating: renders LoginScreen, not the children", async () => {
  await page.mount("authenticating");

  expect(page.exists("login-screen")).toBe(true);
  expect(page.exists("child-marker")).toBe(false);
});

test("authenticated: renders the children, not LoginScreen", async () => {
  await page.mount("authenticated");

  expect(page.exists("child-marker")).toBe(true);
  expect(page.exists("login-screen")).toBe(false);
});
