import { createDevtoolsHub } from "@rtc/web-boot";

/** The Solid client's devtools hub: one per page. The app id is what tells
 * the inspector this client from the React one (`rtc-web`). The `?.` keeps a
 * runtime with no `import.meta.env` from throwing at module load; it reads as
 * a non-dev build. */
export const devtoolsHub = createDevtoolsHub({
  appId: "rtc-web-solid",
  dev: import.meta.env?.DEV === true,
});
