/** Altium schematic coordinates: integer part + optional fractional sub-step. */
export interface SchPoint {
  x: number;
  y: number;
}

export function parseIntField(fields: Map<string, string>, key: string, fallback = 0): number {
  const v = fields.get(key);
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Combine integer coordinate with optional _Frac field (Altium binary convention). */
export function schCoord(intPart: number, fracPart?: number): number {
  if (fracPart === undefined || fracPart === 0) return intPart;
  return intPart + fracPart / 1_000_000;
}

export function readCoordPair(
  fields: Map<string, string>,
  xKey: string,
  yKey: string,
  xFracKey: string,
  yFracKey: string
): SchPoint {
  const xi = parseIntField(fields, xKey);
  const yi = parseIntField(fields, yKey);
  const xf = fields.has(xFracKey) ? parseIntField(fields, xFracKey) : 0;
  const yf = fields.has(yFracKey) ? parseIntField(fields, yFracKey) : 0;
  return { x: schCoord(xi, xf), y: schCoord(yi, yf) };
}

export function readLocation(fields: Map<string, string>): SchPoint {
  return readCoordPair(fields, 'Location.X', 'Location.Y', 'Location.X_Frac', 'Location.Y_Frac');
}

export function readCorner(fields: Map<string, string>): SchPoint {
  return readCoordPair(fields, 'Corner.X', 'Corner.Y', 'Corner.X_Frac', 'Corner.Y_Frac');
}

/** Quantize for connectivity keys (decimil-ish resolution). */
export function coordKey(p: SchPoint, decimals = 3): string {
  const f = 10 ** decimals;
  const x = Math.round(p.x * f) / f;
  const y = Math.round(p.y * f) / f;
  return `${x},${y}`;
}

/** Rotate point (dx, dy) by Altium Orientation 0..3 (90° CCW steps), optional mirror X. */
export function rotateOffset(dx: number, dy: number, orientation: number, mirrored: boolean): SchPoint {
  let x = dx;
  let y = dy;
  if (mirrored) x = -x;
  const o = ((orientation % 4) + 4) % 4;
  for (let i = 0; i < o; i++) {
    const nx = -y;
    const ny = x;
    x = nx;
    y = ny;
  }
  return { x, y };
}
