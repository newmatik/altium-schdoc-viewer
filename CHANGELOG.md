# Changelog

## 0.1.2

- Preview: render more schematic primitives from the SchDoc record stream, including lines, polylines, rectangles, and visible text.
- Preview: draw pin stubs using parsed pin orientation so symbol connections look closer to the original schematic.
- Preview: switch pan/zoom interaction to a `viewBox` camera for better touchpad panning and cursor-anchored zooming.

## 0.1.1

- README: focus on Marketplace install; move VSIX instructions to a short “local development” section at the end.
- Honest wording: draft SVG preview is WIP and not schematic-accurate.
- Remove separate publishing maintainer doc from the repo.

## 0.1.0

Initial public release.

- Parse Altium binary `.SchDoc` / `.SchDot` (OLE2 compound file, `FileHeader` record stream).
- Custom editor: tables for components, pins, nets, parameters, and raw record previews.
- Heuristic netlist from wires, junctions, pin geometry, net labels, and power ports.
- Read-only SVG preview with pan and zoom.
- Commands: export BOM (CSV), export netlist (Protel-style), open raw records as text.
