import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSchDocBuffer } from '../src/parser/schematic';
import { buildNetlist } from '../src/netlist/builder';

const fixture = path.join(__dirname, 'fixtures', 'AFE-Eval_Schematics_B.SchDoc');

describe('netlist', () => {
  it('builds nets with merged pins and recognizable power names', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    const nets = buildNetlist(doc);
    const maxPins = Math.max(0, ...nets.map((n) => n.pins.length));
    expect(nets.length).toBeGreaterThan(10);
    expect(maxPins).toBeGreaterThan(1);
    const names = nets.map((n) => n.name);
    const hasCommonName =
      names.includes('GND') ||
      names.includes('+3V3') ||
      names.includes('+5V') ||
      names.includes('+VIN') ||
      names.some((n) => /GND|\+3V3|\+5V|VDD|VCC/i.test(n));
    expect(hasCommonName || maxPins >= 4).toBe(true);
  });
});
