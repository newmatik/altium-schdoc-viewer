import type { BuiltNet } from '../netlist/builder';
import type { ParsedSchDoc } from '../parser/schematic';

/**
 * Stable JSON representation of a parsed schematic, suitable for downstream tooling
 * or LLM ingestion. Schema versioned; keep backward-compatible across the 0.x series.
 */
export interface JsonSchematic {
  $schema: 'altium-schdoc-viewer/v1';
  generatedAt: string;
  sheet: {
    customSize: { x: number; y: number } | null;
    title: string | null;
    revision: string | null;
    documentNumber: string | null;
    author: string | null;
    drawnBy: string | null;
    companyName: string | null;
    date: string | null;
    sheetNumber: string | null;
    sheetTotal: string | null;
    parameters: { name: string; value: string }[];
  };
  components: {
    designator: string;
    libReference: string;
    value: string;
    footprint: string;
    description: string;
    indexInSheet: number;
    uniqueId: string;
    bbox: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
    parameters: { name: string; value: string; hidden: boolean }[];
  }[];
  pins: {
    designator: string;
    pin: string;
    name: string;
    electrical: number;
    x: number;
    y: number;
    orientation: number;
  }[];
  nets: BuiltNet[];
  counts: {
    records: number;
    components: number;
    pins: number;
    wires: number;
    junctions: number;
    netLabels: number;
    powerPorts: number;
    arcs: number;
    ellipses: number;
    polygons: number;
    beziers: number;
    roundRects: number;
    busses: number;
    noErcs: number;
  };
}

export function buildJsonModel(doc: ParsedSchDoc, nets: BuiltNet[]): JsonSchematic {
  const compByIdx = new Map(doc.components.map((c) => [c.recordIndex, c]));
  return {
    $schema: 'altium-schdoc-viewer/v1',
    generatedAt: new Date().toISOString(),
    sheet: {
      customSize: doc.sheet.customSize,
      title: doc.sheet.title,
      revision: doc.sheet.revision,
      documentNumber: doc.sheet.documentNumber,
      author: doc.sheet.author,
      drawnBy: doc.sheet.drawnBy,
      companyName: doc.sheet.companyName,
      date: doc.sheet.date,
      sheetNumber: doc.sheet.sheetNumber,
      sheetTotal: doc.sheet.sheetTotal,
      parameters: doc.sheet.parameters,
    },
    components: doc.components.map((c) => ({
      designator: c.designator,
      libReference: c.libReference,
      value: c.value,
      footprint: c.footprint,
      description: c.description,
      indexInSheet: c.indexInSheet,
      uniqueId: c.uniqueId,
      bbox: c.bbox,
      parameters: c.parameters,
    })),
    pins: doc.pins.map((p) => ({
      designator: compByIdx.get(p.componentRecordIndex)?.designator ?? '?',
      pin: p.pinDesignator,
      name: p.name,
      electrical: p.electrical,
      x: p.location.x,
      y: p.location.y,
      orientation: p.orientation,
    })),
    nets,
    counts: {
      records: doc.records.length,
      components: doc.components.length,
      pins: doc.pins.length,
      wires: doc.wires.length,
      junctions: doc.junctions.length,
      netLabels: doc.netLabels.length,
      powerPorts: doc.powerPorts.length,
      arcs: doc.arcs.length,
      ellipses: doc.ellipses.length,
      polygons: doc.polygons.length,
      beziers: doc.beziers.length,
      roundRects: doc.roundRects.length,
      busses: doc.busses.length,
      noErcs: doc.noErcs.length,
    },
  };
}
