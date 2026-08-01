import { type ScriptedJarvisDeps, ScriptedJarvisEngine } from "@rtc/shared";

import type { JarvisPort } from "#/adapters/jarvisPort";

export type { ScriptedJarvisDeps };

/**
 * Thin client-core shim over the transport-neutral `ScriptedJarvisEngine`
 * (relocated to `@rtc/shared` so the server's phase-2 `ScriptedAgentLoop` can
 * share the same brain). Every existing import site — `portFactory`,
 * `ui-contract`, this package's own tests — keeps resolving
 * `ScriptedJarvisAdapter` from `@rtc/client-core` unchanged; this class adds
 * nothing but the `JarvisPort` structural marker.
 */
export class ScriptedJarvisAdapter
  extends ScriptedJarvisEngine
  implements JarvisPort {}
