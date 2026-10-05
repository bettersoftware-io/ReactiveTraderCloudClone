import { RuleTester } from "@typescript-eslint/rule-tester";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

import { oneImportPerModule } from "./one-import-per-module.mts";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2023,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("one-import-per-module", oneImportPerModule, {
  valid: [
    {
      name: "one statement carrying both a type and a value",
      code: `import { type A, b } from "m";\n`,
    },
    {
      name: "a statement that imports only types stays `import type`",
      code: `import type { A, B } from "m";\n`,
    },
    {
      name: "a namespace import cannot share a statement with named imports",
      code: `import type { A } from "m";\nimport * as m from "m";\n`,
    },
    {
      name: "a side-effect import is not a second statement",
      code: `import "./theme.css";\nimport { tokens } from "./theme.css";\n`,
    },
    {
      name: "an import and a re-export of one module are separate groups",
      code: `import { a } from "m";\nexport { b } from "m";\n`,
    },
    {
      name: "`export *` cannot share a statement with named re-exports",
      code: `export * from "m";\nexport { a as b } from "m";\n`,
    },
    {
      name: "a statement with import attributes is left alone",
      code: `import data from "./a.json" with { type: "json" };\nimport type { Shape } from "./a.json";\n`,
    },
    {
      name: "two modules, one statement each",
      code: `import type { A } from "m";\nimport { b } from "n";\n`,
    },
    {
      name: "a local export is not a re-export",
      code: `const a = 1;\nconst b = 2;\nexport { a };\nexport { b };\n`,
    },
  ],
  invalid: [
    {
      name: "a type block above a value block merges into the value statement",
      code: `import type { A } from "m";\nimport { b } from "m";\n`,
      output: `import { b, type A } from "m";\n`,
      errors: [
        {
          messageId: "splitStatements",
          line: 1,
          data: { module: "m", keyword: "import" },
        },
      ],
    },
    {
      name: "a type block below a value block merges into the value statement",
      code: `import { b } from "m";\nimport { c } from "n";\nimport type { A } from "m";\n`,
      output: `import { b, type A } from "m";\nimport { c } from "n";\n`,
      errors: [{ messageId: "splitStatements", line: 3 }],
    },
    {
      name: "two value statements merge into the first",
      code: `import { a } from "m";\nimport { b } from "m";\n`,
      output: `import { a, b } from "m";\n`,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "two type-only statements stay `import type`",
      code: `import type { A } from "m";\nimport type { B } from "m";\n`,
      output: `import type { A, B } from "m";\n`,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "a type block merges into an already mixed statement",
      code: `import { type A, b } from "m";\nimport type { C } from "m";\n`,
      output: `import { type A, b, type C } from "m";\n`,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "a default import keeps its place before the braces",
      code: `import type { FC } from "react";\nimport React from "react";\n`,
      output: `import React, { type FC } from "react";\n`,
      errors: [{ messageId: "splitStatements", line: 1 }],
    },
    {
      name: "a default import moves into a statement that has only names",
      code: `import { useState } from "react";\nimport React from "react";\n`,
      output: `import React, { useState } from "react";\n`,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "an alias moves with its name",
      code: `import type { A as Alias } from "m";\nimport { b as renamed } from "m";\n`,
      output: `import { b as renamed, type A as Alias } from "m";\n`,
      errors: [{ messageId: "splitStatements", line: 1 }],
    },
    {
      name: "a multi-line statement merges too, and keeps the lines around it",
      code: `import { z } from "a";\nimport type {\n  A,\n  B,\n} from "m";\n\nimport { c } from "m";\n\nconst x = 1;\n`,
      output: `import { z } from "a";\n\nimport { c, type A, type B } from "m";\n\nconst x = 1;\n`,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "three statements take two passes, one merge each",
      code: `import type { A } from "m";\nimport { b } from "m";\nimport { c } from "m";\n`,
      output: [
        `import { b, type A } from "m";\nimport { c } from "m";\n`,
        `import { b, type A, c } from "m";\n`,
      ],
      errors: [
        { messageId: "splitStatements", line: 1 },
        { messageId: "splitStatements", line: 3 },
      ],
    },
    {
      name: "a comment above the pair stays above the merged statement",
      code: `// The file header.\nimport type { A } from "m";\nimport { b } from "m";\n`,
      output: `// The file header.\nimport { b, type A } from "m";\n`,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "re-exports follow the same rule",
      code: `export type { A } from "m";\nexport { b, c as d } from "m";\n`,
      output: `export { b, c as d, type A } from "m";\n`,
      errors: [
        {
          messageId: "splitStatements",
          line: 1,
          data: { module: "m", keyword: "export" },
        },
      ],
    },
    {
      name: "two type-only re-exports stay `export type`",
      code: `export type { A } from "m";\nexport type { B } from "m";\n`,
      output: `export type { A, B } from "m";\n`,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "the last statement of a file without a trailing newline",
      code: `import { b } from "m";\nimport type { A } from "m";`,
      output: `import { b, type A } from "m";\n`,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "a type-only default import is reported but not rewritten",
      code: `import type Shape from "m";\nimport { b } from "m";\n`,
      output: null,
      errors: [{ messageId: "splitStatements", line: 1 }],
    },
    {
      name: "two default imports are reported but not rewritten",
      code: `import first from "m";\nimport second from "m";\n`,
      output: null,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "a comment inside the second statement blocks the rewrite",
      code: `import { b } from "m";\nimport type { A /* the wire shape */ } from "m";\n`,
      output: null,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "a comment above the second statement blocks the rewrite",
      code: `import { b } from "m";\n// the wire shape\nimport type { A } from "m";\n`,
      output: null,
      errors: [{ messageId: "splitStatements", line: 3 }],
    },
    {
      name: "a comment above a statement whose partner is further down blocks the rewrite",
      code: `// the wire shape\nimport type { A } from "m";\nimport { c } from "n";\nimport { b } from "m";\n`,
      output: null,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "a comment trailing the second statement blocks the rewrite",
      code: `import { b } from "m";\nimport type { A } from "m"; // the wire shape\n`,
      output: null,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
    {
      name: "a comment inside the statement that stays blocks the rewrite",
      code: `import { /* the factory */ b } from "m";\nimport type { A } from "m";\n`,
      output: null,
      errors: [{ messageId: "splitStatements", line: 2 }],
    },
  ],
});
