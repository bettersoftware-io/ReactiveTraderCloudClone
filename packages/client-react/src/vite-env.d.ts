/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_DEV_AUTH?: string;
  readonly VITE_DEMO_AUTH?: string;
  readonly VITE_CORE_IMPL?: string;
  readonly VITE_NARRATOR_TEST_SEAM?: string;
}
