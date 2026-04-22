# Altium SchDoc Viewer

[![CI](https://github.com/newmatik/altium-schdoc-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/newmatik/altium-schdoc-viewer/actions/workflows/ci.yml)
[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/newmatik.altium-schdoc-viewer?label=VS%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer)

Open **Altium Designer** binary `.SchDoc` / `.SchDot` files in VS Code without Altium installed. The extension reads the OLE2 `FileHeader` stream and shows:

- **Components** — designator, lib reference, value, footprint, description  
- **Pins** — signal names and electrical type  
- **Nets** — heuristic connectivity from wires, junctions, pin hotspots, net labels, and power ports  
- **Parameters** — component parameters (including hidden metadata when present)  
- **Preview** — themed SVG rendering of wires, pins, component bodies, arcs, ellipses, polygons, beziers, rounded rectangles, junctions, net labels and power ports; pan and zoom. Not a pixel-perfect schematic renderer, but close enough to orient yourself on a real board.  
- **Raw** — truncated record payloads for debugging  

## Install

- **VS Code:** [Install from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer) — or in VS Code: **Extensions** → search **Altium SchDoc Viewer** → **Install**.
- **Cursor / VSCodium / Gitpod:** [Install from Open VSX](https://open-vsx.org/extension/newmatik/altium-schdoc-viewer) — or in the editor: **Extensions** → search **Altium SchDoc Viewer** → **Install**.

Source code: [github.com/newmatik/altium-schdoc-viewer](https://github.com/newmatik/altium-schdoc-viewer)

## Chat from your AI assistant (MCP)

The extension bundles a **Model Context Protocol** server that lets **Claude Code, Cursor, Claude Desktop, Codex CLI, and VS Code GitHub Copilot agent mode** query your `.SchDoc` files in a structured way — list components, trace nets, pull the BOM, inspect parameters, all from the chat panel.

### One-click setup

Open the folder that contains your schematics in VS Code / Cursor, then run:

**`⌘⇧P` → `Altium: Set up MCP server for AI chat (Cursor / Claude / Copilot)`**

A multi-select picker lets you check any combination of:

| Client | Config file it writes |
|---|---|
| **Cursor** | `.cursor/mcp.json` in the current workspace |
| **Claude Code** | `.mcp.json` in the current workspace |
| **VS Code** (native MCP / Copilot agent mode) | `.vscode/mcp.json` in the current workspace |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the platform equivalent |

The command **merges** into any existing config — other MCP servers you've registered stay intact.

### Enable the server in your client

All four clients register new MCP servers as **disabled / untrusted** by default. This is a deliberate security behaviour — writing to `mcp.json` doesn't auto-grant subprocess execution. After running the setup command:

| Client | Enable step |
|---|---|
| **Cursor** | Reload (⌘R) → **Settings → MCP** → flip the `altium-schdoc` toggle on. Then open the **Agent / Composer** chat (⌘I), not the plain Ask panel. |
| **Claude Code** | Restart in the workspace. Claude Code will prompt you to approve the server the first time it's needed — accept. |
| **VS Code** (Copilot agent mode) | Run **Developer: Reload Window** → VS Code shows a trust prompt on first tool use — accept. Use Copilot Chat in **Agent** mode. |
| **Claude Desktop** | Quit and relaunch. The plug icon in the chat shows connected servers. |

MCP tools are invoked by the AI agent based on your prompt — they don't appear in the `/` slash-command menu. A prompt like *"summarize AFE-Eval_Schematics_B.SchDoc"* will make the agent call `schdoc_summary`.

### Diagnostics

**`Altium: Test MCP server (health check)`** — spawns the bundled server, runs the standard initialize + tools/list handshake, shows **"MCP server healthy — N tools"** on success. Use this to rule out the server itself as the cause before debugging your chat client's trust / enable flow.

**`Altium: Show MCP server registration snippet`** — prints the ready-to-paste JSON for clients the setup command doesn't handle natively.

### The 11 tools

`schdoc_summary`, `schdoc_title`, `schdoc_components`, `schdoc_component`, `schdoc_pins`, `schdoc_nets`, `schdoc_net`, `schdoc_bom`, `schdoc_netlist`, `schdoc_search`, `schdoc_json`.

See [`SKILL.md`](SKILL.md) for details and example prompts. For per-client manual configuration (tokens, paths, troubleshooting), see the "MCP server" section of [`CLAUDE.md`](CLAUDE.md).

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
| **Altium: Export BOM as CSV (grouped)** | Grouped by value/footprint with `Qty` and compressed designator ranges (`R1-R4, R7`), plus Manufacturer/MPN columns. |
| **Altium: Export Netlist (Protel)** | Real Protel format — component sections then net sections. |
| **Altium: Export JSON Model** | Versioned JSON snapshot of the full parsed schematic, for downstream tooling or LLM ingestion. |
| **Altium: Reveal Raw Records** | Plain-text dump of record payloads. |

## Limitations

- Read-only; no `.SchDoc` write-back.  
- Single schematic file; no `.PrjPcb` multi-sheet project view yet.  
- Netlist is heuristic — verify important nets in Altium.  
- Preview geometry is close to the original but not pixel-perfect; it's meant for orientation, not as an Altium replacement.  

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
