/**
 * Allowlist sanitizer for the preview SVG before it is inserted into the webview DOM.
 *
 * The SVG is built by `buildSvgPreview`, which escapes every string taken from the schematic, but
 * those strings still originate in an untrusted `.SchDoc`. Instead of trusting that every future
 * code path escapes correctly, the webview keeps only the elements and attributes the builder
 * actually emits. Anything else — `<script>`, `<foreignObject>`, `<a>`, `<image>`, `<use>`,
 * `on*` handlers, `href`/`xlink:href`, inline `style` attributes — is dropped.
 *
 * Written against a minimal structural interface (not the DOM lib types) so it can be unit-tested
 * in Node without a DOM implementation.
 */

export interface SanitizableAttr {
  readonly name: string;
}

export interface SanitizableElement {
  readonly localName: string;
  readonly attributes: ArrayLike<SanitizableAttr>;
  readonly children: ArrayLike<SanitizableElement>;
  removeAttribute(name: string): void;
  remove(): void;
}

/** Element names the preview builder emits. `style` holds the builder's own static stylesheet. */
export const ALLOWED_SVG_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'style',
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
  if (root.localName.toLowerCase() !== 'svg') return false;
  sanitizeElement(root);
  return true;
}

function sanitizeElement(node: SanitizableElement): void {
  // Snapshot: removing attributes/children mutates the live collections.
  const attrNames = Array.from(node.attributes, (a) => a.name);
  for (const name of attrNames) {
    if (!ALLOWED_SVG_ATTRIBUTES.has(name.toLowerCase())) node.removeAttribute(name);
  }
  const children = Array.from(node.children);
  for (const child of children) {
    if (!ALLOWED_SVG_ELEMENTS.has(child.localName.toLowerCase())) {
      child.remove();
      continue;
    }
    sanitizeElement(child);
  }
}
