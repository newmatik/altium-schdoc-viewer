import type { BuiltNet } from '../netlist/builder';
import type { SchComponent } from '../parser/schematic';

/**
 * Protel / Tango netlist format.
 *
 * Each component is emitted as:
 *
 *     [
 *     <designator>
 *     <footprint>
 *     <value>
 *     ]
 *
 * followed by each net as:
 *
 *     (
 *     <netname>
 *     <designator>-<pin>
 *     ...
 *     )
 */
export function netlistToProtel(nets: BuiltNet[], components: readonly SchComponent[] = []): string {
  const lines: string[] = [];
  const sortedComps = [...components].sort((a, b) =>
    a.designator.localeCompare(b.designator, undefined, { numeric: true, sensitivity: 'base' })
  );
  for (const c of sortedComps) {
    if (!c.designator) continue;
    lines.push('[');
    lines.push(c.designator);
    lines.push(c.footprint);
    lines.push(c.value);
    lines.push(']');
  }
  for (const n of nets) {
    lines.push('(');
    lines.push(n.name);
    for (const p of n.pins) {
      lines.push(`${p.designator}-${p.pin}`);
    }
    lines.push(')');
  }
  return lines.join('\n') + '\n';
}
