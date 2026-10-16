import { describe, expect, it } from 'vitest';
import { bomToCsv } from '../src/export/bomCsv';
import type { ParsedSchDoc, SchComponent } from '../src/parser/schematic';

function comp(
  designator: string,
  over: Partial<SchComponent> = {},
  parameters: SchComponent['parameters'] = []
): SchComponent {
  return {
    recordIndex: 0,
    libReference: 'RES',
    description: '',
    designator,
    value: '10k',
    footprint: '0603',
    location: { x: 0, y: 0 },
    orientation: 0,
    mirrored: false,
    indexInSheet: 0,
    uniqueId: designator,
    parameters,
    primitives: [],
    bbox: null,
    bodyBox: null,
    ...over,
  };
}

// Synthetic document: only `components` is read by bomToCsv.
const docOf = (components: SchComponent[]): ParsedSchDoc => ({ components }) as unknown as ParsedSchDoc;

describe('bomToCsv (synthetic)', () => {
  it('groups identical parts and compresses designators', () => {
    const csv = bomToCsv(docOf([comp('R1'), comp('R2'), comp('R3'), comp('C1', { libReference: 'CAP', value: '1u' })]));
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('Qty,Designators,Value,Footprint,LibReference,Description,Manufacturer,MPN');
    expect(lines).toContain('1,C1,1u,0603,CAP,,,');
    expect(lines).toContain('3,R1-R3,10k,0603,RES,,,');
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('splits groups that differ in value or footprint', () => {
    const csv = bomToCsv(docOf([comp('R1'), comp('R2', { value: '1k' }), comp('R3', { footprint: '0805' })]));
    expect(csv.trimEnd().split('\n')).toHaveLength(4);
  });

  it('escapes commas, quotes and newlines', () => {
    const csv = bomToCsv(docOf([comp('R1', { description: 'a, "b"\nc' })]));
    expect(csv).toContain('"a, ""b""\nc"');
  });

  it('fills manufacturer / MPN case-insensitively and adds visible custom columns only', () => {
    const csv = bomToCsv(
      docOf([
        comp('R1', {}, [
          { name: 'MANUFACTURER', value: 'Acme', hidden: false },
          { name: 'mpn', value: 'X-1', hidden: false },
          { name: 'Tolerance', value: '1%', hidden: false },
          { name: 'Secret', value: 'no', hidden: true },
        ]),
      ])
    );
    const [header, row] = csv.trimEnd().split('\n');
    expect(header.endsWith(',MPN,Tolerance')).toBe(true);
    expect(header).not.toContain('Secret');
    expect(row).toBe('1,R1,10k,0603,RES,,Acme,X-1,1%');
  });

  it('uses "?" for components without a designator and sorts rows numerically', () => {
    const csv = bomToCsv(
      docOf([comp('R10', { value: 'b' }), comp('R2', { value: 'a' }), comp('', { value: 'c' })])
    );
    const designators = csv
      .trimEnd()
      .split('\n')
      .slice(1)
      .map((l) => l.split(',')[1]);
    expect(designators).toEqual(['?', 'R2', 'R10']);
  });

  it('emits only the header for an empty document', () => {
    expect(bomToCsv(docOf([])).trimEnd().split('\n')).toHaveLength(1);
  });
});
