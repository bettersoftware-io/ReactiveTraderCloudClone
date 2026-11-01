// The Content-Security-Policy a deployed client sends (vercel.*.json) is applied
// to `vite preview` too, so this suite boots under the real policy. These tests
// are the witness that the app, its panels and /devtools/ need nothing the
// policy forbids: a blocked script, style, image, font or connection logs a
// "Content Security Policy" console error, and any one fails the test.
import * as csp from "../scenarios/csp.ts";
import { test } from "./_context.ts";

test.describe("Content-Security-Policy", () => {
  test("signs in with no CSP violation", async ({ ctx }) => {
    const violations = await csp.signInAsDemo(ctx);
    csp.expectNoViolations(violations);
  });

  test("opens a workspace and /devtools/ with no CSP violation", async ({
    ctx,
  }) => {
    test.setTimeout(45_000);
    const violations = await csp.openWorkspaceAndDevtools(ctx);
    csp.expectNoViolations(violations);
  });
});
