export interface ParsedRecord {
  /** Zero-based index in the record array (matches Altium OwnerIndex convention + 1 for parent). */
  index: number;
  /** Raw payload as Latin-1 string (nulls stripped). */
  raw: string;
  fields: Map<string, string>;
  recordType: number | null;
}

function decodeLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) continue;
    s += String.fromCharCode(c);
  }
  return s;
}

export function parseFields(bytes: Uint8Array): Map<string, string> {
  const m = new Map<string, string>();
  const s = decodeLatin1(bytes);
  if (!s.startsWith('|')) return m;
  const parts = s.split('|');
  for (const p of parts) {
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    m.set(k, v);
  }
  return m;
}

export function splitRecords(buf: Uint8Array): ParsedRecord[] {
  const out: ParsedRecord[] = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0;
  let idx = 0;
  while (off + 4 <= buf.byteLength) {
    const len = dv.getUint32(off, true);
    off += 4;
    if (len === 0 || off + len > buf.byteLength) break;
    const slice = buf.subarray(off, off + len);
    const fields = parseFields(slice);
    const rt = fields.has('RECORD') ? parseInt(fields.get('RECORD')!, 10) : null;
    const raw = decodeLatin1(slice);
    out.push({ index: idx++, raw, fields, recordType: Number.isFinite(rt as number) ? rt : null });
    off += len;
  }
  return out;
}

export function isHeaderRecord(rec: ParsedRecord): boolean {
  return rec.fields.has('HEADER');
}

/** Parent record index from OwnerIndex (Altium binary SchDoc convention for this format). */
export function parentRecordIndex(ownerIndex: number): number {
  return ownerIndex + 1;
}

export function getRecordType(fields: Map<string, string>): number | null {
  const v = fields.get('RECORD');
  if (v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export { RecordType } from './types';
