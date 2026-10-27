// Java's narrowing casts and double-to-int conversion, which the ported loaders rely on.

/** (short) v */
export const toShort = (v: number): number => (v << 16) >> 16;

/** (byte) v */
export const toByte = (v: number): number => (v << 24) >> 24;

/** (int) d: truncates toward zero, NaN is 0, and out-of-range values clamp */
export function toInt(d: number): number {
  if (Number.isNaN(d)) return 0;
  if (d >= 2147483647) return 2147483647;
  if (d <= -2147483648) return -2147483648;
  return Math.trunc(d);
}
