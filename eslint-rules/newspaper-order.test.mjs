import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { newspaperOrder } from "./newspaper-order.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2023,
    sourceType: "module",
  },
});

ruleTester.run("newspaper-order", newspaperOrder, {
  valid: [],
  invalid: [
    {
      name: "function helper before describe is moved to the bottom",
      code: `import { describe, it, expect } from "vitest";

function helper() {
  return 1;
}

describe("x", () => {
  it("works", () => {
    expect(helper()).toBe(1);
  });
});
`,
      output: `import { describe, it, expect } from "vitest";

describe("x", () => {
  it("works", () => {
    expect(helper()).toBe(1);
  });
});

function helper() {
  return 1;
}
`,
      errors: [{ messageId: "moveDown", data: { count: "1" } }],
    },
  ],
});
