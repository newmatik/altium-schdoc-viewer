import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSchDocBuffer } from '../src/parser/schematic';

const fixture = path.join(__dirname, 'fixtures', 'AFE-Eval_Schematics_B.SchDoc');
const hasFixture = fs.existsSync(fixture);

describe.skipIf(!hasFixture)('primitives + components', () => {
  it('exposes arc / ellipse / polygon / bezier / roundRect / bus arrays', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    // At least one of the curved primitive types should be present on a real board.
    const curvedCount =
      doc.arcs.length + doc.ellipses.length + doc.polygons.length + doc.beziers.length + doc.roundRects.length;
    expect(curvedCount).toBeGreaterThan(0);
    // All new arrays must exist (shape check).
    expect(Array.isArray(doc.busses)).toBe(true);
    expect(Array.isArray(doc.busEntries)).toBe(true);
    expect(Array.isArray(doc.noErcs)).toBe(true);
  });

  it('populates component primitives and bbox for most components', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    const withBbox = doc.components.filter((c) => c.bbox != null);
    // Virtually every real component on the AFE-Eval fixture has pins and therefore a bbox.
    expect(withBbox.length).toBeGreaterThan(doc.components.length * 0.9);
    const withPrimitives = doc.components.filter((c) => c.primitives.length > 0);
    expect(withPrimitives.length).toBeGreaterThan(0);
  });

  it('extracts the sheet title block parameters', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    // Real Altium sheets always carry a Title + Revision even when blank.
    expect(Array.isArray(doc.sheet.parameters)).toBe(true);
    expect(doc.sheet.parameters.length).toBeGreaterThan(0);
  });
});
