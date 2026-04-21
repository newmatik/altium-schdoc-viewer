# Altium SchDoc Viewer

[![CI](https://github.com/newmatik/altium-schdoc-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/newmatik/altium-schdoc-viewer/actions/workflows/ci.yml)
[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/newmatik.altium-schdoc-viewer?label=VS%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer)

**Install:** [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer) · [Publisher hub (manage release)](https://marketplace.visualstudio.com/manage/publishers/newmatik/extensions/altium-schdoc-viewer/hub) · [Source on GitHub](https://github.com/newmatik/altium-schdoc-viewer)

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

### From the Visual Studio Marketplace (recommended)

1. Open the listing: **[newmatik.altium-schdoc-viewer](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer)**  
2. Click **Install**, or in VS Code / Cursor: **Extensions** (Ctrl+Shift+X / Cmd+Shift+X) → search **Altium SchDoc Viewer** → **Install**.

Deep link (opens Extensions view where supported): `vscode:extension/newmatik.altium-schdoc-viewer`

### From Open VSX (optional)

Not published there yet. Many forks (e.g. VSCodium) use [Open VSX](https://open-vsx.org/); see [Publishing](#publishing) to add it.

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

**Current listing:** [newmatik.altium-schdoc-viewer](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer) · [Publisher hub](https://marketplace.visualstudio.com/manage/publishers/newmatik/extensions/altium-schdoc-viewer/hub)

For future updates: bump `version` in `package.json`, then from repo root (`npm ci` and tests green):

```bash
npx @vscode/vsce login newmatik   # once per machine / token expiry
npx @vscode/vsce publish
```

First-time setup: [publisher](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#create-a-publisher) and [PAT with Marketplace (Manage)](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token).

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
