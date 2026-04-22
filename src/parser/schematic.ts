import { parseIntField, readCorner, readLocation, schCoord, type SchPoint } from './coords';
import { readFileHeaderStream } from './cfb';
import { parentRecordIndex, splitRecords, type ParsedRecord } from './records';
import { RecordType } from './types';

export interface SchComponent {
  recordIndex: number;
  libReference: string;
  description: string;
  designator: string;
  value: string;
  footprint: string;
  location: SchPoint;
  orientation: number;
  mirrored: boolean;
  indexInSheet: number;
  uniqueId: string;
  parameters: { name: string; value: string; hidden: boolean }[];
}

export interface SchPin {
  recordIndex: number;
  componentRecordIndex: number;
  /** Pin number / designator (e.g. "1", "GND"). */
  pinDesignator: string;
  /** Pin signal name from symbol (e.g. "+VIN"). */
  name: string;
  /** Electrical connection point (where wires attach). */
  location: SchPoint;
  pinLength: number;
  /** Pin direction from hotspot toward the symbol body: 0=left, 1=down, 2=right, 3=up. */
  orientation: number;
  electrical: number;
  ownerPartId: number;
}

export interface SchWire {
  recordIndex: number;
  vertices: SchPoint[];
}

export interface SchLine {
  recordIndex: number;
  a: SchPoint;
  b: SchPoint;
  ownerPartId: number;
}

export interface SchPolyline {
  recordIndex: number;
  points: SchPoint[];
  ownerPartId: number;
}

export interface SchRectangle {
  recordIndex: number;
  a: SchPoint;
  b: SchPoint;
  ownerPartId: number;
}

export interface SchJunction {
  recordIndex: number;
  location: SchPoint;
}

export interface SchNetLabel {
  recordIndex: number;
  text: string;
  location: SchPoint;
}

export interface SchPowerPort {
  recordIndex: number;
  text: string;
  location: SchPoint;
  style: number;
}

export interface SchText {
  recordIndex: number;
  text: string;
  location: SchPoint;
  orientation: number;
  kind: 'label' | 'designator' | 'parameter';
}

export interface SchSheetInfo {
  customSize: SchPoint | null;
  snapGridSize: SchPoint | null;
  visibleGridSize: SchPoint | null;
}

export interface ParsedSchDoc {
  records: ParsedRecord[];
  sheet: SchSheetInfo;
  components: SchComponent[];
  pins: SchPin[];
  wires: SchWire[];
  lines: SchLine[];
  polylines: SchPolyline[];
  rectangles: SchRectangle[];
  junctions: SchJunction[];
  netLabels: SchNetLabel[];
  powerPorts: SchPowerPort[];
  texts: SchText[];
}

function truthyFlag(v: string | undefined): boolean {
  return v === 'T' || v === 't' || v === '1';
}

function getStr(fields: Map<string, string>, key: string, fallback = ''): string {
  return fields.get(key) ?? fallback;
}

function parseWireVertices(fields: Map<string, string>): SchPoint[] {
  const n = parseIntField(fields, 'LocationCount', 0);
  const out: SchPoint[] = [];
  for (let i = 1; i <= n; i++) {
    const xi = parseIntField(fields, `X${i}`);
    const yi = parseIntField(fields, `Y${i}`);
    const xf = fields.has(`X${i}_Frac`) ? parseIntField(fields, `X${i}_Frac`) : 0;
    const yf = fields.has(`Y${i}_Frac`) ? parseIntField(fields, `Y${i}_Frac`) : 0;
    out.push({ x: schCoord(xi, xf), y: schCoord(yi, yf) });
  }
  return out;
}

function visibleText(fields: Map<string, string>): string {
  return getStr(fields, '%UTF8%Text') || getStr(fields, 'Text');
}

function parsePinOrientation(fields: Map<string, string>): number {
  return parseIntField(fields, 'PinConglomerate', 0) & 0x3;
}

export function buildSchematic(records: ParsedRecord[]): ParsedSchDoc {
  const components: SchComponent[] = [];
  const componentByRecordIndex = new Map<number, SchComponent>();

  let sheet: SchSheetInfo = {
    customSize: null,
    snapGridSize: null,
    visibleGridSize: null,
  };

  for (const rec of records) {
    if (rec.recordType === RecordType.Sheet) {
      const f = rec.fields;
      if (truthyFlag(f.get('UseCustomSheet'))) {
        const cx = parseIntField(f, 'CustomX');
        const cy = parseIntField(f, 'CustomY');
        const cxf = f.has('CustomX_Frac') ? parseIntField(f, 'CustomX_Frac') : 0;
        const cyf = f.has('CustomY_Frac') ? parseIntField(f, 'CustomY_Frac') : 0;
        sheet = {
          ...sheet,
          customSize: { x: schCoord(cx, cxf), y: schCoord(cy, cyf) },
        };
      }
      const sg = parseIntField(f, 'SnapGridSize', 0);
      const sgf = f.has('SnapGridSize_Frac') ? parseIntField(f, 'SnapGridSize_Frac') : 0;
      const vg = parseIntField(f, 'VisibleGridSize', 0);
      const vgf = f.has('VisibleGridSize_Frac') ? parseIntField(f, 'VisibleGridSize_Frac') : 0;
      sheet.snapGridSize = { x: schCoord(sg, sgf), y: schCoord(sg, sgf) };
      sheet.visibleGridSize = { x: schCoord(vg, vgf), y: schCoord(vg, vgf) };
    }
  }

  for (const rec of records) {
    if (rec.recordType !== RecordType.Component) continue;
    const f = rec.fields;
    const comp: SchComponent = {
      recordIndex: rec.index,
      libReference: getStr(f, 'LibReference'),
      description: getStr(f, 'ComponentDescription'),
      designator: '',
      value: getStr(f, 'ComponentDescription'),
      footprint: '',
      location: readLocation(f),
      orientation: parseIntField(f, 'Orientation', 0),
      mirrored: truthyFlag(f.get('Mirrored')),
      indexInSheet: parseIntField(f, 'IndexInSheet', -1),
      uniqueId: getStr(f, 'UniqueID'),
      parameters: [],
    };
    components.push(comp);
    componentByRecordIndex.set(rec.index, comp);
  }

  // Designators (RECORD=34)
  for (const rec of records) {
    if (rec.recordType !== RecordType.Designator) continue;
    const f = rec.fields;
    const oi = f.get('OwnerIndex');
    if (oi === undefined) continue;
    const parentIdx = parentRecordIndex(parseInt(oi, 10));
    const comp = componentByRecordIndex.get(parentIdx);
    if (comp) comp.designator = getStr(f, 'Text');
  }

  // Parameters on components (RECORD=41)
  for (const rec of records) {
    if (rec.recordType !== RecordType.Parameter) continue;
    const f = rec.fields;
    const oi = f.get('OwnerIndex');
    if (oi === undefined) continue;
    const parentIdx = parentRecordIndex(parseInt(oi, 10));
    const comp = componentByRecordIndex.get(parentIdx);
    if (!comp) continue;
    const name = getStr(f, 'Name');
    const text = getStr(f, 'Text');
    const hidden = truthyFlag(f.get('IsHidden'));
    comp.parameters.push({ name, value: text, hidden });
    if (name === 'Comment') comp.value = text;
  }

  // Footprint from first PCB implementation (RECORD=45)
  for (const rec of records) {
    if (rec.recordType !== RecordType.Implementation) continue;
    const f = rec.fields;
    const modelType = getStr(f, 'ModelType').toUpperCase();
    const kind0 = getStr(f, 'ModelDatafileKind0').toUpperCase();
    if (!modelType.includes('PCB') && kind0 !== 'PCBLIB') continue;
    const parentImplListIdx = parentRecordIndex(parseInt(f.get('OwnerIndex') ?? '-2', 10));
    const implListRec = records[parentImplListIdx];
    if (!implListRec || implListRec.recordType !== RecordType.ImplementationList) continue;
    const ownerOi = implListRec.fields.get('OwnerIndex');
    if (ownerOi === undefined) continue;
    const compIdx = parentRecordIndex(parseInt(ownerOi, 10));
    const comp = componentByRecordIndex.get(compIdx);
    if (!comp || comp.footprint) continue;
    comp.footprint = getStr(f, 'ModelName') || getStr(f, 'ModelDatafileEntity0');
  }

  const pins: SchPin[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Pin) continue;
    const f = rec.fields;
    const oi = f.get('OwnerIndex');
    if (oi === undefined) continue;
    const compIdx = parentRecordIndex(parseInt(oi, 10));
    if (!componentByRecordIndex.has(compIdx)) continue;
    pins.push({
      recordIndex: rec.index,
      componentRecordIndex: compIdx,
      pinDesignator: getStr(f, 'Designator'),
      name: getStr(f, 'Name'),
      location: readLocation(f),
      pinLength: parseIntField(f, 'PinLength', 0),
      orientation: parsePinOrientation(f),
      electrical: parseIntField(f, 'Electrical', 0),
      ownerPartId: parseIntField(f, 'OwnerPartId', -1),
    });
  }

  const wires: SchWire[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Wire) continue;
    const verts = parseWireVertices(rec.fields);
    if (verts.length >= 2) wires.push({ recordIndex: rec.index, vertices: verts });
  }

  const lines: SchLine[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Line) continue;
    const f = rec.fields;
    lines.push({
      recordIndex: rec.index,
      a: readLocation(f),
      b: readCorner(f),
      ownerPartId: parseIntField(f, 'OwnerPartId', -1),
    });
  }

  const polylines: SchPolyline[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Polyline) continue;
    const points = parseWireVertices(rec.fields);
    if (points.length < 2) continue;
    polylines.push({
      recordIndex: rec.index,
      points,
      ownerPartId: parseIntField(rec.fields, 'OwnerPartId', -1),
    });
  }

  const rectangles: SchRectangle[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Rectangle) continue;
    rectangles.push({
      recordIndex: rec.index,
      a: readLocation(rec.fields),
      b: readCorner(rec.fields),
      ownerPartId: parseIntField(rec.fields, 'OwnerPartId', -1),
    });
  }

  const junctions: SchJunction[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Junction) continue;
    junctions.push({ recordIndex: rec.index, location: readLocation(rec.fields) });
  }

  const netLabels: SchNetLabel[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.NetLabel) continue;
    const f = rec.fields;
    netLabels.push({
      recordIndex: rec.index,
      text: getStr(f, 'Text'),
      location: readLocation(f),
    });
  }

  const powerPorts: SchPowerPort[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.PowerPort) continue;
    const f = rec.fields;
    powerPorts.push({
      recordIndex: rec.index,
      text: getStr(f, 'Text'),
      location: readLocation(f),
      style: parseIntField(f, 'Style', 0),
    });
  }

  const texts: SchText[] = [];
  for (const rec of records) {
    if (rec.recordType === RecordType.Label) {
      const text = visibleText(rec.fields);
      if (!text) continue;
      texts.push({
        recordIndex: rec.index,
        text,
        location: readLocation(rec.fields),
        orientation: parseIntField(rec.fields, 'Orientation', 0),
        kind: 'label',
      });
      continue;
    }

    if (rec.recordType === RecordType.Designator) {
      const text = visibleText(rec.fields);
      if (!text) continue;
      texts.push({
        recordIndex: rec.index,
        text,
        location: readLocation(rec.fields),
        orientation: parseIntField(rec.fields, 'Orientation', 0),
        kind: 'designator',
      });
      continue;
    }

    if (rec.recordType === RecordType.Parameter && !truthyFlag(rec.fields.get('IsHidden'))) {
      const text = visibleText(rec.fields);
      if (!text) continue;
      texts.push({
        recordIndex: rec.index,
        text,
        location: readLocation(rec.fields),
        orientation: parseIntField(rec.fields, 'Orientation', 0),
        kind: 'parameter',
      });
    }
  }

  return {
    records,
    sheet,
    components,
    pins,
    wires,
    lines,
    polylines,
    rectangles,
    junctions,
    netLabels,
    powerPorts,
    texts,
  };
}

export function parseSchDocBuffer(buf: Uint8Array): ParsedSchDoc {
  const fh = readFileHeaderStream(buf);
  return buildSchematic(splitRecords(fh));
}

export type { SchPoint };
