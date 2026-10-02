/**
 * Thrown by `requireValid` (see guards.ts) when an inbound RPC payload fails
 * its guard. Inside an `rpc()` handler it surfaces through `validated(...)`
 * as an inner-stream error, which `rpc`'s `catchError` turns into a nack. The
 * message names only the frame TYPE — never the body, which is attacker-chosen.
 */
export class MalformedPayloadError extends Error {
  constructor(frameType: string) {
    super(`malformed ${frameType} payload`);
    this.name = "MalformedPayloadError";
  }
}
