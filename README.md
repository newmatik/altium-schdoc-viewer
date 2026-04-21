# Altium SchDoc Viewer

[![CI](https://github.com/newmatik/altium-schdoc-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/newmatik/altium-schdoc-viewer/actions/workflows/ci.yml)

VS Code extension that opens **Altium Designer binary** `.SchDoc` / `.SchDot` files without Altium installed. It reads the OLE2 `FileHeader` stream and shows:

- **Components** — designator, lib reference, value, footprint, description  
- **Pins** — per-pin signal names and electrical type  
- **Nets** — connectivity from wires, junctions, pin hotspots, net labels, and power ports (heuristic)  
- **Parameters** — component parameters (including hidden metadata when present)  
- **Preview** — simple SVG (wires, component boxes, pins, junctions, labels) with pan/zoom  
- **Raw** — truncated record payloads for debugging  

## Requirements

- [Visual Studio Code](https://code.visualstudio.com/) or a compatible editor (Cursor, VSCodium, etc.) **1.85+**

## Install

### From the Visual Studio Marketplace (once published)

Search for **Altium SchDoc Viewer** or install from your publisher page after `vsce publish` (see [Publishing](#publishing)).

### From Open VSX (once published)

Many VS Code forks use [Open VSX](https://open-vsx.org/). After publishing with `ovsx`, users can install from the registry UI or CLI.

### From a `.vsix` file (always works)

1. Download `altium-schdoc-viewer-0.1.0.vsix` from [GitHub Releases](https://github.com/newmatik/altium-schdoc-viewer/releases) (when available), or build locally (below).  
2. In VS Code: **Extensions** → **…** → **Install from VSIX…**  
3. Open a `.SchDoc` file — it opens in the custom editor.

Build the VSIX locally:

```bash
git clone https://github.com/newmatik/altium-schdoc-viewer.git
cd altium-schdoc-viewer
npm ci
npm run package
# → altium-schdoc-viewer-0.1.0.vsix
```

## Develop

Open this folder as the workspace root, then **Run Extension** (F5). `preLaunchTask` runs `npm run build`.

```bash
npm ci
npm run build   # outputs dist/extension.js and dist/webview.js
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

## Publishing

Extensions are **not** installed from GitHub automatically; you publish to a **registry**, then users install from the Extensions view.

### 1. Microsoft Visual Studio Marketplace (VS Code, Cursor)

1. Create a [publisher](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#create-a-publisher) (e.g. `newmatik`) and a [Personal Access Token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) with **Marketplace (Manage)** scope.  
2. Log in once: `npx @vscode/vsce login <publisher>`  
3. From this repo root (with `npm ci` and tests green):  
   `npx @vscode/vsce publish`  
   Or set version in `package.json` and use `npx @vscode/vsce publish <new-version>`.

After publish, the extension appears in the Marketplace; VS Code users can search and install.

### 2. Open VSX (VSCodium, Eclipse Theia, some corporate mirrors)

1. Create an account at [open-vsx.org](https://open-vsx.org/) and a [personal access token](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions).  
2. Install CLI: `npm i -g ovsx` (or `npx ovsx`).  
3. Publish: `ovsx publish -p <token>` (run from repo root after `npm ci` and `npm run build`).

### 3. GitHub Releases (side-load / archive)

In CI or locally, `npm run package` produces a `.vsix`. Attach it to a [GitHub Release](https://github.com/newmatik/altium-schdoc-viewer/releases); users choose **Install from VSIX** and pick the downloaded file.

---

**Optional but recommended for Marketplace listings:** add `images/icon.png` (128×128) and reference it in `package.json` as `"icon": "images/icon.png"` (see [VS Code docs](https://code.visualstudio.com/api/references/extension-manifest)).

## Limitations

- Read-only; no `.SchDoc` write-back.  
- Single schematic file; no `.PrjPcb` multi-sheet project view.  
- Netlist and preview are approximate; validate critical nets in Altium.  

## Format notes

Files are **OLE2** compound documents; schematic data lives in the `FileHeader` stream as length-prefixed `|KEY=value|` records. Child ownership uses **`parentRecordIndex = OwnerIndex + 1`** (zero-based), which matches current Altium binary exports we tested.

## License

MIT — see [LICENSE](LICENSE).
