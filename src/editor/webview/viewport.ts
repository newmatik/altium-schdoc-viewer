/**
 * Pointer ↔ SVG user-space mapping for the preview pane.
 *
 * The preview SVG uses `preserveAspectRatio="xMidYMid meet"`: the viewBox is scaled uniformly by
 * the smaller of the two axis ratios and centred, so the host has empty bands (letterboxing) on one
 * axis. Mapping a pointer across the whole host rectangle would therefore anchor zoom and pan to
 * the wrong place whenever the host's aspect ratio differs from the viewBox's.
 */

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HostSize {
  width: number;
  height: number;
}

export interface MeetFit {
  /** Pixels per user unit (same on both axes). */
  scale: number;
  /** Left edge of the rendered viewBox inside the host, in pixels. */
  offsetX: number;
  /** Top edge of the rendered viewBox inside the host, in pixels. */
  offsetY: number;
}

/** The uniform scale and centring offsets `xMidYMid meet` applies, or null for a degenerate box. */
export function meetFit(host: HostSize, viewBox: ViewBox): MeetFit | null {
  if (!(host.width > 0) || !(host.height > 0) || !(viewBox.width > 0) || !(viewBox.height > 0)) return null;
  const scale = Math.min(host.width / viewBox.width, host.height / viewBox.height);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return {
    scale,
    offsetX: (host.width - viewBox.width * scale) / 2,
    offsetY: (host.height - viewBox.height * scale) / 2,
  };
}

/** Host-local pixel coordinates → SVG user-space coordinates. */
export function hostToUser(
  host: HostSize,
  viewBox: ViewBox,
  px: number,
  py: number
): { x: number; y: number } | null {
  const fit = meetFit(host, viewBox);
  if (!fit) return null;
  return {
    x: viewBox.x + (px - fit.offsetX) / fit.scale,
    y: viewBox.y + (py - fit.offsetY) / fit.scale,
  };
}

/**
 * The viewBox of the given size that keeps the user-space point currently under host pixel
 * (px, py) under that same pixel.
 */
export function zoomViewBoxAt(
  host: HostSize,
  viewBox: ViewBox,
  px: number,
  py: number,
  width: number,
  height: number
): ViewBox | null {
  const anchor = hostToUser(host, viewBox, px, py);
  if (!anchor) return null;
  const next = { x: 0, y: 0, width, height };
  const fit = meetFit(host, next);
  if (!fit) return null;
  return {
    x: anchor.x - (px - fit.offsetX) / fit.scale,
    y: anchor.y - (py - fit.offsetY) / fit.scale,
    width,
    height,
  };
}

/** Shift the viewBox so content moves by (dx, dy) host pixels. */
export function panViewBox(host: HostSize, viewBox: ViewBox, dx: number, dy: number): ViewBox | null {
  const fit = meetFit(host, viewBox);
  if (!fit) return null;
  return { ...viewBox, x: viewBox.x + dx / fit.scale, y: viewBox.y + dy / fit.scale };
}
