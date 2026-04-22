/**
 * Compress a list of designators into ranges where possible.
 *
 * Grouping rule: designators share a prefix of non-digit characters and end with a
 * consecutive integer suffix. `["R1","R2","R3","R5","C1","R7","R8"]` →
 * `"C1, R1-R3, R5, R7-R8"`.
 *
 * Designators that don't match `^[^0-9]+[0-9]+$` (e.g. `U1A`, `GND`, `?`) are emitted
 * as-is in sorted order after the compressed runs.
 */
export function compressDesignatorRange(designators: readonly string[]): string {
  type Parsed = { prefix: string; n: number };
  const parsed: Parsed[] = [];
  const leftover: string[] = [];
  for (const d of designators) {
    const m = /^([^\d]+)(\d+)$/.exec(d);
    if (m) parsed.push({ prefix: m[1], n: parseInt(m[2], 10) });
    else leftover.push(d);
  }
  // Group by prefix, sort numerically within each group.
  const byPrefix = new Map<string, number[]>();
  for (const { prefix, n } of parsed) {
    const arr = byPrefix.get(prefix) ?? [];
    arr.push(n);
    byPrefix.set(prefix, arr);
  }
  const runs: string[] = [];
  const prefixes = [...byPrefix.keys()].sort();
  for (const prefix of prefixes) {
    const nums = [...new Set(byPrefix.get(prefix)!)].sort((a, b) => a - b);
    let i = 0;
    while (i < nums.length) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      if (j === i) {
        runs.push(`${prefix}${nums[i]}`);
      } else {
        runs.push(`${prefix}${nums[i]}-${prefix}${nums[j]}`);
      }
      i = j + 1;
    }
  }
  const extras = [...new Set(leftover)].sort();
  return [...runs, ...extras].join(', ');
}
