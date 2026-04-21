import { coordKey, type SchPoint } from '../parser/coords';
import type { ParsedSchDoc, SchComponent, SchPin } from '../parser/schematic';

const EPS = 0.12;

export interface NetPinRef {
  designator: string;
  pin: string;
  pinName: string;
}

export interface BuiltNet {
  id: string;
  name: string;
  pins: NetPinRef[];
}

class UF {
  private parent: number[] = [];
  makeSet(): number {
    const i = this.parent.length;
    this.parent.push(i);
    return i;
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function distPointToSegment(p: SchPoint, a: SchPoint, b: SchPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}

function pinTouchesSegment(pin: SchPoint, a: SchPoint, b: SchPoint): boolean {
  return distPointToSegment(pin, a, b) < EPS;
}

function parseKey(k: string): SchPoint {
  const [xs, ys] = k.split(',');
  return { x: Number(xs), y: Number(ys) };
}

function distKeys(k1: string, k2: string): number {
  const a = parseKey(k1);
  const b = parseKey(k2);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function buildNetlist(doc: ParsedSchDoc): BuiltNet[] {
  const compByIdx = new Map<number, SchComponent>();
  for (const c of doc.components) compByIdx.set(c.recordIndex, c);

  const uf = new UF();
  const keyToNode = new Map<string, number>();

  function nodeForKey(k: string): number {
    let n = keyToNode.get(k);
    if (n === undefined) {
      n = uf.makeSet();
      keyToNode.set(k, n);
    }
    return n;
  }

  const electricalKeys = new Set<string>();

  for (const w of doc.wires) {
    for (let i = 0; i < w.vertices.length - 1; i++) {
      const a = w.vertices[i];
      const b = w.vertices[i + 1];
      const ka = coordKey(a, 3);
      const kb = coordKey(b, 3);
      electricalKeys.add(ka);
      electricalKeys.add(kb);
      uf.union(nodeForKey(ka), nodeForKey(kb));
    }
  }

  for (const pin of doc.pins) {
    const pk = coordKey(pin.location, 3);
    electricalKeys.add(pk);
    const pn = nodeForKey(pk);
    for (const w of doc.wires) {
      for (let i = 0; i < w.vertices.length - 1; i++) {
        const a = w.vertices[i];
        const b = w.vertices[i + 1];
        if (pinTouchesSegment(pin.location, a, b)) {
          uf.union(pn, nodeForKey(coordKey(a, 3)));
          uf.union(pn, nodeForKey(coordKey(b, 3)));
        }
      }
    }
  }

  for (const j of doc.junctions) {
    const jk = coordKey(j.location, 3);
    const jn = nodeForKey(jk);
    electricalKeys.add(jk);
    for (const ek of electricalKeys) {
      if (distKeys(jk, ek) < 12) {
        uf.union(jn, nodeForKey(ek));
      }
    }
  }

  const labels: { name: string; k: string; prio: number; p: SchPoint }[] = [];
  for (const pp of doc.powerPorts) {
    const k = coordKey(pp.location, 3);
    labels.push({ name: pp.text.trim(), k, prio: 0, p: pp.location });
    nodeForKey(k);
  }
  for (const nl of doc.netLabels) {
    const k = coordKey(nl.location, 3);
    labels.push({ name: nl.text.trim(), k, prio: 1, p: nl.location });
    nodeForKey(k);
  }

  /** Attach labels to nets: nearest vertex, else nearest point on any wire segment. */
  const labelSnapMax = 220;
  for (const L of labels) {
    const ln = nodeForKey(L.k);
    let best: string | null = null;
    let bestD = Infinity;
    for (const ek of electricalKeys) {
      const d = distKeys(L.k, ek);
      if (d < bestD) {
        bestD = d;
        best = ek;
      }
    }
    if (best !== null && bestD < labelSnapMax) {
      uf.union(ln, nodeForKey(best));
    }
    let segD = Infinity;
    let segA: SchPoint | null = null;
    let segB: SchPoint | null = null;
    for (const w of doc.wires) {
      for (let i = 0; i < w.vertices.length - 1; i++) {
        const a = w.vertices[i];
        const b = w.vertices[i + 1];
        const d = distPointToSegment(L.p, a, b);
        if (d < segD) {
          segD = d;
          segA = a;
          segB = b;
        }
      }
    }
    if (segA && segB && segD < labelSnapMax) {
      uf.union(ln, nodeForKey(coordKey(segA, 3)));
      uf.union(ln, nodeForKey(coordKey(segB, 3)));
    }
  }

  const rootToPins = new Map<number, NetPinRef[]>();
  for (const pin of doc.pins) {
    const comp = compByIdx.get(pin.componentRecordIndex);
    const des = comp?.designator ?? `R${pin.componentRecordIndex}`;
    const pk = coordKey(pin.location, 3);
    const root = uf.find(nodeForKey(pk));
    const arr = rootToPins.get(root) ?? [];
    arr.push({ designator: des, pin: pin.pinDesignator, pinName: pin.name });
    rootToPins.set(root, arr);
  }

  const rootToName = new Map<number, string>();
  for (const L of labels.sort((a, b) => a.prio - b.prio)) {
    if (!L.name) continue;
    const root = uf.find(nodeForKey(L.k));
    if (!rootToName.has(root)) rootToName.set(root, L.name);
  }

  let auto = 1;
  const nets: BuiltNet[] = [];
  const seen = new Set<number>();
  for (const pin of doc.pins) {
    const pk = coordKey(pin.location, 3);
    const root = uf.find(nodeForKey(pk));
    if (seen.has(root)) continue;
    seen.add(root);
    const pins = (rootToPins.get(root) ?? []).slice().sort((a, b) => {
      const d = a.designator.localeCompare(b.designator);
      return d !== 0 ? d : a.pin.localeCompare(b.pin, undefined, { numeric: true });
    });
    if (pins.length === 0) continue;
    const name = rootToName.get(root) ?? `N$${String(auto++).padStart(3, '0')}`;
    nets.push({ id: `net-${root}`, name, pins });
  }

  nets.sort((a, b) => a.name.localeCompare(b.name));
  return nets;
}

export function wireSegmentsForPreview(doc: ParsedSchDoc): { a: SchPoint; b: SchPoint }[] {
  const segs: { a: SchPoint; b: SchPoint }[] = [];
  for (const w of doc.wires) {
    for (let i = 0; i < w.vertices.length - 1; i++) {
      segs.push({ a: w.vertices[i], b: w.vertices[i + 1] });
    }
  }
  return segs;
}
