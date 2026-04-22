import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSchDocBuffer } from '../src/parser/schematic';
import { bomToCsv } from '../src/export/bomCsv';
import { compressDesignatorRange } from '../src/export/designators';

const fixture = path.join(__dirname, 'fixtures', 'AFE-Eval_Schematics_B.SchDoc');
const hasFixture = fs.existsSync(fixture);

describe('compressDesignatorRange', () => {
  it('collapses runs and keeps gaps as separate items', () => {
    expect(compressDesignatorRange(['R1', 'R2', 'R3', 'R5', 'R7', 'R8'])).toBe('R1-R3, R5, R7-R8');
  });
  it('mixes different prefixes and sorts prefixes alphabetically', () => {
    expect(compressDesignatorRange(['U2', 'U1', 'R10', 'R9', 'C1'])).toBe('C1, R9-R10, U1-U2');
  });
  it('ranges pairs of consecutive designators', () => {
    expect(compressDesignatorRange(['R1', 'R2'])).toBe('R1-R2');
  });
  it('emits orphan designators sorted at the end', () => {
    expect(compressDesignatorRange(['GND', 'R1', 'R2', '?'])).toBe('R1-R2, ?, GND');
  });
  it('dedupes duplicates', () => {
    expect(compressDesignatorRange(['R1', 'R1', 'R2'])).toBe('R1-R2');
  });
});

describe.skipIf(!hasFixture)('bomToCsv', () => {
  it('emits Qty and Designators columns and aggregates identical parts', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    const csv = bomToCsv(doc);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    // Header
    expect(lines[0]).toMatch(/^Qty,Designators,Value,Footprint,LibReference,Description,Manufacturer,MPN/);
    // Number of rows must be ≤ number of components (aggregation).
    expect(lines.length - 1).toBeLessThanOrEqual(doc.components.length);
    // At least one row should compress a run (contains '-')
    expect(lines.some((l) => /,[A-Za-z]+\d+-[A-Za-z]+\d+,/.test(l))).toBe(true);
  });
});
