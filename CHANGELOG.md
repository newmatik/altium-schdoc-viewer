# Changelog

## 0.2.0

### Tables

- All table headers are now **sortable**. Click once for ascending, again for descending,
  again to clear. Sort state is remembered per tab. Arrow indicator on the active column.
  Numeric-aware compare orders `R1, R2, R10` correctly.
- Tables default-sort by their primary column on first open (designator / net name).

### Preview (fixes the buggy rendering on real sheets)

- Fonts, pin hotspots, and junction dots now stay a constant size on screen regardless of zoom.
  Previously they were specified in Altium user units, so on a 10000-unit-wide sheet rendered
  into an 800 px container they were around 0.9 px — effectively invisible.
- Entire preview is now themed against VS Code CSS variables (`--vscode-editor-background`,
  `--vscode-charts-blue`, `--vscode-charts-yellow`, …). Light and high-contrast themes no longer
  get a forced dark UI.
- Text rotation direction is corrected for the y-axis flip. Altium `Orientation=1` (90° CCW on
  the sheet) now renders 90° CCW on screen, not CW.
- Preview renders arcs, ellipses, polygons, beziers, and rounded rectangles — diodes, op-amp
  tops, LEDs, and similar symbols no longer look like floating pins.
- Component bodies now render as clickable bounding boxes (computed from the symbol's own
  primitives + pin hotspots) instead of being missing entirely.
- NoERC markers render as small X marks.

### Parser

- Added Arc (RECORD=12), Elliptical Arc (11), Round Rectangle (10), Ellipse (8), Polygon (7),
  Bezier (5), Bus (26), Bus Entry (33), Sheet Entry (23), Sheet Name (32), Sheet File Name (35),
  and NoERC (36) record types. Corrected `RoundedRectangle: 12` which was wrong (12 is Arc).
- `ParsedSchDoc` gains `arcs`, `ellipses`, `polygons`, `beziers`, `roundRects`, `busses`,
  `busEntries`, `noErcs` arrays. Existing arrays and counts unchanged.
- `SchComponent` gains `primitives` (the symbol-body primitives grouped by `OwnerIndex`) and
  `bbox` (bounding box over primitives + pin hotspots).
- `SchSheetInfo` gains `title`, `revision`, `documentNumber`, `author`, `drawnBy`,
  `companyName`, `date`, `sheetNumber`, `sheetTotal`, and a raw `parameters` list — extracted
  from the document-level Parameter records Altium writes without an OwnerIndex.

### Exports

- **BOM export is now grouped.** Components with the same `(LibReference, Value, Footprint)`
  collapse into a single row with a `Qty` column and a compressed designator range
  (`R1,R2,R3,R5` → `R1-R3, R5`). `Manufacturer` / `MPN` pulled from parameters. Every other
  non-hidden parameter name becomes its own column.
- **Protel netlist export** is now real Protel format: component sections (`[\nDESIG\nFP\nVAL\n]`)
  followed by net sections (`(\nNET\nDESIG-PIN\n)`), instead of the previous loose
  bracket-only form.
- **New `Altium: Export JSON Model` command** writes a versioned JSON snapshot of the entire
  parsed schematic (sheet title block, components with bboxes, pins, heuristic nets, counts)
  suitable for downstream tooling or LLM ingestion. Schema: `altium-schdoc-viewer/v1`.

### MCP server + AI chat integrations

- Extension now ships a Model Context Protocol server (`dist/mcp-server.js`) exposing 11 tools
  for structured schematic queries from **Claude Code**, **Cursor**, **Claude Desktop**, and
  **VS Code GitHub Copilot Chat** / Codex CLI: `schdoc_summary`, `schdoc_title`,
  `schdoc_components`, `schdoc_component`, `schdoc_pins`, `schdoc_nets`, `schdoc_net`,
  `schdoc_bom`, `schdoc_netlist`, `schdoc_search`, `schdoc_json`. Zero dependencies —
  hand-rolled JSON-RPC over stdio.
- **One-click registration** — new command `Altium: Set up MCP server for AI chat` writes
  `.cursor/mcp.json` / `.mcp.json` / `.vscode/mcp.json` / Claude Desktop config for you, merging
  into anything you already had.
- **Built-in health check** — new command `Altium: Test MCP server (health check)` spawns the
  server, runs the protocol handshake, and tells you "healthy — N tools" or an actionable error
  with full stdout/stderr in an output channel. Lets you confirm the server works without
  depending on any chat client's UI.
- `Altium: Show MCP server registration snippet` prints the ready-to-paste JSON for clients the
  setup command doesn't handle natively.
- New `SKILL.md` at the repo root describes when and how to use the skill, with example prompts.
- `CLAUDE.md` documents the MCP config snippets for each supported client.

### Publishing

- New `scripts/publish.sh` (and `npm run publish:dry / :all / :vscode / :ovsx`) publishes to
  both the **VS Marketplace** (for VS Code) and **Open VSX** (for **Cursor**, VSCodium,
  Gitpod). Same `.vsix` on both registries.
- Release procedure, PAT handling, and smoke-test commands are documented in `CLAUDE.md`.

### Build & CI

- New `npm run typecheck` script (`tsc --noEmit -p tsconfig.test.json`) runs as part of
  `pretest`. Catches type errors that esbuild's type-stripping would silently ship.
- CI matrix extended to Node 20 + Node 22; typecheck is now a required step.
- Third esbuild target (`dist/mcp-server.js`) shebanged and chmod +x on build.

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
