# Altium SchDoc Viewer

[![CI](https://github.com/newmatik/altium-schdoc-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/newmatik/altium-schdoc-viewer/actions/workflows/ci.yml)
[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/newmatik.altium-schdoc-viewer?label=VS%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer)

Open **Altium Designer** binary `.SchDoc` / `.SchDot` files in VS Code without Altium installed. The extension reads the OLE2 `FileHeader` stream and shows:

- **Components** — designator, lib reference, value, footprint, description  
- **Pins** — signal names and electrical type  
- **Nets** — heuristic connectivity from wires, junctions, pin hotspots, net labels, and power ports  
- **Parameters** — component parameters (including hidden metadata when present)  
- **Draft preview (WIP)** — very rough SVG layout (boxes, wires, labels) for orientation only; not a realistic schematic view  
- **Raw** — truncated record payloads for debugging  

## Install

**[Install from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer)** — or in VS Code / Cursor: **Extensions** (Ctrl+Shift+X / Cmd+Shift+X) → search **Altium SchDoc Viewer** → **Install**.

Source code: [github.com/newmatik/altium-schdoc-viewer](https://github.com/newmatik/altium-schdoc-viewer)

## Requirements

[Visual Studio Code](https://code.visualstudio.com/) or a compatible editor **1.85+**.

## Develop

Open this folder as the workspace root, then **Run Extension** (F5). The launch config runs `npm run build` first.

```bash
npm ci
npm run build   # dist/extension.js and dist/webview.js
npm test
npm run watch   # optional
```

## Commands

When a `.SchDoc` / `.SchDot` is active (or pick a file when prompted):

| Command | Description |
|--------|-------------|
| **Altium: Export BOM as CSV** | One row per component |
| **Altium: Export Netlist (Protel)** | Bracket-style `.net` file |
| **Altium: Reveal Raw Records** | Plain-text dump of record payloads |

## Limitations

- Read-only; no `.SchDoc` write-back.  
- Single schematic file; no `.PrjPcb` multi-sheet project view.  
- Netlist is heuristic — verify important nets in Altium.  
- **Preview is not schematic-accurate** — placeholder geometry only (work in progress).  

## Format notes

Files are **OLE2** compound documents; schematic data is in the `FileHeader` stream as length-prefixed `|KEY=value|` records. Child ownership uses **`parentRecordIndex = OwnerIndex + 1`** (zero-based), which matches current Altium binary exports we tested.

## Local VSIX (for extension development)

To produce a `.vsix` on your machine (e.g. testing an unpublished build):

```bash
npm ci
npm run package
```

Then in VS Code: **Extensions** → **…** → **Install from VSIX…** and choose the generated `altium-schdoc-viewer-*.vsix` in this directory.

## License

MIT — see [LICENSE](LICENSE).
