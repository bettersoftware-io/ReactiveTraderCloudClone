/**
 * Every per-caller bound the server enforces, in one place (hardening spec
 * §2.2 S1/S2/S4/S8 and §9.2). The values are deliberately generous for one
 * real client — a browser tab opens one socket and sends a few dozen frames
 * in its first second — and deliberately tight for a flood. Tune here, not
 * at the call sites. Each hardening PR adds the constants it consumes (knip
 * rejects an export nothing reads yet).
 */

/** S1 — largest WebSocket frame accepted. The largest legitimate frame is a
 * `jarvis.chat` carrying 20 history entries of 2 000 chars plus a 4 000-char
 * message (~45 KiB with JSON overhead). `ws` closes the socket with 1009. */
export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;
