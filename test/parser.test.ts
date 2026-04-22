import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSchDocBuffer } from '../src/parser/schematic';
import { splitRecords } from '../src/parser/records';
import { readFileHeaderStream } from '../src/parser/cfb';

// Fixture is intentionally NOT committed (customer-proprietary). Contributors with
// legitimate access can drop an Altium .SchDoc here locally; CI and public forks
// skip these assertions.
const fixture = path.join(__dirname, 'fixtures', 'AFE-Eval_Schematics_B.SchDoc');
const hasFixture = fs.existsSync(fixture);

describe.skipIf(!hasFixture)('parser', () => {
  it('reads FileHeader stream from OLE SchDoc', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const fh = readFileHeaderStream(buf);
    expect(fh.byteLength).toBeGreaterThan(100_000);
  });

  it('splits records and parses AFE-Eval fixture', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    expect(doc.records.length).toBe(3554);
    expect(doc.components.length).toBe(67);
    expect(doc.pins.length).toBe(359);
    expect(doc.wires.length).toBeGreaterThan(100);
    expect(doc.lines.length).toBeGreaterThan(300);
    expect(doc.polylines.length).toBeGreaterThan(50);
    expect(doc.rectangles.length).toBeGreaterThan(40);
    expect(doc.texts.length).toBeGreaterThan(50);
    expect(new Set(doc.pins.map((p) => p.orientation))).toEqual(new Set([0, 1, 2, 3]));
    const u1 = doc.components.find((c) => c.designator === 'U1');
    expect(u1).toBeDefined();
    expect(u1!.libReference).toContain('TMA');
  });

  it('splitRecords matches full buffer parse', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const fh = readFileHeaderStream(buf);
    const recs = splitRecords(fh);
    expect(recs.length).toBe(3554);
  });
});
