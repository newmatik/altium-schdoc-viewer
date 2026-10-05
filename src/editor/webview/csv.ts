/** RFC 4180-style CSV: fields containing a comma, quote or line break are quoted, quotes doubled. */
export function csvFromTable(headers: string[], rows: string[][]): string {
  const esc = (s: string) =>
    /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return lines.join('\n') + '\n';
}

/** One CSV row per net connection: net name, `designator-pin`, pin name. */
export function netConnectionRows(
  nets: { name: string; pins: { designator: string; pin: string; pinName: string }[] }[]
): string[][] {
  const rows: string[][] = [];
  for (const n of nets) {
    for (const p of n.pins) rows.push([n.name, `${p.designator}-${p.pin}`, p.pinName]);
  }
  return rows;
}
