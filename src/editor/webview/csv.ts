/**
 * Neutralize spreadsheet formula injection (CWE-1236): a cell that a spreadsheet would evaluate gets
 * a leading apostrophe. `=`, `@`, tab and CR always trigger it. A leading `+`/`-` only does when the
 * cell also holds formula syntax (`(`, `!`, `|`, `=`), because power-net names such as `+3V3`, `+5V`
 * and `-12V` are ordinary schematic data and must export unchanged.
 */
export function neutralizeFormula(s: string): string {
  if (/^[=@\t\r]/.test(s)) return `'${s}`;
  if (/^[+-]/.test(s) && /[(!|=]/.test(s)) return `'${s}`;
  return s;
}

/**
 * RFC 4180-style CSV: fields containing a comma, quote or line break are quoted, quotes doubled.
 * Cells are passed through `neutralizeFormula` first, since these exports are meant for spreadsheets.
 */
export function csvFromTable(headers: string[], rows: string[][]): string {
  const esc = (raw: string) => {
    const s = neutralizeFormula(raw);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
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
