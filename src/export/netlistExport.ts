import type { BuiltNet } from '../netlist/builder';

/** Simple bracket-style netlist (Protel-like, human-readable). */
export function netlistToProtel(nets: BuiltNet[]): string {
  const lines: string[] = ['|RECORD=Netlist|Generator=altium-schdoc-viewer|'];
  for (const n of nets) {
    lines.push(`[${n.name}]`);
    for (const p of n.pins) {
      lines.push(`${p.designator}-${p.pin}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
