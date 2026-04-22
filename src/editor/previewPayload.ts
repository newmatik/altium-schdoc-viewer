import { wireSegmentsForPreview } from '../netlist/builder';
import type { ParsedSchDoc } from '../parser/schematic';
import type { SvgPreviewInput } from './webview/svgPreview';

export function buildSvgPreviewInput(doc: ParsedSchDoc): SvgPreviewInput {
  const wires = wireSegmentsForPreview(doc);
  // Only synthesize a body rectangle for components that have NO primitives (pure-pin
  // connectors, mechanical symbols). Components with real symbol primitives already draw
  // themselves — adding a rect on top would obscure wire endpoints and the real shape.
  const components: SvgPreviewInput['components'] = [];
  for (const c of doc.components) {
    if (c.bodyBox) continue; // Real primitives exist; skip synthesized rect.
    if (!c.bbox) continue;
    const minX = Math.min(c.bbox.a.x, c.bbox.b.x);
    const maxX = Math.max(c.bbox.a.x, c.bbox.b.x);
    const minY = Math.min(c.bbox.a.y, c.bbox.b.y);
    const maxY = Math.max(c.bbox.a.y, c.bbox.b.y);
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 4 && h < 4) continue;
    components.push({
      recordIndex: c.recordIndex,
      designator: c.designator || '?',
      value: c.value,
      x: minX,
      y: minY,
      w,
      h,
    });
  }
  const pins = doc.pins.map((p) => {
    const comp = doc.components.find((x) => x.recordIndex === p.componentRecordIndex);
    return {
      recordIndex: p.recordIndex,
      x: p.location.x,
      y: p.location.y,
      orientation: p.orientation,
      pinLength: p.pinLength,
      designator: comp?.designator ?? '?',
      pin: p.pinDesignator,
      pinName: p.name,
    };
  });
  return {
    sheetSize: doc.sheet.customSize,
    wires,
    lines: doc.lines.map((line) => ({ a: line.a, b: line.b })),
    polylines: doc.polylines.map((polyline) => polyline.points),
    rectangles: doc.rectangles.map((rect) => ({ a: rect.a, b: rect.b })),
    roundRects: doc.roundRects.map((rr) => ({ a: rr.a, b: rr.b, rx: rr.rx, ry: rr.ry })),
    arcs: doc.arcs.map((a) => ({
      center: a.center,
      radius: a.radius,
      startAngle: a.startAngle,
      endAngle: a.endAngle,
    })),
    ellipses: doc.ellipses.map((e) => ({ center: e.center, rx: e.rx, ry: e.ry })),
    polygons: doc.polygons.map((p) => ({ points: p.points, filled: p.filled })),
    beziers: doc.beziers.map((b) => ({ points: b.points })),
    noErcs: doc.noErcs.map((n) => n.location),
    texts: doc.texts.map((text) => ({
      x: text.location.x,
      y: text.location.y,
      text: text.text,
      orientation: text.orientation,
      kind: text.kind,
    })),
    components,
    pins,
    junctions: doc.junctions.map((j) => j.location),
    netLabels: doc.netLabels.map((n) => ({ x: n.location.x, y: n.location.y, text: n.text })),
    powerPorts: doc.powerPorts.map((p) => ({ x: p.location.x, y: p.location.y, text: p.text })),
  };
}
