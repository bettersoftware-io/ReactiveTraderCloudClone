import { setDriver } from "@ui-contract/harness/activeDriver";
import { cleanupMounted } from "@ui-contract/mount";
import { afterEach } from "vitest";

import { reactDriver } from "./render";

setDriver(reactDriver);
afterEach(() => {
  return cleanupMounted();
});
