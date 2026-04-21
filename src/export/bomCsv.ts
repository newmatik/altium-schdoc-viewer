import type { ParsedSchDoc } from '../parser/schematic';

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function bomToCsv(doc: ParsedSchDoc): string {
  const headers = ['Designator', 'LibReference', 'Value', 'Footprint', 'Description'];
  const lines = [headers.map(csvEscape).join(',')];
  for (const c of doc.components.slice().sort((a, b) => a.designator.localeCompare(b.designator))) {
    lines.push(
      [c.designator, c.libReference, c.value, c.footprint, c.description].map(csvEscape).join(',')
    );
  }
  return lines.join('\n') + '\n';
}
