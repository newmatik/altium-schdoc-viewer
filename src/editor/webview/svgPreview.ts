import type { SchPoint } from '../../parser/coords';

export interface SvgPreviewInput {
  sheetSize: SchPoint | null;
  wires: { a: SchPoint; b: SchPoint }[];
  lines: { a: SchPoint; b: SchPoint }[];
  polylines: SchPoint[][];
  rectangles: { a: SchPoint; b: SchPoint }[];
  texts: { x: number; y: number; text: string; orientation: number; kind: 'label' | 'designator' | 'parameter' }[];
  components: { designator: string; value: string; x: number; y: number; w: number; h: number }[];
  pins: { x: number; y: number; orientation: number; pinLength: number; designator: string; pin: string }[];
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

function pinBodyPoint(pin: SvgPreviewInput['pins'][number]): SchPoint {
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
  parts.push(`<style>
    .preview-wire { stroke:#7fb0ff; stroke-width:2.2; stroke-linecap:square; vector-effect:non-scaling-stroke; }
    .preview-line { stroke:#d8d8d8; stroke-width:1.2; stroke-linecap:square; vector-effect:non-scaling-stroke; }
    .preview-box { fill:none; stroke:#d8d8d8; stroke-width:1.2; vector-effect:non-scaling-stroke; }
    .preview-pin { stroke:#dcdcaa; stroke-width:1.8; stroke-linecap:square; vector-effect:non-scaling-stroke; }
    .preview-pin-hotspot { fill:#dcdcaa; stroke:#333; stroke-width:0.5; vector-effect:non-scaling-stroke; }
    .preview-junction { fill:#569cd6; vector-effect:non-scaling-stroke; }
    .preview-text { font-family:system-ui,sans-serif; pointer-events:none; }
  </style>`);
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#1e1e1e"/>`);
  if (input.sheetSize) {
    const sx = tx(0);
    const sy = ty(input.sheetSize.y);
    const sw = input.sheetSize.x;
    const sh = input.sheetSize.y;
    parts.push(
      `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="#252526" stroke="#3c3c3c" stroke-width="2"/>`
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
    parts.push(`<polyline class="preview-line" points="${points}" fill="none" stroke-linejoin="miter"/>`);
  }
  for (const rect of input.rectangles) {
    const minX = Math.min(rect.a.x, rect.b.x);
    const maxX = Math.max(rect.a.x, rect.b.x);
    const minY = Math.min(rect.a.y, rect.b.y);
    const maxY = Math.max(rect.a.y, rect.b.y);
    parts.push(`<rect class="preview-box" x="${tx(minX)}" y="${ty(maxY)}" width="${maxX - minX}" height="${maxY - minY}"/>`);
  }
  for (const c of input.components) {
    const x = tx(c.x);
    const y = ty(c.y + c.h);
    parts.push(
      `<rect x="${x}" y="${y}" width="${c.w}" height="${c.h}" fill="#264f78" stroke="#3794ff" stroke-width="1" rx="2"/>`
    );
    parts.push(
      `<text x="${x + 4}" y="${y + 14}" fill="#d4d4d4" font-size="11" font-family="system-ui,sans-serif">${esc(
        c.designator
      )}</text>`
    );
    parts.push(
      `<text x="${x + 4}" y="${y + 28}" fill="#b5cea8" font-size="10" font-family="system-ui,sans-serif">${esc(
        c.value.slice(0, 40)
      )}</text>`
    );
  }
  for (const t of input.texts) {
    const x = tx(t.x);
    const y = ty(t.y);
    const color = t.kind === 'designator' ? '#f5f5f5' : t.kind === 'parameter' ? '#b8ddb1' : '#d0d0d0';
    const fontSize = t.kind === 'designator' ? 12 : 10;
    const rotation = ((t.orientation % 4) + 4) % 4;
    let transform = '';
    if (rotation === 1) transform = ` transform="rotate(-90 ${x} ${y})"`;
    if (rotation === 2) transform = ` transform="rotate(180 ${x} ${y})"`;
    if (rotation === 3) transform = ` transform="rotate(90 ${x} ${y})"`;
    parts.push(
      `<text class="preview-text" x="${x}" y="${y}" fill="${color}" font-size="${fontSize}"${transform}>${esc(
        t.text
      )}</text>`
    );
  }
  for (const p of input.pins) {
    const body = pinBodyPoint(p);
    parts.push(
      `<line class="preview-pin" x1="${tx(p.x)}" y1="${ty(p.y)}" x2="${tx(body.x)}" y2="${ty(body.y)}"><title>${esc(
        p.designator
      )}-${esc(p.pin)}</title></line>`
    );
    const cx = tx(p.x);
    const cy = ty(p.y);
    parts.push(`<circle class="preview-pin-hotspot" cx="${cx}" cy="${cy}" r="3">`);
    parts.push(`<title>${esc(p.designator)}-${esc(p.pin)}</title>`);
    parts.push(`</circle>`);
  }
  for (const j of input.junctions) {
    const cx = tx(j.x);
    const cy = ty(j.y);
    parts.push(`<circle class="preview-junction" cx="${cx}" cy="${cy}" r="4"/>`);
  }
  for (const n of input.netLabels) {
    parts.push(
      `<text class="preview-text" x="${tx(n.x)}" y="${ty(n.y)}" fill="#ce9178" font-size="11">${esc(
        n.text
      )}</text>`
    );
  }
  for (const pp of input.powerPorts) {
    parts.push(
      `<text class="preview-text" x="${tx(pp.x)}" y="${ty(pp.y)}" fill="#c586c0" font-size="12" font-weight="600">${esc(
        pp.text
      )}</text>`
    );
  }
  parts.push(`</svg>`);
  return parts.join('\n');
}
