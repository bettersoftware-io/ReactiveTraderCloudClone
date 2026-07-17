import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#/": `${path.resolve(__dirname, "src")}/`,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // The owl tier owns its own runner (`owl test` → owl's jest + matchers);
    // its `*.owl.test.ts` must NOT run under the repo's vitest — `react-native-owl`
    // calls `expect.extend` at import time (`expect is not defined` under vitest).
    exclude: [...configDefaults.exclude, "tests/visual/owl/**"],
  },
});
