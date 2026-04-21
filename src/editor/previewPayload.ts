import { wireSegmentsForPreview } from '../netlist/builder';
import type { ParsedSchDoc } from '../parser/schematic';
import type { SvgPreviewInput } from './webview/svgPreview';

export function buildSvgPreviewInput(doc: ParsedSchDoc): SvgPreviewInput {
  const wires = wireSegmentsForPreview(doc);
  const components = doc.components.map((c) => {
    const pins = doc.pins.filter((p) => p.componentRecordIndex === c.recordIndex);
    let minX = c.location.x;
    let minY = c.location.y;
    let maxX = c.location.x + 80;
    let maxY = c.location.y + 50;
    for (const p of pins) {
      minX = Math.min(minX, p.location.x);
      minY = Math.min(minY, p.location.y);
      maxX = Math.max(maxX, p.location.x);
      maxY = Math.max(maxY, p.location.y);
    }
    const pad = 20;
    const w = Math.max(50, maxX - minX + pad * 2);
    const hWorld = Math.max(40, maxY - minY + pad * 2);
    return {
      designator: c.designator || '?',
      value: (c.value || c.libReference || '').slice(0, 48),
      x: minX - pad,
      y: minY - pad,
      w,
      h: hWorld,
    };
  });
  const pins = doc.pins.map((p) => {
    const comp = doc.components.find((x) => x.recordIndex === p.componentRecordIndex);
    return {
      x: p.location.x,
      y: p.location.y,
      designator: comp?.designator ?? '?',
      pin: p.pinDesignator,
    };
  });
  return {
    sheetSize: doc.sheet.customSize,
    wires,
    components,
    pins,
    junctions: doc.junctions.map((j) => j.location),
    netLabels: doc.netLabels.map((n) => ({ x: n.location.x, y: n.location.y, text: n.text })),
    powerPorts: doc.powerPorts.map((p) => ({ x: p.location.x, y: p.location.y, text: p.text })),
  };
}
