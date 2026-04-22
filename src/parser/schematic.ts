import { parseIntField, readCorner, readLocation, schCoord, type SchPoint } from './coords';
import { readFileHeaderStream } from './cfb';
import { parentRecordIndex, splitRecords, type ParsedRecord } from './records';
import { RecordType } from './types';

export type SchPrimitive =
  | { kind: 'line'; a: SchPoint; b: SchPoint; recordIndex: number }
  | { kind: 'polyline'; points: SchPoint[]; recordIndex: number }
  | { kind: 'rectangle'; a: SchPoint; b: SchPoint; recordIndex: number }
  | { kind: 'roundRect'; a: SchPoint; b: SchPoint; rx: number; ry: number; recordIndex: number }
  | { kind: 'arc'; center: SchPoint; radius: number; startAngle: number; endAngle: number; recordIndex: number }
  | { kind: 'ellipse'; center: SchPoint; rx: number; ry: number; recordIndex: number }
  | { kind: 'polygon'; points: SchPoint[]; filled: boolean; recordIndex: number }
  | { kind: 'bezier'; points: [SchPoint, SchPoint, SchPoint, SchPoint]; recordIndex: number };

export interface SchBBox {
  a: SchPoint;
  b: SchPoint;
}

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
  /** Graphic primitives owned by this component (symbol body). Populated after all graphics parse. */
  primitives: SchPrimitive[];
  /** Bounding box over primitives + pin hotspots; null if nothing to bound. */
  bbox: SchBBox | null;
  /** Bounding box over primitives only. Null when the component has no body primitives
   *  (e.g. pure-pin connectors). Used by the preview to draw a synthesized body only when
   *  there is no real body already. */
  bodyBox: SchBBox | null;
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

export interface SchRoundRect {
  recordIndex: number;
  a: SchPoint;
  b: SchPoint;
  rx: number;
  ry: number;
  ownerPartId: number;
}

export interface SchArc {
  recordIndex: number;
  /** Circular-arc center in sheet coords. */
  center: SchPoint;
  radius: number;
  /** Start angle in degrees, CCW from +X (Altium convention). */
  startAngle: number;
  /** End angle in degrees, CCW from +X (Altium convention). */
  endAngle: number;
  ownerPartId: number;
}

export interface SchEllipse {
  recordIndex: number;
  center: SchPoint;
  /** X-axis radius. */
  rx: number;
  /** Y-axis radius. */
  ry: number;
  ownerPartId: number;
}

export interface SchPolygon {
  recordIndex: number;
  points: SchPoint[];
  filled: boolean;
  ownerPartId: number;
}

export interface SchBezier {
  recordIndex: number;
  /** Cubic bezier, always four points. */
  points: [SchPoint, SchPoint, SchPoint, SchPoint];
  ownerPartId: number;
}

export interface SchBus {
  recordIndex: number;
  vertices: SchPoint[];
}

export interface SchBusEntry {
  recordIndex: number;
  a: SchPoint;
  b: SchPoint;
}

export interface SchNoErc {
  recordIndex: number;
  location: SchPoint;
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
  /** Title-block parameters attached to the Sheet record. */
  parameters: { name: string; value: string }[];
  title: string | null;
  revision: string | null;
  documentNumber: string | null;
  author: string | null;
  drawnBy: string | null;
  companyName: string | null;
  date: string | null;
  sheetNumber: string | null;
  sheetTotal: string | null;
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
  roundRects: SchRoundRect[];
  arcs: SchArc[];
  ellipses: SchEllipse[];
  polygons: SchPolygon[];
  beziers: SchBezier[];
  busses: SchBus[];
  busEntries: SchBusEntry[];
  noErcs: SchNoErc[];
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
    parameters: [],
    title: null,
    revision: null,
    documentNumber: null,
    author: null,
    drawnBy: null,
    companyName: null,
    date: null,
    sheetNumber: null,
    sheetTotal: null,
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
      primitives: [],
      bbox: null,
      bodyBox: null,
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

  // --- Curved / rounded primitives ---

  const arcs: SchArc[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Arc && rec.recordType !== RecordType.EllipticalArc) continue;
    const f = rec.fields;
    const rxi = parseIntField(f, 'Radius', 0);
    const rxf = f.has('Radius_Frac') ? parseIntField(f, 'Radius_Frac') : 0;
    arcs.push({
      recordIndex: rec.index,
      center: readLocation(f),
      radius: schCoord(rxi, rxf),
      startAngle: parseIntField(f, 'StartAngle', 0),
      endAngle: parseIntField(f, 'EndAngle', 360),
      ownerPartId: parseIntField(f, 'OwnerPartId', -1),
    });
  }

  const ellipses: SchEllipse[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Ellipse) continue;
    const f = rec.fields;
    const rxi = parseIntField(f, 'Radius', 0);
    const rxf = f.has('Radius_Frac') ? parseIntField(f, 'Radius_Frac') : 0;
    const ryi = parseIntField(f, 'SecondaryRadius', rxi);
    const ryf = f.has('SecondaryRadius_Frac') ? parseIntField(f, 'SecondaryRadius_Frac') : 0;
    ellipses.push({
      recordIndex: rec.index,
      center: readLocation(f),
      rx: schCoord(rxi, rxf),
      ry: schCoord(ryi, ryf),
      ownerPartId: parseIntField(f, 'OwnerPartId', -1),
    });
  }

  const polygons: SchPolygon[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Polygon) continue;
    const pts = parseWireVertices(rec.fields);
    if (pts.length < 3) continue;
    polygons.push({
      recordIndex: rec.index,
      points: pts,
      filled: truthyFlag(rec.fields.get('IsSolid')),
      ownerPartId: parseIntField(rec.fields, 'OwnerPartId', -1),
    });
  }

  const beziers: SchBezier[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Bezier) continue;
    const pts = parseWireVertices(rec.fields);
    if (pts.length < 4) continue;
    beziers.push({
      recordIndex: rec.index,
      points: [pts[0], pts[1], pts[2], pts[3]],
      ownerPartId: parseIntField(rec.fields, 'OwnerPartId', -1),
    });
  }

  const roundRects: SchRoundRect[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.RoundRectangle) continue;
    const f = rec.fields;
    const rxi = parseIntField(f, 'CornerXRadius', 0);
    const rxf = f.has('CornerXRadius_Frac') ? parseIntField(f, 'CornerXRadius_Frac') : 0;
    const ryi = parseIntField(f, 'CornerYRadius', 0);
    const ryf = f.has('CornerYRadius_Frac') ? parseIntField(f, 'CornerYRadius_Frac') : 0;
    roundRects.push({
      recordIndex: rec.index,
      a: readLocation(f),
      b: readCorner(f),
      rx: schCoord(rxi, rxf),
      ry: schCoord(ryi, ryf),
      ownerPartId: parseIntField(f, 'OwnerPartId', -1),
    });
  }

  // --- Connectivity that isn't wires ---

  const busses: SchBus[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.Bus) continue;
    const verts = parseWireVertices(rec.fields);
    if (verts.length >= 2) busses.push({ recordIndex: rec.index, vertices: verts });
  }

  const busEntries: SchBusEntry[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.BusEntry) continue;
    busEntries.push({
      recordIndex: rec.index,
      a: readLocation(rec.fields),
      b: readCorner(rec.fields),
    });
  }

  const noErcs: SchNoErc[] = [];
  for (const rec of records) {
    if (rec.recordType !== RecordType.NoERC) continue;
    noErcs.push({ recordIndex: rec.index, location: readLocation(rec.fields) });
  }

  // --- Sheet title-block parameters ---
  // Altium writes these as orphan Parameter records (no OwnerIndex field). Collect those;
  // also accept Parameters whose OwnerIndex resolves to the Sheet record, in case variants
  // of the format put them there instead.

  const sheetRecordIndex = records.find((r) => r.recordType === RecordType.Sheet)?.index ?? -1;
  {
    const params: { name: string; value: string }[] = [];
    const wellKnown = new Map<string, keyof SchSheetInfo>([
      ['title', 'title'],
      ['revision', 'revision'],
      ['documentnumber', 'documentNumber'],
      ['sheetnumber', 'sheetNumber'],
      ['sheettotal', 'sheetTotal'],
      ['companyname', 'companyName'],
      ['author', 'author'],
      ['drawnby', 'drawnBy'],
      ['date', 'date'],
      ['currentdate', 'date'],
    ]);
    for (const rec of records) {
      if (rec.recordType !== RecordType.Parameter) continue;
      const oi = rec.fields.get('OwnerIndex');
      let isSheetLevel = false;
      if (oi === undefined) {
        isSheetLevel = true;
      } else if (sheetRecordIndex >= 0) {
        const parentIdx = parentRecordIndex(parseInt(oi, 10));
        if (parentIdx === sheetRecordIndex) isSheetLevel = true;
      }
      if (!isSheetLevel) continue;
      const name = getStr(rec.fields, 'Name');
      const value = visibleText(rec.fields);
      if (!name) continue;
      params.push({ name, value });
      const key = wellKnown.get(name.toLowerCase());
      if (key) {
        const bag = sheet as unknown as Record<string, string | null>;
        if (bag[key] == null) bag[key] = value || null;
      }
    }
    sheet.parameters = params;
  }

  // --- Group primitives under their owning component, compute bbox ---
  // ownerPartId on the flat primitive lists is the part index within a multi-part component,
  // not the owner-record index. To attach primitives to components we walk records directly
  // and resolve OwnerIndex → parent record via parentRecordIndex().

  const pushByOwner = (record: ParsedRecord, prim: SchPrimitive) => {
    const oi = record.fields.get('OwnerIndex');
    if (oi === undefined) return;
    const owner = parentRecordIndex(parseInt(oi, 10));
    const comp = componentByRecordIndex.get(owner);
    if (comp) comp.primitives.push(prim);
  };
  for (const rec of records) {
    switch (rec.recordType) {
      case RecordType.Line: {
        pushByOwner(rec, {
          kind: 'line',
          a: readLocation(rec.fields),
          b: readCorner(rec.fields),
          recordIndex: rec.index,
        });
        break;
      }
      case RecordType.Polyline: {
        const pts = parseWireVertices(rec.fields);
        if (pts.length >= 2) {
          pushByOwner(rec, { kind: 'polyline', points: pts, recordIndex: rec.index });
        }
        break;
      }
      case RecordType.Rectangle: {
        pushByOwner(rec, {
          kind: 'rectangle',
          a: readLocation(rec.fields),
          b: readCorner(rec.fields),
          recordIndex: rec.index,
        });
        break;
      }
      case RecordType.RoundRectangle: {
        const f = rec.fields;
        const rxi = parseIntField(f, 'CornerXRadius', 0);
        const rxf = f.has('CornerXRadius_Frac') ? parseIntField(f, 'CornerXRadius_Frac') : 0;
        const ryi = parseIntField(f, 'CornerYRadius', 0);
        const ryf = f.has('CornerYRadius_Frac') ? parseIntField(f, 'CornerYRadius_Frac') : 0;
        pushByOwner(rec, {
          kind: 'roundRect',
          a: readLocation(f),
          b: readCorner(f),
          rx: schCoord(rxi, rxf),
          ry: schCoord(ryi, ryf),
          recordIndex: rec.index,
        });
        break;
      }
      case RecordType.Arc:
      case RecordType.EllipticalArc: {
        const f = rec.fields;
        const rxi = parseIntField(f, 'Radius', 0);
        const rxf = f.has('Radius_Frac') ? parseIntField(f, 'Radius_Frac') : 0;
        pushByOwner(rec, {
          kind: 'arc',
          center: readLocation(f),
          radius: schCoord(rxi, rxf),
          startAngle: parseIntField(f, 'StartAngle', 0),
          endAngle: parseIntField(f, 'EndAngle', 360),
          recordIndex: rec.index,
        });
        break;
      }
      case RecordType.Ellipse: {
        const f = rec.fields;
        const rxi = parseIntField(f, 'Radius', 0);
        const rxf = f.has('Radius_Frac') ? parseIntField(f, 'Radius_Frac') : 0;
        const ryi = parseIntField(f, 'SecondaryRadius', rxi);
        const ryf = f.has('SecondaryRadius_Frac') ? parseIntField(f, 'SecondaryRadius_Frac') : 0;
        pushByOwner(rec, {
          kind: 'ellipse',
          center: readLocation(f),
          rx: schCoord(rxi, rxf),
          ry: schCoord(ryi, ryf),
          recordIndex: rec.index,
        });
        break;
      }
      case RecordType.Polygon: {
        const pts = parseWireVertices(rec.fields);
        if (pts.length >= 3) {
          pushByOwner(rec, {
            kind: 'polygon',
            points: pts,
            filled: truthyFlag(rec.fields.get('IsSolid')),
            recordIndex: rec.index,
          });
        }
        break;
      }
      case RecordType.Bezier: {
        const pts = parseWireVertices(rec.fields);
        if (pts.length >= 4) {
          pushByOwner(rec, {
            kind: 'bezier',
            points: [pts[0], pts[1], pts[2], pts[3]],
            recordIndex: rec.index,
          });
        }
        break;
      }
    }
  }

  // Compute each component's bbox over its primitives + pin hotspots.
  const pinsByComponent = new Map<number, SchPin[]>();
  for (const p of pins) {
    const arr = pinsByComponent.get(p.componentRecordIndex) ?? [];
    arr.push(p);
    pinsByComponent.set(p.componentRecordIndex, arr);
  }
  for (const c of components) {
    let bMinX = Infinity;
    let bMinY = Infinity;
    let bMaxX = -Infinity;
    let bMaxY = -Infinity;
    const addBody = (p: SchPoint) => {
      if (p.x < bMinX) bMinX = p.x;
      if (p.y < bMinY) bMinY = p.y;
      if (p.x > bMaxX) bMaxX = p.x;
      if (p.y > bMaxY) bMaxY = p.y;
    };
    for (const prim of c.primitives) {
      if (prim.kind === 'line' || prim.kind === 'rectangle' || prim.kind === 'roundRect') {
        addBody(prim.a);
        addBody(prim.b);
      } else if (prim.kind === 'polyline' || prim.kind === 'polygon') {
        for (const pt of prim.points) addBody(pt);
      } else if (prim.kind === 'bezier') {
        for (const pt of prim.points) addBody(pt);
      } else if (prim.kind === 'arc') {
        addBody({ x: prim.center.x - prim.radius, y: prim.center.y - prim.radius });
        addBody({ x: prim.center.x + prim.radius, y: prim.center.y + prim.radius });
      } else if (prim.kind === 'ellipse') {
        addBody({ x: prim.center.x - prim.rx, y: prim.center.y - prim.ry });
        addBody({ x: prim.center.x + prim.rx, y: prim.center.y + prim.ry });
      }
    }
    if (Number.isFinite(bMinX)) {
      c.bodyBox = { a: { x: bMinX, y: bMinY }, b: { x: bMaxX, y: bMaxY } };
    }
    // Outer bbox includes pin hotspots too — useful for zoom-to-component and hit testing.
    let minX = bMinX;
    let minY = bMinY;
    let maxX = bMaxX;
    let maxY = bMaxY;
    for (const p of pinsByComponent.get(c.recordIndex) ?? []) {
      if (p.location.x < minX) minX = p.location.x;
      if (p.location.y < minY) minY = p.location.y;
      if (p.location.x > maxX) maxX = p.location.x;
      if (p.location.y > maxY) maxY = p.location.y;
    }
    if (Number.isFinite(minX)) {
      c.bbox = { a: { x: minX, y: minY }, b: { x: maxX, y: maxY } };
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
    roundRects,
    arcs,
    ellipses,
    polygons,
    beziers,
    busses,
    busEntries,
    noErcs,
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
