import { describe, expect, it } from 'vitest';
import { csvFromTable, netConnectionRows, neutralizeFormula } from '../src/editor/webview/csv';
import { buildSvgPreview, PREVIEW_SVG_CSS } from '../src/editor/webview/svgPreview';
import {
  ALLOWED_SVG_ATTRIBUTES,
  ALLOWED_SVG_ELEMENTS,
  sanitizeSvgTree,
  SVG_NAMESPACE,
  type SanitizableElement,
} from '../src/editor/webview/svgSanitize';
import { hostToUser, meetFit, panViewBox, zoomViewBoxAt } from '../src/editor/webview/viewport';

describe('nets CSV export', () => {
  it('quotes net and pin names containing commas, quotes or line breaks', () => {
    const csv = csvFromTable(
      ['Net', 'Pin', 'PinName'],
      netConnectionRows([
        { name: 'SDA,SCL', pins: [{ designator: 'U1', pin: '3', pinName: 'IN "A"' }] },
        { name: 'VCC', pins: [{ designator: 'R1', pin: '1', pinName: 'line\nbreak' }] },
      ])
    );
    expect(csv).toBe('Net,Pin,PinName\n"SDA,SCL",U1-3,"IN ""A"""\nVCC,R1-1,"line\nbreak"\n');
  });

  it('neutralizes cells a spreadsheet would evaluate as a formula', () => {
    expect(neutralizeFormula('=HYPERLINK("http://x","y")')).toBe(`'=HYPERLINK("http://x","y")`);
    expect(neutralizeFormula('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(neutralizeFormula('\tX')).toBe(`'\tX`);
    expect(neutralizeFormula("+cmd|' /C calc'!A0")).toBe(`'+cmd|' /C calc'!A0`);
    expect(neutralizeFormula('-1+SUM(A1)')).toBe(`'-1+SUM(A1)`);
    expect(csvFromTable(['Net'], [['=1+1,2']])).toBe(`Net\n"'=1+1,2"\n`);
  });

  it('keeps power-net names and other ordinary values unchanged', () => {
    for (const v of ['+3V3', '+5V', '-12V', '+VBAT', '-', 'GND', 'A-B', '10k', '']) {
      expect(neutralizeFormula(v), v).toBe(v);
    }
  });

  it('emits one row per pin connection', () => {
    const rows = netConnectionRows([
      { name: 'GND', pins: [{ designator: 'C1', pin: '2', pinName: '' }, { designator: 'U1', pin: '8', pinName: 'GND' }] },
    ]);
    expect(rows).toEqual([['GND', 'C1-2', ''], ['GND', 'U1-8', 'GND']]);
  });
});

/** Minimal mutable element tree implementing the sanitizer's structural interface. */
class FakeElement implements SanitizableElement {
  attrs: { name: string }[];
  kids: FakeElement[] = [];
  parent: FakeElement | null = null;
  constructor(
    readonly localName: string,
    attrNames: string[] = [],
    children: FakeElement[] = [],
    readonly namespaceURI: string | null = SVG_NAMESPACE
  ) {
    this.attrs = attrNames.map((name) => ({ name }));
    for (const c of children) {
      c.parent = this;
      this.kids.push(c);
    }
  }
  get attributes() {
    return this.attrs;
  }
  get children() {
    return this.kids;
  }
  removeAttribute(name: string) {
    this.attrs = this.attrs.filter((a) => a.name !== name);
  }
  remove() {
    if (this.parent) this.parent.kids = this.parent.kids.filter((k) => k !== this);
  }
}

describe('preview SVG sanitizer', () => {
  it('drops script, foreignObject, links and images with their subtrees', () => {
    const text = new FakeElement('text', ['class', 'x', 'y']);
    const root = new FakeElement('svg', ['xmlns', 'viewBox', 'preserveAspectRatio'], [
      new FakeElement('script'),
      new FakeElement('foreignObject', [], [new FakeElement('div')]),
      new FakeElement('a', ['href'], [new FakeElement('rect')]),
      new FakeElement('image', ['href']),
      new FakeElement('use', ['xlink:href']),
      new FakeElement('g', ['class'], [text, new FakeElement('SCRIPT')]),
    ]);
    expect(sanitizeSvgTree(root)).toBe(true);
    expect(root.kids.map((k) => k.localName)).toEqual(['g']);
    expect(root.kids[0]!.kids).toEqual([text]);
    expect(root.attrs.map((a) => a.name)).toEqual(['xmlns', 'viewBox', 'preserveAspectRatio']);
  });

  it('strips event handlers, href and inline style attributes but keeps builder attributes', () => {
    const line = new FakeElement('line', [
      'class', 'data-ref-kind', 'data-ref-id', 'data-designator', 'data-pin',
      'x1', 'y1', 'x2', 'y2', 'onclick', 'ONLOAD', 'href', 'xlink:href', 'style',
    ]);
    const root = new FakeElement('svg', ['onload'], [line]);
    sanitizeSvgTree(root);
    expect(root.attrs).toEqual([]);
    expect(line.attrs.map((a) => a.name)).toEqual([
      'class', 'data-ref-kind', 'data-ref-id', 'data-designator', 'data-pin', 'x1', 'y1', 'x2', 'y2',
    ]);
  });

  it('allows every element and attribute the preview builder emits', () => {
    const p = (x: number, y: number) => ({ x, y });
    const markup = buildSvgPreview({
      sheetSize: p(1000, 800),
      wires: [{ a: p(0, 0), b: p(10, 0) }],
      lines: [{ a: p(0, 0), b: p(0, 10) }],
      polylines: [[p(0, 0), p(5, 5), p(10, 0)]],
      rectangles: [{ a: p(0, 0), b: p(5, 5) }],
      roundRects: [{ a: p(0, 0), b: p(5, 5), rx: 1, ry: 1 }],
      arcs: [{ center: p(5, 5), radius: 2, startAngle: 0, endAngle: 90 }],
      ellipses: [{ center: p(5, 5), rx: 2, ry: 1 }],
      polygons: [{ points: [p(0, 0), p(1, 1), p(2, 0)], filled: true }],
      beziers: [{ points: [p(0, 0), p(1, 1), p(2, 1), p(3, 0)] }],
      noErcs: [p(3, 3)],
      texts: [{ x: 1, y: 1, text: 'T', orientation: 1, kind: 'designator' }],
      components: [{ recordIndex: 1, designator: 'U1', value: 'X', x: 0, y: 0, w: 5, h: 5 }],
      pins: [{ recordIndex: 2, x: 0, y: 0, orientation: 0, pinLength: 10, designator: 'U1', pin: '1', pinName: 'A' }],
      junctions: [p(0, 0)],
      netLabels: [{ x: 0, y: 0, text: 'N' }],
      powerPorts: [{ x: 0, y: 0, text: 'VCC' }],
    });
    const elements = new Set(Array.from(markup.matchAll(/<([a-zA-Z][\w:-]*)/g), (m) => m[1]!.toLowerCase()));
    const attributes = new Set(
      Array.from(markup.matchAll(/\s([a-zA-Z][\w:-]*)="/g), (m) => m[1]!.toLowerCase())
    );
    expect(elements.has('style')).toBe(false);
    expect([...elements].filter((e) => !ALLOWED_SVG_ELEMENTS.has(e))).toEqual([]);
    expect([...attributes].filter((a) => !ALLOWED_SVG_ATTRIBUTES.has(a))).toEqual([]);
  });

  it('rejects a root that is not <svg>', () => {
    expect(sanitizeSvgTree(new FakeElement('img', ['onerror']))).toBe(false);
  });

  it('rejects an <svg> root outside the SVG namespace', () => {
    expect(sanitizeSvgTree(new FakeElement('svg', [], [], 'http://www.w3.org/1999/xhtml'))).toBe(false);
  });

  it('drops <style> and every element outside the SVG namespace', () => {
    const XHTML = 'http://www.w3.org/1999/xhtml';
    const rect = new FakeElement('rect', ['x']);
    const root = new FakeElement('svg', [], [
      new FakeElement('style'),
      new FakeElement('rect', ['x'], [], XHTML),
      new FakeElement('g', [], [new FakeElement('circle', [], [], null)]),
      rect,
    ]);
    sanitizeSvgTree(root);
    expect(root.kids.map((k) => k.localName)).toEqual(['g', 'rect']);
    expect(root.kids[0]!.kids).toEqual([]);
    expect(root.kids[1]).toBe(rect);
  });

  it('drops element children of <title> and <text>, which only ever hold text', () => {
    // As parsed from text/html: <title> is an HTML integration point, so <style>/<img> inside it
    // land in the XHTML namespace.
    const XHTML = 'http://www.w3.org/1999/xhtml';
    const title = new FakeElement('title', [], [new FakeElement('style', [], [], XHTML), new FakeElement('img', ['onerror'], [], XHTML)]);
    const text = new FakeElement('text', ['x', 'y'], [new FakeElement('tspan')]);
    const root = new FakeElement('svg', [], [new FakeElement('line', ['x1'], [title]), text]);
    sanitizeSvgTree(root);
    expect(title.kids).toEqual([]);
    expect(text.kids).toEqual([]);
    expect(root.kids.map((k) => k.localName)).toEqual(['line', 'text']);
    expect(root.kids[0]!.kids).toEqual([title]);
  });

  it('styles every builder class from the webview CSS, not an embedded stylesheet', () => {
    expect(PREVIEW_SVG_CSS).not.toContain('`');
    for (const cls of ['preview-wire', 'preview-pin', 'preview-text', 'preview-netlabel', 'preview-halo']) {
      expect(PREVIEW_SVG_CSS).toContain(`.${cls}`);
    }
  });
});

describe('preview viewport mapping (xMidYMid meet)', () => {
  // A 1000x500 viewBox in a 400x400 host: scale 0.4, letterboxed by 100 px top and bottom.
  const host = { width: 400, height: 400 };
  const vb = { x: 0, y: 0, width: 1000, height: 500 };

  it('accounts for letterboxing when mapping pointer to user space', () => {
    expect(meetFit(host, vb)).toEqual({ scale: 0.4, offsetX: 0, offsetY: 100 });
    // The host centre is the viewBox centre, not (500, 250 * 400/400 …).
    expect(hostToUser(host, vb, 200, 200)).toEqual({ x: 500, y: 250 });
    // The top edge of the rendered sheet sits 100 px down the host.
    expect(hostToUser(host, vb, 0, 100)).toEqual({ x: 0, y: 0 });
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const px = 300;
    const py = 150;
    const before = hostToUser(host, vb, px, py)!;
    const next = zoomViewBoxAt(host, vb, px, py, 500, 250)!;
    const after = hostToUser(host, next, px, py)!;
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(next.width).toBe(500);
    expect(next.height).toBe(250);
  });

  it('pans by the same user-space distance on both axes', () => {
    const next = panViewBox(host, vb, 40, 40)!;
    expect(next.x).toBeCloseTo(100, 9);
    expect(next.y).toBeCloseTo(100, 9);
  });

  it('returns null for a collapsed host', () => {
    expect(hostToUser({ width: 0, height: 0 }, vb, 0, 0)).toBeNull();
    expect(panViewBox({ width: 0, height: 10 }, vb, 1, 1)).toBeNull();
  });
});
