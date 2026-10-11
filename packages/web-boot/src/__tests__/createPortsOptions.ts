import { DevtoolsHub } from "@rtc/devtools-core";

import type { BuildBrowserPortsOptions } from "#/buildBrowserPorts";
import type { WebBootEnv } from "#/env";

/** A `WebBootEnv` as a client's own test run supplies it: a dev build with
 * no server and no roster. Pass what the case is about. */
export function createWebBootEnv(
  overrides: Partial<WebBootEnv> = {},
): WebBootEnv {
  return {
    serverUrl: undefined,
    demoAuth: undefined,
    devAuth: undefined,
    coreImpl: undefined,
    narratorTestSeam: true,
    dev: true,
    ...overrides,
  };
}

/** Options for one `buildBrowserPorts` call: the env above with `env`
 * applied, and a hub with no transport unless the case passes its own. */
export function createPortsOptions(
  env: Partial<WebBootEnv> = {},
  rest: Partial<Omit<BuildBrowserPortsOptions, "env">> = {},
): BuildBrowserPortsOptions {
  return {
    env: createWebBootEnv(env),
    devtoolsHub: new DevtoolsHub({ appId: "rtc-test", dev: true }),
    ...rest,
  };
}
