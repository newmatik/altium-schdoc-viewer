---
name: altium-schdoc
description: Query Altium Designer binary .SchDoc schematic files — list components, trace nets, inspect pins and parameters, export BOM / netlist / JSON from within chat.
---

# altium-schdoc skill

This skill gives an AI assistant structured, read-only access to Altium `.SchDoc` / `.SchDot`
schematic files via the companion [MCP server](./src/mcp/server.ts). Use it when the user is
working with hardware schematics and wants to look something up without opening Altium Designer.

## When to use

- The user mentions a file ending in `.SchDoc` or `.SchDot`.
- The user asks "what's on U3", "where does GND go", "list the op-amps on this board",
  "give me the BOM", "what's the pinout of J1", etc.
- The user is debugging or reviewing a schematic they can't conveniently open in Altium.

## Prerequisites

1. Install the **Altium SchDoc Viewer** extension in your editor (VS Code from the Marketplace,
   Cursor / VSCodium from Open VSX). The extension ships with a bundled MCP server at
   `dist/mcp-server.js` inside the extension directory.
2. Register the MCP server with your assistant (see the "Registering the MCP server" section of
   [CLAUDE.md](./CLAUDE.md) for exact `.mcp.json` / `settings.json` snippets for Claude Code,
   Cursor, Claude Desktop, and VS Code GitHub Copilot).
3. Alternatively, if the repo is cloned locally, run `npm ci && npm run build` and point your
   client at `node /absolute/path/to/dist/mcp-server.js`.

## Tools the MCP server exposes

All tools take an absolute or workspace-relative `path` to a `.SchDoc` file. Files are cached
per-path + mtime, so calling several tools in a row on the same file is cheap.

| Tool | Purpose |
|---|---|
| `schdoc_summary` | Record counts, sheet title / revision / author at a glance. Start here. |
| `schdoc_title` | Full title-block parameter list. |
| `schdoc_components` | List components, optional substring filter across designator / libRef / value / footprint / description. |
| `schdoc_component` | Deep view of one component — all parameters (hidden flagged), pins, bounding box. |
| `schdoc_pins` | All pins with designator / name / electrical type. |
| `schdoc_nets` | All heuristic nets with pin counts. |
| `schdoc_net` | Pins on one net. |
| `schdoc_bom` | Grouped BOM as CSV (Qty, compressed designator ranges, MPN / Manufacturer). |
| `schdoc_netlist` | Protel-format netlist. |
| `schdoc_search` | Fuzzy search across designators, libRefs, values, net names, parameter names/values. Up to 200 matches. |
| `schdoc_json` | Full versioned JSON model (verbose — prefer narrower tools). |

## Usage guidance

- **Prefer narrow tools over `schdoc_json`.** A full JSON model of a mid-size board is tens of
  kilobytes of text and blows context for no benefit. Use `schdoc_summary` → `schdoc_component`
  / `schdoc_net` to stay focused.
- **The netlist is heuristic**, not ERC. It's derived from wire geometry + pin hotspots + net
  labels + power ports with small merge tolerances. For safety-critical wiring questions,
  caveat that the ground truth is the Altium netlist.
- **Parameter names aren't standardized.** Common ones across real Altium libraries:
  `Comment`, `Value`, `Manufacturer`, `Manufacturer Part Number`, `MPN`, `Supplier Part Number`,
  `Description`, `Package`. But each team has their own. When asked "what's the part number of
  U3", check `Manufacturer Part Number` first, then `MPN`, then `Comment`, then look at whatever
  parameters actually exist on that component.
- **Multi-sheet projects (`.PrjPcb`) are not yet supported** — one `.SchDoc` per call.
- **Electrical type** on pins is an integer per the Altium binary format:
  0 = Input, 1 = IO, 2 = Output, 3 = Open Collector, 4 = Passive, 5 = HiZ, 6 = Open Emitter,
  7 = Power.

## Example prompts and flows

> **User:** What are all the op-amps on AFE-Eval_Schematics_B.SchDoc?
>
> → Call `schdoc_components({path, filter:"op"})` to substring-match on description/value.
> → If that misses stylistic matches, call `schdoc_components({path})` and scan for parts whose
>   `libReference` or `description` mentions "amplifier" / "opamp" / "TLV" / "OPA" / "LM" style
>   names.

> **User:** Where does the 3V3 rail connect?
>
> → Call `schdoc_net({path, name:"+3V3"})`. If missing, try `+3.3V`, `3V3`, `VCC_3V3`.
>   The net name is case-sensitive in source but tool matching is case-insensitive.

> **User:** Give me the BOM of this sheet as CSV.
>
> → Call `schdoc_bom({path})`. Return the `content` field verbatim in a fenced code block.

> **User:** What MPN did we use for C15?
>
> → Call `schdoc_component({path, designator:"C15"})`. Look through `parameters` for
>   `Manufacturer Part Number` / `MPN` / `Comment`.

> **User:** Is U7 actually connected to the SPI bus?
>
> → Call `schdoc_component({path, designator:"U7"})` to list its pins.
> → For each pin that looks SPI-named (SCK/MOSI/MISO/CS/SS), call `schdoc_net` with that pin's
>   net name if known, or inspect `schdoc_nets` output.

## Things this skill won't do

- Modify the `.SchDoc` (read-only).
- Resolve multi-sheet hierarchy across `.PrjPcb`.
- Run electrical-rule checking (ERC) — only heuristic net grouping.
- Render the schematic as an image — that's the VS Code extension's preview tab. Point the user
  there if they ask for a visual.
