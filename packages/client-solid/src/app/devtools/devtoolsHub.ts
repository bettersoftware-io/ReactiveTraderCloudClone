import { createDevtoolsHub } from "@rtc/web-boot";

/** The Solid client's devtools hub: one per page. The app id is what tells
 * the inspector this client from the React one (`rtc-web`). */
export const devtoolsHub = createDevtoolsHub({
  appId: "rtc-web-solid",
  dev: import.meta.env.DEV,
});
