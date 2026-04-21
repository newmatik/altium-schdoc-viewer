import type { SchPoint } from '../../parser/coords';

export interface SvgPreviewInput {
  sheetSize: SchPoint | null;
  wires: { a: SchPoint; b: SchPoint }[];
  components: { designator: string; value: string; x: number; y: number; w: number; h: number }[];
  pins: { x: number; y: number; designator: string; pin: string }[];
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
  for (const c of input.components) {
    add({ x: c.x, y: c.y });
    add({ x: c.x + c.w, y: c.y + c.h });
  }
  for (const p of input.pins) add({ x: p.x, y: p.y });
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
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#569cd6" stroke-width="2" stroke-linecap="square"/>`
    );
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
  for (const p of input.pins) {
    const cx = tx(p.x);
    const cy = ty(p.y);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="#dcdcaa" stroke="#333" stroke-width="0.5">`);
    parts.push(`<title>${esc(p.designator)}-${esc(p.pin)}</title>`);
    parts.push(`</circle>`);
  }
  for (const j of input.junctions) {
    const cx = tx(j.x);
    const cy = ty(j.y);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="4" fill="#569cd6"/>`);
  }
  for (const n of input.netLabels) {
    parts.push(
      `<text x="${tx(n.x)}" y="${ty(n.y)}" fill="#ce9178" font-size="11" font-family="system-ui,sans-serif">${esc(
        n.text
      )}</text>`
    );
  }
  for (const pp of input.powerPorts) {
    parts.push(
      `<text x="${tx(pp.x)}" y="${ty(pp.y)}" fill="#c586c0" font-size="12" font-weight="600" font-family="system-ui,sans-serif">${esc(
        pp.text
      )}</text>`
    );
  }
  parts.push(`</svg>`);
  return parts.join('\n');
}
