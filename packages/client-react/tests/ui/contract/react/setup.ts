import { afterEach } from "vitest";

import { setDriver } from "../shared/harness/activeDriver";
import { cleanupMounted } from "../shared/mount";
import { reactDriver } from "./render";

setDriver(reactDriver);
afterEach(() => cleanupMounted());
