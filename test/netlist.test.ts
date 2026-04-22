import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSchDocBuffer } from '../src/parser/schematic';
import { buildNetlist } from '../src/netlist/builder';
import { netlistToProtel } from '../src/export/netlistExport';
import { buildJsonModel } from '../src/export/jsonModel';

const fixture = path.join(__dirname, 'fixtures', 'AFE-Eval_Schematics_B.SchDoc');
const hasFixture = fs.existsSync(fixture);

describe.skipIf(!hasFixture)('netlist', () => {
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

  it('emits real Protel format with component sections then net sections', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    const nets = buildNetlist(doc);
    const out = netlistToProtel(nets, doc.components);
    // Component sections come first
    const firstCompIdx = out.indexOf('[');
    const firstNetIdx = out.indexOf('(');
    expect(firstCompIdx).toBeGreaterThanOrEqual(0);
    expect(firstNetIdx).toBeGreaterThanOrEqual(0);
    expect(firstCompIdx).toBeLessThan(firstNetIdx);
    // U1 should appear in a component section
    expect(out).toMatch(/\[\nU1\n/);
    // Each net section closes with a )
    expect((out.match(/\n\)\n/g) ?? []).length).toBeGreaterThan(0);
  });

  it('buildJsonModel returns a versioned schematic snapshot', () => {
    const buf = new Uint8Array(fs.readFileSync(fixture));
    const doc = parseSchDocBuffer(buf);
    const nets = buildNetlist(doc);
    const m = buildJsonModel(doc, nets);
    expect(m.$schema).toBe('altium-schdoc-viewer/v1');
    expect(m.counts.components).toBe(doc.components.length);
    expect(m.counts.pins).toBe(doc.pins.length);
    expect(Array.isArray(m.sheet.parameters)).toBe(true);
  });
});
