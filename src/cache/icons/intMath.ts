// Ported from RuneLite's cache library (net.runelite.cache.item, BSD-2-Clause, see LICENSE in src/cache/store).
// The Java int operations the translated renderer needs beyond `| 0` and Math.imul.

/** Java's int division: truncates toward zero, and dividing by zero throws rather than giving 0 */
export function idiv(a: number, b: number): number {
  if (b === 0) throw new RangeError("Integer division by zero");
  return (a / b) | 0;
}

/** Java's int remainder, likewise */
export function irem(a: number, b: number): number {
  if (b === 0) throw new RangeError("Integer division by zero");
  return (a % b) | 0;
}

/** Java's (int) cast of a double: truncates, saturates at the int range, and NaN becomes 0 */
export function d2i(x: number): number {
  if (x !== x) return 0;
  if (x >= 2147483647) return 2147483647;
  if (x <= -2147483648) return -2147483648;
  return Math.trunc(x) | 0;
}
