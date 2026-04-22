import type { SchPoint } from '../../parser/coords';

export interface SvgPreviewInput {
  sheetSize: SchPoint | null;
  wires: { a: SchPoint; b: SchPoint }[];
  lines: { a: SchPoint; b: SchPoint }[];
  polylines: SchPoint[][];
  rectangles: { a: SchPoint; b: SchPoint }[];
  roundRects: { a: SchPoint; b: SchPoint; rx: number; ry: number }[];
  arcs: { center: SchPoint; radius: number; startAngle: number; endAngle: number }[];
  ellipses: { center: SchPoint; rx: number; ry: number }[];
  polygons: { points: SchPoint[]; filled: boolean }[];
  beziers: { points: [SchPoint, SchPoint, SchPoint, SchPoint] }[];
  noErcs: SchPoint[];
  texts: {
    x: number;
    y: number;
    text: string;
    orientation: number;
    kind: 'label' | 'designator' | 'parameter';
  }[];
  components: {
    recordIndex: number;
    designator: string;
    value: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }[];
  pins: {
    recordIndex: number;
    x: number;
    y: number;
    orientation: number;
    pinLength: number;
    designator: string;
    pin: string;
    pinName: string;
  }[];
  junctions: SchPoint[];
  netLabels: { x: number; y: number; text: string }[];
  powerPorts: { x: number; y: number; text: string }[];
}

function boundsOf(input: SvgPreviewInput): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (p: SchPoint) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const s of input.wires) {
    add(s.a);
    add(s.b);
  }
  for (const s of input.lines) {
    add(s.a);
    add(s.b);
  }
  for (const poly of input.polylines) {
    for (const p of poly) add(p);
  }
  for (const rect of input.rectangles) {
    add(rect.a);
    add(rect.b);
  }
  for (const rect of input.roundRects) {
    add(rect.a);
    add(rect.b);
  }
  for (const a of input.arcs) {
    add({ x: a.center.x - a.radius, y: a.center.y - a.radius });
    add({ x: a.center.x + a.radius, y: a.center.y + a.radius });
  }
  for (const e of input.ellipses) {
    add({ x: e.center.x - e.rx, y: e.center.y - e.ry });
    add({ x: e.center.x + e.rx, y: e.center.y + e.ry });
  }
  for (const pg of input.polygons) {
    for (const p of pg.points) add(p);
  }
  for (const bz of input.beziers) {
    for (const p of bz.points) add(p);
  }
  for (const p of input.noErcs) add(p);
  for (const t of input.texts) add({ x: t.x, y: t.y });
  for (const c of input.components) {
    add({ x: c.x, y: c.y });
    add({ x: c.x + c.w, y: c.y + c.h });
  }
  for (const p of input.pins) {
    add({ x: p.x, y: p.y });
    add(pinBodyPoint(p));
  }
  for (const j of input.junctions) add(j);
  for (const n of input.netLabels) add({ x: n.x, y: n.y });
  for (const pp of input.powerPorts) add({ x: pp.x, y: pp.y });
  if (input.sheetSize) {
    add({ x: 0, y: 0 });
    add(input.sheetSize);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  const pad = 40;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pinBodyPoint(pin: { x: number; y: number; orientation: number; pinLength: number }): SchPoint {
  // SchPin.orientation is documented in the parser as "from hotspot toward body":
  //   0 = body is to the left (−X), 1 = body is down in Altium space (−Y),
  //   2 = body is to the right (+X), 3 = body is up in Altium space (+Y).
  // Note Altium Y increases upward; our caller flips Y for screen space.
  const length = Math.max(pin.pinLength, 10);
  switch (((pin.orientation % 4) + 4) % 4) {
    case 0:
      return { x: pin.x - length, y: pin.y };
    case 1:
      return { x: pin.x, y: pin.y - length };
    case 2:
      return { x: pin.x + length, y: pin.y };
    case 3:
      return { x: pin.x, y: pin.y + length };
    default:
      return { x: pin.x, y: pin.y };
  }
}

function arcPathD(
  tx: (x: number) => number,
  ty: (y: number) => number,
  center: SchPoint,
  radius: number,
  startDeg: number,
  endDeg: number
): string {
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = (endDeg * Math.PI) / 180;
  const sx = tx(center.x + radius * Math.cos(a0));
  const sy = ty(center.y + radius * Math.sin(a0));
  const ex = tx(center.x + radius * Math.cos(a1));
  const ey = ty(center.y + radius * Math.sin(a1));
  let sweep = endDeg - startDeg;
  while (sweep < 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;
  // Altium angles are CCW in sheet space (y up). After the caller's y-flip, CCW-in-sheet
  // becomes CW-in-screen. SVG sweep-flag=1 is a positive-angle sweep in the default SVG
  // coordinate system (y down) = CW in screen = what we want.
  const sweepFlag = 1;
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} ${sweepFlag} ${ex} ${ey}`;
}

/**
 * Rotation angle for SVG, accounting for the y-flip.
 *
 * Altium `Orientation` is a CCW rotation in sheet-space coordinates (y up).
 * Our preview flips y for screen-space (y down), which inverts rotation direction.
 * SVG `rotate(a cx cy)` treats positive `a` as CW in screen coordinates.
 *
 * Altium → screen mapping (CCW sheet → CW screen):
 *   0 (0°)       →  0°
 *   1 (90° CCW)  →  90° (CW on screen)
 *   2 (180°)     →  180°
 *   3 (270° CCW) → -90° (or 270°) (CW on screen)
 */
function svgRotationDeg(orientation: number): number {
  const o = ((orientation % 4) + 4) % 4;
  if (o === 1) return 90;
  if (o === 2) return 180;
  if (o === 3) return -90;
  return 0;
}

export function buildSvgPreview(input: SvgPreviewInput): string {
  const b = boundsOf(input);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const tx = (x: number) => x - b.minX;
  const ty = (y: number) => b.maxY - y;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  // Sizes that must stay constant in screen space use calc(n * var(--upp)) where
  // --upp (user-units-per-pixel) is set on the host on every viewBox change.
  parts.push(`<style>
    svg { shape-rendering: geometricPrecision; }
    .preview-sheet { fill: var(--vscode-editor-background, #1e1e1e); stroke: var(--vscode-panel-border, #3c3c3c); stroke-width: calc(1 * var(--upp, 1)); }
    .preview-wire { stroke: var(--ciab-preview-wire, var(--vscode-charts-blue, #7fb0ff)); stroke-width: calc(1.4 * var(--upp, 1)); stroke-linecap: round; stroke-linejoin: round; fill: none; shape-rendering: crispEdges; }
    .preview-bus { stroke: var(--ciab-preview-bus, var(--vscode-charts-purple, #c586c0)); stroke-width: calc(2.5 * var(--upp, 1)); stroke-linecap: round; fill: none; shape-rendering: crispEdges; }
    .preview-bus-entry { stroke: var(--ciab-preview-bus, var(--vscode-charts-purple, #c586c0)); stroke-width: calc(2 * var(--upp, 1)); stroke-linecap: round; fill: none; }
    .preview-line { stroke: var(--ciab-preview-line, var(--vscode-editor-foreground, #d8d8d8)); stroke-width: calc(0.9 * var(--upp, 1)); stroke-linecap: round; fill: none; opacity: 0.78; }
    .preview-box { fill: none; stroke: var(--ciab-preview-line, var(--vscode-editor-foreground, #d8d8d8)); stroke-width: calc(0.9 * var(--upp, 1)); opacity: 0.78; }
    .preview-fill { fill: var(--ciab-preview-fill, color-mix(in srgb, var(--vscode-charts-blue, #7fb0ff) 15%, transparent)); stroke: var(--ciab-preview-line, var(--vscode-editor-foreground, #d8d8d8)); stroke-width: calc(0.9 * var(--upp, 1)); opacity: 0.9; }
    .preview-pin { stroke: var(--ciab-preview-pin, var(--vscode-charts-yellow, #dcdcaa)); stroke-width: calc(1.1 * var(--upp, 1)); stroke-linecap: round; shape-rendering: crispEdges; }
    .preview-pin-hotspot { fill: var(--ciab-preview-pin, var(--vscode-charts-yellow, #dcdcaa)); stroke: var(--vscode-editor-background, #333); stroke-width: calc(0.3 * var(--upp, 1)); r: calc(1.8 * var(--upp, 1)); opacity: 0.9; }
    .preview-junction { fill: var(--ciab-preview-wire, var(--vscode-charts-blue, #569cd6)); r: calc(2.5 * var(--upp, 1)); }
    .preview-component-body { fill: var(--ciab-preview-component-fill, color-mix(in srgb, var(--vscode-charts-blue, #264f78) 18%, transparent)); stroke: var(--ciab-preview-component-stroke, var(--vscode-charts-blue, #3794ff)); stroke-width: calc(0.9 * var(--upp, 1)); stroke-dasharray: calc(3 * var(--upp, 1)) calc(3 * var(--upp, 1)); }
    .preview-text { font-family: var(--vscode-editor-font-family, monospace); pointer-events: none; fill: var(--vscode-editor-foreground, #d0d0d0); font-size: calc(10 * var(--upp, 1)); text-rendering: geometricPrecision; dominant-baseline: middle; }
    .preview-text-designator { font-size: calc(11 * var(--upp, 1)); fill: var(--vscode-editor-foreground, #f5f5f5); font-weight: 600; }
    .preview-text-parameter { font-size: calc(9 * var(--upp, 1)); fill: var(--ciab-preview-value, var(--vscode-charts-green, #b8ddb1)); }
    .preview-netlabel { font-size: calc(10 * var(--upp, 1)); fill: var(--ciab-preview-netlabel, var(--vscode-charts-orange, #ce9178)); font-weight: 500; }
    .preview-powerport { font-size: calc(11 * var(--upp, 1)); fill: var(--ciab-preview-powerport, var(--vscode-charts-purple, #c586c0)); font-weight: 600; text-anchor: middle; }
    .preview-noerc { stroke: var(--ciab-preview-noerc, var(--vscode-editorWarning-foreground, #ffcc00)); stroke-width: calc(1.2 * var(--upp, 1)); stroke-linecap: round; }
    .preview-halo {
      fill: none;
      stroke: var(--ciab-preview-highlight, var(--vscode-charts-yellow, #f5d67d));
      stroke-width: calc(3 * var(--upp, 1));
      stroke-linejoin: round;
      stroke-linecap: round;
      opacity: 0.95;
      pointer-events: none;
    }
  </style>`);
  // Background fills via class so it respects theme.
  parts.push(`<rect class="preview-sheet-bg" x="0" y="0" width="${w}" height="${h}" fill="var(--vscode-editor-background, #1e1e1e)"/>`);
  if (input.sheetSize) {
    const sx = tx(0);
    const sy = ty(input.sheetSize.y);
    const sw = input.sheetSize.x;
    const sh = input.sheetSize.y;
    parts.push(
      `<rect class="preview-sheet" x="${sx}" y="${sy}" width="${sw}" height="${sh}"/>`
    );
  }
  // Component bodies first (below wires/pins). Synthesized from bbox.
  for (const c of input.components) {
    const x = tx(c.x);
    const y = ty(c.y + c.h);
    parts.push(
      `<rect class="preview-component-body" data-ref-kind="component" data-ref-id="${c.recordIndex}" data-designator="${esc(
        c.designator
      )}" x="${x}" y="${y}" width="${c.w}" height="${c.h}" rx="2" ry="2"/>`
    );
  }
  for (const s of input.wires) {
    const x1 = tx(s.a.x);
    const y1 = ty(s.a.y);
    const x2 = tx(s.b.x);
    const y2 = ty(s.b.y);
    parts.push(`<line class="preview-wire" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  }
  for (const s of input.lines) {
    const x1 = tx(s.a.x);
    const y1 = ty(s.a.y);
    const x2 = tx(s.b.x);
    const y2 = ty(s.b.y);
    parts.push(`<line class="preview-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  }
  for (const poly of input.polylines) {
    const points = poly.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ');
    parts.push(`<polyline class="preview-line" points="${points}" stroke-linejoin="miter"/>`);
  }
  for (const rect of input.rectangles) {
    const minX = Math.min(rect.a.x, rect.b.x);
    const maxX = Math.max(rect.a.x, rect.b.x);
    const minY = Math.min(rect.a.y, rect.b.y);
    const maxY = Math.max(rect.a.y, rect.b.y);
    parts.push(
      `<rect class="preview-box" x="${tx(minX)}" y="${ty(maxY)}" width="${maxX - minX}" height="${maxY - minY}"/>`
    );
  }
  for (const rect of input.roundRects) {
    const minX = Math.min(rect.a.x, rect.b.x);
    const maxX = Math.max(rect.a.x, rect.b.x);
    const minY = Math.min(rect.a.y, rect.b.y);
    const maxY = Math.max(rect.a.y, rect.b.y);
    parts.push(
      `<rect class="preview-box" x="${tx(minX)}" y="${ty(maxY)}" width="${maxX - minX}" height="${maxY - minY}" rx="${rect.rx}" ry="${rect.ry}"/>`
    );
  }
  for (const arc of input.arcs) {
    const d = arcPathD(tx, ty, arc.center, arc.radius, arc.startAngle, arc.endAngle);
    parts.push(`<path class="preview-line" d="${d}" fill="none"/>`);
  }
  for (const e of input.ellipses) {
    parts.push(
      `<ellipse class="preview-box" cx="${tx(e.center.x)}" cy="${ty(e.center.y)}" rx="${e.rx}" ry="${e.ry}"/>`
    );
  }
  for (const pg of input.polygons) {
    const points = pg.points.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ');
    const cls = pg.filled ? 'preview-fill' : 'preview-box';
    parts.push(`<polygon class="${cls}" points="${points}"/>`);
  }
  for (const bz of input.beziers) {
    const [p0, p1, p2, p3] = bz.points;
    const d = `M ${tx(p0.x)} ${ty(p0.y)} C ${tx(p1.x)} ${ty(p1.y)}, ${tx(p2.x)} ${ty(p2.y)}, ${tx(p3.x)} ${ty(p3.y)}`;
    parts.push(`<path class="preview-line" d="${d}"/>`);
  }
  for (const p of input.pins) {
    const body = pinBodyPoint(p);
    const x1 = tx(p.x);
    const y1 = ty(p.y);
    const x2 = tx(body.x);
    const y2 = ty(body.y);
    const tooltip = `${esc(p.designator)}-${esc(p.pin)}${p.pinName ? ` (${esc(p.pinName)})` : ''}`;
    parts.push(
      `<line class="preview-pin" data-ref-kind="pin" data-ref-id="${p.recordIndex}" data-designator="${esc(
        p.designator
      )}" data-pin="${esc(p.pin)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><title>${tooltip}</title></line>`
    );
    parts.push(
      `<circle class="preview-pin-hotspot" data-ref-kind="pin" data-ref-id="${p.recordIndex}" data-designator="${esc(
        p.designator
      )}" data-pin="${esc(p.pin)}" cx="${x1}" cy="${y1}"><title>${tooltip}</title></circle>`
    );
  }
  for (const t of input.texts) {
    const x = tx(t.x);
    const y = ty(t.y);
    const rot = svgRotationDeg(t.orientation);
    const transform = rot !== 0 ? ` transform="rotate(${rot} ${x} ${y})"` : '';
    const cls =
      t.kind === 'designator'
        ? 'preview-text preview-text-designator'
        : t.kind === 'parameter'
          ? 'preview-text preview-text-parameter'
          : 'preview-text';
    parts.push(`<text class="${cls}" x="${x}" y="${y}"${transform}>${esc(t.text)}</text>`);
  }
  for (const j of input.junctions) {
    parts.push(`<circle class="preview-junction" cx="${tx(j.x)}" cy="${ty(j.y)}"/>`);
  }
  for (const p of input.noErcs) {
    const cx = tx(p.x);
    const cy = ty(p.y);
    // Fixed user-unit half-size; it will scale with zoom. Fine for a marker.
    const s = 4;
    parts.push(
      `<g class="preview-noerc">` +
        `<line x1="${cx - s}" y1="${cy - s}" x2="${cx + s}" y2="${cy + s}"/>` +
        `<line x1="${cx - s}" y1="${cy + s}" x2="${cx + s}" y2="${cy - s}"/>` +
        `</g>`
    );
  }
  for (const n of input.netLabels) {
    parts.push(
      `<text class="preview-text preview-netlabel" data-ref-kind="netlabel" x="${tx(n.x)}" y="${ty(
        n.y
      )}">${esc(n.text)}</text>`
    );
  }
  for (const pp of input.powerPorts) {
    parts.push(
      `<text class="preview-text preview-powerport" data-ref-kind="power" x="${tx(pp.x)}" y="${ty(
        pp.y
      )}">${esc(pp.text)}</text>`
    );
  }
  parts.push(`</svg>`);
  return parts.join('\n');
}
