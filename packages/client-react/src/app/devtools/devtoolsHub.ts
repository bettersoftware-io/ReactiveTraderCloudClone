import { createDevtoolsHub } from "@rtc/web-boot";

/** The React client's devtools hub: one per page. The app id is what tells
 * the inspector this client from the Solid one (`rtc-web-solid`). */
export const devtoolsHub = createDevtoolsHub({
  appId: "rtc-web",
  dev: import.meta.env.DEV,
});
