import { describe, expect, it } from 'vitest';
import { coordKey, parseIntField, readCorner, readLocation, rotateOffset, schCoord } from '../src/parser/coords';

describe('schCoord', () => {
  it('returns the integer part when the fraction is missing or zero', () => {
    expect(schCoord(100)).toBe(100);
    expect(schCoord(100, 0)).toBe(100);
  });
  it('adds the fraction in millionths', () => {
    expect(schCoord(100, 500_000)).toBe(100.5);
    expect(schCoord(-10, 250_000)).toBe(-9.75);
  });
});

describe('parseIntField', () => {
  it('falls back for missing, empty and non-numeric values', () => {
    const f = new Map([['A', ''], ['B', 'xyz'], ['C', '42']]);
    expect(parseIntField(f, 'missing')).toBe(0);
    expect(parseIntField(f, 'A', 7)).toBe(7);
    expect(parseIntField(f, 'B', 9)).toBe(9);
    expect(parseIntField(f, 'C')).toBe(42);
  });
});

describe('readLocation / readCorner', () => {
  it('combines integer and _Frac fields', () => {
    const f = new Map([
      ['Location.X', '10'],
      ['Location.Y', '20'],
      ['Location.X_Frac', '500000'],
      ['Corner.X', '1'],
      ['Corner.Y', '2'],
      ['Corner.Y_Frac', '100000'],
    ]);
    expect(readLocation(f)).toEqual({ x: 10.5, y: 20 });
    expect(readCorner(f)).toEqual({ x: 1, y: 2.1 });
  });
  it('defaults to the origin when fields are absent', () => {
    expect(readLocation(new Map())).toEqual({ x: 0, y: 0 });
  });
});

describe('coordKey', () => {
  it('quantizes to the requested decimals so near-equal points share a key', () => {
    expect(coordKey({ x: 1.00004, y: 2 })).toBe(coordKey({ x: 1, y: 2 }));
    expect(coordKey({ x: 1.0006, y: 2 })).not.toBe(coordKey({ x: 1, y: 2 }));
    expect(coordKey({ x: 1.26, y: 2.74 }, 1)).toBe('1.3,2.7');
  });
});

// Normalize -0 so toEqual does not trip over signed zeros.
const rot = (...a: Parameters<typeof rotateOffset>) => {
  const r = rotateOffset(...a);
  return { x: r.x + 0, y: r.y + 0 };
};

describe('rotateOffset', () => {
  it('rotates in 90 degree counter-clockwise steps', () => {
    expect(rot(1, 0, 0, false)).toEqual({ x: 1, y: 0 });
    expect(rot(1, 0, 1, false)).toEqual({ x: 0, y: 1 });
    expect(rot(1, 0, 2, false)).toEqual({ x: -1, y: 0 });
    expect(rot(1, 0, 3, false)).toEqual({ x: 0, y: -1 });
  });
  it('wraps orientations and handles negatives', () => {
    expect(rot(1, 0, 4, false)).toEqual({ x: 1, y: 0 });
    expect(rot(1, 0, -1, false)).toEqual({ x: 0, y: -1 });
  });
  it('mirrors X before rotating', () => {
    expect(rot(1, 2, 0, true)).toEqual({ x: -1, y: 2 });
    expect(rot(1, 0, 1, true)).toEqual({ x: 0, y: -1 });
  });
});
