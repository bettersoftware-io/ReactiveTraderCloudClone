/**
 * Runtime-safe non-null assertion for use in tests.
 *
 * Semantically equivalent to the `!` non-null assertion operator but throws an
 * explicit Error at runtime instead of silently compiling away. Use in place of
 * `x!` wherever biome's style/noNonNullAssertion rule fires.
 */
export function defined<T>(
  value: T | null | undefined,
  message = "Expected value to be defined",
): NonNullable<T> {
  if (value === null || value === undefined) throw new Error(message);
  return value as NonNullable<T>;
}
