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
  valid: [
    {
      name: "helpers already below the tests",
      code: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {
    helper();
  });
});

function helper() {
  return 1;
}
`,
    },
    {
      name: "no test statements -> rule does nothing",
      code: `export function add(a: number, b: number): number {
  return a + b;
}
`,
    },
    {
      name: "class before describe is left in place (not hoisted)",
      code: `import { describe, it } from "vitest";

class FakeWs {}

describe("x", () => {
  it("uses fake", () => {
    new FakeWs();
  });
});
`,
    },
    {
      name: "vi.doMock before describe is left in place (not hoisted)",
      code: `import { describe, it, vi } from "vitest";

vi.doMock("./dep", () => ({ default: 1 }));

describe("x", () => {
  it("works", () => {});
});
`,
    },
    {
      name: "const after a test is not policed",
      code: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {});
});

const AFTER = 1;
`,
    },
  ],
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
    {
      name: "type alias before describe is moved down",
      code: `import { describe, it } from "vitest";

type Foo = { a: number };

describe("x", () => {
  it("works", () => {
    const f: Foo = { a: 1 };
  });
});
`,
      output: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {
    const f: Foo = { a: 1 };
  });
});

type Foo = { a: number };
`,
      errors: [{ messageId: "moveDown", data: { count: "1" } }],
    },
    {
      name: "vi.mock before describe is moved down (vitest hoists it anyway)",
      code: `import { describe, it, vi } from "vitest";

vi.mock("./dep");

describe("x", () => {
  it("works", () => {});
});
`,
      output: `import { describe, it, vi } from "vitest";

describe("x", () => {
  it("works", () => {});
});

vi.mock("./dep");
`,
      errors: [{ messageId: "moveDown", data: { count: "1" } }],
    },
    {
      name: "leading JSDoc comment travels with the helper",
      code: `import { describe, it } from "vitest";

// makes a thing
function helper() {
  return 1;
}

describe("x", () => {
  it("works", () => {
    helper();
  });
});
`,
      output: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {
    helper();
  });
});

// makes a thing
function helper() {
  return 1;
}
`,
      errors: [{ messageId: "moveDown", data: { count: "1" } }],
    },
    {
      name: "two helpers before describe keep their original order at the bottom",
      code: `import { describe, it } from "vitest";

function a() {
  return 1;
}

function b() {
  return 2;
}

describe("x", () => {
  it("works", () => {
    a();
    b();
  });
});
`,
      output: `import { describe, it } from "vitest";

describe("x", () => {
  it("works", () => {
    a();
    b();
  });
});

function a() {
  return 1;
}

function b() {
  return 2;
}
`,
      errors: [{ messageId: "moveDown", data: { count: "2" } }],
    },
  ],
});
