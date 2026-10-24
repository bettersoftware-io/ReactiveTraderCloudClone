/** The `name` of the error a transport rejects an in-flight request with when
 * the connection drops (or is closed on purpose) before the reply arrived. A
 * name rather than a class so it survives every package boundary — and is
 * matched by `isTransportLost`, never by message text. */
export const TRANSPORT_LOST_ERROR_NAME = "TransportLostError";

/** An error naming a lost transport: the request may or may not have reached
 * the other side, so its outcome is UNKNOWN (unlike a refusal, which is known). */
export function createTransportLostError(message: string): Error {
  const error = new Error(message);
  error.name = TRANSPORT_LOST_ERROR_NAME;

  return error;
}

export function isTransportLost(error: unknown): boolean {
  return error instanceof Error && error.name === TRANSPORT_LOST_ERROR_NAME;
}
