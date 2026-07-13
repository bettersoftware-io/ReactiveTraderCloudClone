import { setDriver } from "@ui-contract/harness/activeDriver";
import { cleanupMounted } from "@ui-contract/mount";
import { afterEach } from "vitest";

import { solidDriver } from "./render";

setDriver(solidDriver);
afterEach(() => {
  return cleanupMounted();
});
