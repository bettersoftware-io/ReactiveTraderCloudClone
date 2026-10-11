/** The build-time values the boot code needs. A client's bundler supplies
 * them; this package never reads `import.meta.env` itself, so it stays free
 * of the bundler and its tests pass a plain object. */
export interface WebBootEnv {
  /** `VITE_SERVER_URL`. Unset or empty means simulator mode. */
  readonly serverUrl: string | undefined;
  /** `VITE_DEMO_AUTH`: the demo roster, JSON `{"user":"pass"}`. */
  readonly demoAuth: string | undefined;
  /** `VITE_DEV_AUTH`: the dev-only roster, same format. */
  readonly devAuth: string | undefined;
  /** `VITE_CORE_IMPL`: the build's default application core. */
  readonly coreImpl: string | undefined;
  /** Whether `?narratorThresholds=test` may relax the narrator's detector. */
  readonly narratorTestSeam: boolean;
  /** True on a dev build. */
  readonly dev: boolean;
}

/** The values as a bundler names them: the shape of Vite's `import.meta.env`. */
export interface BuildEnvValues {
  readonly DEV?: boolean;
  readonly VITE_SERVER_URL?: string;
  readonly VITE_DEMO_AUTH?: string;
  readonly VITE_DEV_AUTH?: string;
  readonly VITE_CORE_IMPL?: string;
  readonly VITE_NARRATOR_TEST_SEAM?: string;
}

/**
 * A client calls this with `import.meta.env`.
 *
 * The narrator seam is on for a dev build, and for a production build made
 * with `VITE_NARRATOR_TEST_SEAM=1`. Only `tests/scripts/clientServer.ts` sets
 * that variable; no deploy does.
 */
export function webBootEnvOf(values: BuildEnvValues): WebBootEnv {
  const dev = values.DEV === true;

  return {
    serverUrl: values.VITE_SERVER_URL,
    demoAuth: values.VITE_DEMO_AUTH,
    devAuth: values.VITE_DEV_AUTH,
    coreImpl: values.VITE_CORE_IMPL,
    narratorTestSeam: dev || values.VITE_NARRATOR_TEST_SEAM === "1",
    dev,
  };
}
