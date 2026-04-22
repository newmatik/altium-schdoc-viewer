import { wireSegmentsForPreview } from '../netlist/builder';
import type { ParsedSchDoc } from '../parser/schematic';
import type { SvgPreviewInput } from './webview/svgPreview';

export function buildSvgPreviewInput(doc: ParsedSchDoc): SvgPreviewInput {
  const wires = wireSegmentsForPreview(doc);
  const components: SvgPreviewInput['components'] = [];
  const pins = doc.pins.map((p) => {
    const comp = doc.components.find((x) => x.recordIndex === p.componentRecordIndex);
    return {
      x: p.location.x,
      y: p.location.y,
      orientation: p.orientation,
      pinLength: p.pinLength,
      designator: comp?.designator ?? '?',
      pin: p.pinDesignator,
    };
  });
  return {
    sheetSize: doc.sheet.customSize,
    wires,
    lines: doc.lines.map((line) => ({ a: line.a, b: line.b })),
    polylines: doc.polylines.map((polyline) => polyline.points),
    rectangles: doc.rectangles.map((rect) => ({ a: rect.a, b: rect.b })),
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
