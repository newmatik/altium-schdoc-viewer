/**
 * Allowlist sanitizer for the preview SVG before it is inserted into the webview DOM.
 *
 * The SVG is built by `buildSvgPreview`, which escapes every string taken from the schematic, but
 * those strings still originate in an untrusted `.SchDoc`. Instead of trusting that every future
 * code path escapes correctly, the webview keeps only the elements and attributes the builder
 * actually emits. Anything else — `<script>`, `<foreignObject>`, `<a>`, `<image>`, `<use>`, `<style>`,
 * `on*` handlers, `href`/`xlink:href`, inline `style` attributes — is dropped.
 *
 * Elements are matched by local name *and* SVG namespace. The markup is parsed as `text/html`, where
 * an SVG `<title>` is an HTML integration point, so `<title><style>…</style></title>` would yield an
 * HTML-namespace `<style>` with a matching local name. `<title>` and `<text>` only ever hold text, so
 * any element inside them is dropped as well.
 *
 * Written against a minimal structural interface (not the DOM lib types) so it can be unit-tested
 * in Node without a DOM implementation.
 */

export interface SanitizableAttr {
  readonly name: string;
}

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export interface SanitizableElement {
  readonly localName: string;
  readonly namespaceURI: string | null;
  readonly attributes: ArrayLike<SanitizableAttr>;
  readonly children: ArrayLike<SanitizableElement>;
  removeAttribute(name: string): void;
  remove(): void;
}

/**
 * Element names the preview builder emits. There is deliberately no `style`: the preview classes are
 * styled by the webview stylesheet (`PREVIEW_SVG_CSS`).
 */
export const ALLOWED_SVG_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'rect',
  'line',
  'polyline',
  'polygon',
  'path',
  'circle',
  'ellipse',
  'text',
  'title',
]);

/** Allowed elements whose content is text only; element children are dropped. */
const TEXT_ONLY_ELEMENTS: ReadonlySet<string> = new Set(['text', 'title']);

/** Attribute names the preview builder emits. */
export const ALLOWED_SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  'xmlns',
  'viewbox',
  'preserveaspectratio',
  'width',
  'height',
  'class',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'fill',
  'stroke-linejoin',
  'data-ref-kind',
  'data-ref-id',
  'data-designator',
  'data-pin',
]);

/**
 * Remove every disallowed element (with its subtree) and attribute, in place.
 * Returns false when the root itself is not an allowed `<svg>` element; the caller must then
 * discard it.
 */
export function sanitizeSvgTree(root: SanitizableElement): boolean {
  if (!isSvgElement(root, 'svg')) return false;
  sanitizeElement(root);
  return true;
}

function isSvgElement(node: SanitizableElement, name?: string): boolean {
  if (node.namespaceURI !== SVG_NAMESPACE) return false;
  const localName = node.localName.toLowerCase();
  return name === undefined ? ALLOWED_SVG_ELEMENTS.has(localName) : localName === name;
}

function sanitizeElement(node: SanitizableElement): void {
  // Snapshot: removing attributes/children mutates the live collections.
  const attrNames = Array.from(node.attributes, (a) => a.name);
  for (const name of attrNames) {
    if (!ALLOWED_SVG_ATTRIBUTES.has(name.toLowerCase())) node.removeAttribute(name);
  }
  const textOnly = TEXT_ONLY_ELEMENTS.has(node.localName.toLowerCase());
  const children = Array.from(node.children);
  for (const child of children) {
    if (textOnly || !isSvgElement(child)) {
      child.remove();
      continue;
    }
    sanitizeElement(child);
  }
}
