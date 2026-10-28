import { describe, expect, it } from 'vitest';
import { getRecordType, isHeaderRecord, parentRecordIndex, parseFields, splitRecords } from '../src/parser/records';

const latin1 = (s: string): Uint8Array => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));

/** Build a length-prefixed record stream from payload strings. */
function stream(payloads: string[]): Uint8Array {
  const parts = payloads.map((p) => {
    const body = latin1(p);
    const out = new Uint8Array(4 + body.length);
    new DataView(out.buffer).setUint32(0, body.length, true);
    out.set(body, 4);
    return out;
  });
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    all.set(p, off);
    off += p.length;
  }
  return all;
}

describe('parseFields', () => {
  it('parses |KEY=value| pairs and keeps "=" inside values', () => {
    const m = parseFields(latin1('|RECORD=1|TEXT=a=b|EMPTY=|'));
    expect(m.get('RECORD')).toBe('1');
    expect(m.get('TEXT')).toBe('a=b');
    expect(m.get('EMPTY')).toBe('');
  });
  it('returns an empty map for payloads not starting with a pipe', () => {
    expect(parseFields(latin1('RECORD=1')).size).toBe(0);
  });
  it('strips NUL bytes and decodes Latin-1', () => {
    const m = parseFields(Uint8Array.from([0x7c, 0x4b, 0x3d, 0xb5, 0x00, 0x7c]));
    expect(m.get('K')).toBe('µ');
  });
  it('skips fragments without a key', () => {
    const m = parseFields(latin1('|=x|noeq|A=1|'));
    expect([...m.keys()]).toEqual(['A']);
  });
});

describe('splitRecords', () => {
  it('splits records, assigns indices and record types', () => {
    const recs = splitRecords(stream(['|HEADER=Protel|', '|RECORD=1|LIBREFERENCE=X|', '|RECORD=abc|']));
    expect(recs.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(recs.map((r) => r.recordType)).toEqual([null, 1, null]);
    expect(isHeaderRecord(recs[0])).toBe(true);
    expect(isHeaderRecord(recs[1])).toBe(false);
    expect(recs[1].fields.get('LIBREFERENCE')).toBe('X');
  });
  it('stops at a zero length or truncated record', () => {
    const good = stream(['|RECORD=1|']);
    const zero = new Uint8Array([...good, 0, 0, 0, 0, ...stream(['|RECORD=2|'])]);
    expect(splitRecords(zero)).toHaveLength(1);
    const truncated = good.slice(0, good.length - 2);
    expect(splitRecords(truncated)).toHaveLength(0);
  });
  it('honours a non-zero byteOffset of the input view', () => {
    const s = stream(['|RECORD=5|']);
    const padded = new Uint8Array(s.length + 3);
    padded.set(s, 3);
    expect(splitRecords(padded.subarray(3))[0].recordType).toBe(5);
  });
});

describe('record helpers', () => {
  it('maps OwnerIndex to the parent record index with the +1 quirk', () => {
    expect(parentRecordIndex(0)).toBe(1);
    expect(parentRecordIndex(41)).toBe(42);
  });
  it('getRecordType parses RECORD or returns null', () => {
    expect(getRecordType(new Map([['RECORD', '34']]))).toBe(34);
    expect(getRecordType(new Map([['RECORD', 'x']]))).toBeNull();
    expect(getRecordType(new Map())).toBeNull();
  });
});
