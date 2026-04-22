# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A standalone VS Code / Cursor extension that opens Altium Designer binary `.SchDoc` / `.SchDot` files
without Altium installed. It parses the OLE2 compound file, extracts components / pins / nets from the
`FileHeader` record stream, and renders them as tables plus a rough SVG preview inside a custom editor
webview. Publisher `newmatik`, MIT, VS Marketplace listing lives under `newmatik.altium-schdoc-viewer`.

## This directory is its own git repo

Even though the working copy sits inside `ciab-mainboard-next-gen/` (a closed-source CIAB Tech project),
this folder is an **independent, open-source (MIT)** git repository with its own remote
(`github.com/newmatik/altium-schdoc-viewer`) and its own release history. Consequences:

- Commit from **this** directory, not the parent. `git status` from the parent will not see these files.
- The parent workspace's `CLAUDE.md` and `ciab-mainboard-next-gen/CLAUDE.md` rules about closed-source
  content and German/English language declarations do **not** apply here. This project is English.
- The "no AI attribution in commits, PRs, changelogs" rule from the parent workspace **does** apply.

## ⚠️ Confidential data — zero customer content in this repo

This repo is **MIT-licensed and public**. Anything committed here is world-readable forever, even after
a force-push rewrite (Google, the Wayback Machine, GitHub event logs, and downstream forks preserve it).

**Never commit:**

- `.SchDoc`, `.SchDot`, `.PrjPcb`, `.PcbDoc` — customer schematics, PCB layouts, project files.
- BOMs, datasheets, assessment documents, draw.io diagrams from closed-source projects
  (CIAB, AMV, any paid customer work).
- Datasheets for parts where our supplier agreement prohibits redistribution.
- Screenshots or PDF exports of the above.

The current `.gitignore` hard-blocks `test/fixtures/**/*.SchDoc` / `.SchDot` / `.PrjPcb`. **Do not weaken
this rule.** If you need a test fixture that exercises real records, the options (in order of preference) are:

1. Build a synthetic record stream in-test (mock `ParsedRecord[]`). This is how `test/bom.test.ts`
   exercises `compressDesignatorRange` — no fixture at all.
2. Use a truly open-source / public-domain schematic as a fixture. Check the license before
   adding. Document provenance in `test/fixtures/README.md`.
3. Keep a customer fixture **only on the local filesystem**, outside Git. All tests that depend on
   a fixture wrap their `describe` in `describe.skipIf(!fs.existsSync(fixture))` so CI and forks
   pass without it.

Before every commit, run `git diff --name-only --cached` and visually confirm no customer material is
staged. `git add -A` and `git add .` are banned in this repo — prefer named paths (`git add src/foo.ts`)
so you see what you're including.

If a secret or confidential file is ever committed:

1. Remove it from the working tree and commit.
2. Rewrite history with `git filter-repo --path <file> --invert-paths --force`.
3. Force-push origin/main.
4. Contact GitHub Support if the repo is public and the file was pushed — they can purge cached
   commits from GitHub's event API and abuse the Secret Scanning infrastructure to surface any
   forks. Rotating anything leaked (tokens, credentials) is mandatory.

**This is load-bearing.** A leak of CIAB customer data from this repo could be a contract violation.

## Commands

```bash
npm ci                 # install (CI uses Node 20 and 22)
npm run build          # esbuild: dist/extension.js + dist/webview.js + dist/mcp-server.js
npm run watch          # rebuild on change (all three bundles)
npm run typecheck      # tsc --noEmit -p tsconfig.test.json (src + test)
npm test               # typecheck + build + vitest run
npm run test:watch     # vitest watch
npm run package        # @vscode/vsce → altium-schdoc-viewer-<version>.vsix
npm run mcp            # run the MCP server locally (stdio JSON-RPC; Ctrl+D exits)

# Publishing
npm run publish:dry    # typecheck + test + package, no publish
npm run publish:all    # publish to both registries (confirmation prompt)
npm run publish:vscode # VS Marketplace only
npm run publish:ovsx   # Open VSX only (Cursor / VSCodium / Gitpod)
```

Run a single test file or test name:

```bash
npx vitest run test/parser.test.ts
npx vitest run -t "splits records"
```

Interactive extension host: open this folder in VS Code and press **F5** ("Run Extension"). The launch
config runs `npm run build` first via `.vscode/tasks.json`.

CI (`.github/workflows/ci.yml`) runs on push/PR to `main` or `master`: `npm ci && npm test && npm run
package`. Packaging is the final gate — a build that passes tests but fails `vsce package` (e.g. bad
`package.json` field, missing `LICENSE`, over-size bundle) will fail CI.

There is no linter and no formatter configured. Do not add one without asking; the package deliberately
has a minimal devDependency list.

## Build system shape

`esbuild.config.mjs` produces **two independent bundles** from one `npm run build`:

1. **Extension host** (`src/extension.ts` → `dist/extension.js`): Node 18 target, CJS, `vscode`
   marked external. Runs in the VS Code extension host process with full Node APIs.
2. **Webview** (`src/editor/webview/main.ts` → `dist/webview.js`): browser target, ES2020, IIFE. Runs
   inside the custom-editor iframe with a strict CSP (nonce-only scripts, no `eval`, data/https images
   allowed) defined in `src/editor/html.ts`.

`tsconfig.json` intentionally excludes `test/`; tests are typechecked by `tsconfig.test.json` and run
by Vitest directly against TypeScript sources (no separate compile step). The two sides must not
import each other's entrypoints — data crosses the boundary only via `postMessage` payloads produced
by `SchDocEditorProvider.serialize()`.

## Parser architecture

The pipeline is strictly one-way:

```
file bytes
  → parser/cfb.ts          read OLE2, extract `FileHeader` stream (via `cfb` npm package)
  → parser/records.ts      length-prefixed binary → ParsedRecord[] with `|KEY=value|` field maps
  → parser/schematic.ts    walk records by RECORD type → ParsedSchDoc (components, pins, wires, ...)
  → netlist/builder.ts     union-find over wire vertices + pin hotspots + junctions + labels
  → editor/SchDocEditorProvider.serialize()   → webview JSON payload
```

Key invariants — violating these silently breaks the parser against real Altium files:

- **`parentRecordIndex = OwnerIndex + 1`** (zero-based). Every child record (Designator, Parameter,
  Pin, Implementation, etc.) references its parent via `OwnerIndex`, and the actual index in the
  record array is `OwnerIndex + 1`. This is the single most load-bearing quirk of the format.
- **Coordinates are integer + optional `*_Frac` sub-step**, combined by `schCoord(int, frac)` as
  `int + frac / 1_000_000`. The `coordKey(p, 3)` helper quantizes to that decimal resolution for
  connectivity keys — changing `decimals` will fragment nets.
- **`RECORD=` enum values** in `src/parser/types.ts` are a hand-curated subset. Records without a
  mapped type are still preserved in `ParsedRecord[]` (for the raw view) but are invisible to
  `buildSchematic`. If Altium emits a new record class we care about, add it to `RecordType` and
  handle it in `schematic.ts`, not the other way around.
- **Payload is Latin-1**, null bytes stripped. No UTF-8 decode anywhere — Altium writes ANSI.
- **Footprint resolution** walks a three-level owner chain: Implementation (45) → ImplementationList
  (44) → Component (1), filtering implementations by `ModelType` containing `PCB` or
  `ModelDatafileKind0 == PCBLIB`. Footprints found earlier win (first-match, not last-match).

## Netlist heuristic

`src/netlist/builder.ts` runs a union-find over:

- Wire segment endpoints (every segment union'd).
- Pin hotspots, with `pinTouchesSegment` tolerance `EPS = 0.12` to catch pins that land mid-segment
  rather than on a vertex.
- Junction dots within radius `< 12` of any existing electrical key.
- Net labels and power ports, snapped to the nearest electrical key within `labelSnapMax = 220`
  (nearest vertex first, then nearest point on any wire segment).

Label naming precedence: power-port names (`prio 0`) lose to net-label names (`prio 1`) when both
apply — this matches Altium's display, where an explicit net label overrides a power-net inferred
name. Unnamed nets get `N$001`, `N$002`, … in assignment order.

The thresholds (`EPS`, `< 12`, `labelSnapMax = 220`) are tuned against the AFE-Eval fixture and real
Newmatik boards. Tweaking them is legitimate, but re-run `npm test` — the parser test pins exact
component/pin/record counts, and the netlist test requires `maxPins > 1` plus either a recognizable
power-rail name or a net with ≥ 4 pins, which together catch most regressions.

## Fixture

`test/fixtures/AFE-Eval_Schematics_B.SchDoc` is a real 822 kB binary SchDoc. The parser test asserts
**exactly** 3554 records, 67 components, 359 pins, and that a component designated `U1` exists with
a `LibReference` containing `TMA`. If a refactor changes those numbers, something is wrong — do not
update the expectations without understanding *why* the count moved.

## Custom editor wiring

- View type `altium.schdoc` is registered as the default editor for `*.SchDoc` / `*.SchDot` via
  `contributes.customEditors` in `package.json`.
- `SchDocEditorProvider` implements `CustomReadonlyEditorProvider` — this is a **read-only viewer**.
  Never add write-back; the format is complex enough that round-tripping would silently corrupt files.
- `webviewOptions.retainContextWhenHidden: true` is intentional — re-parsing on every tab switch is
  noticeable on large schematics.
- The three palette commands (`altium.exportBom`, `altium.exportNetlist`, `altium.revealRaw`) all
  go through `resolveSchDocUri()`: they accept an explicit URI, otherwise take the active tab's URI
  if it's a SchDoc, otherwise prompt with an Open dialog. Keep that fallback chain — users invoke
  these from the palette when the SchDoc isn't the active editor.

## Publishing

Versioning is manual in `package.json`; `CHANGELOG.md` is maintained by hand. Packaging uses
`vsce package --no-dependencies` because esbuild already inlines everything from `node_modules/`
into `dist/*.js` — vsce must not re-include `node_modules/`.

We publish to **two** registries:

- **Visual Studio Marketplace** — the canonical store for VS Code (`code.visualstudio.com` /
  `marketplace.visualstudio.com`). Uses `vsce publish`.
- **Open VSX** (`open-vsx.org`) — the vendor-neutral registry used by **Cursor**, **VSCodium**,
  **Gitpod**, and most other Code forks. Uses `ovsx publish`. The same `.vsix` file publishes to
  both — nothing Cursor-specific is required.

### One-time maintainer setup

1. **VS Marketplace** — create a publisher on
   [https://marketplace.visualstudio.com/manage/publishers/](https://marketplace.visualstudio.com/manage/publishers/)
   (the `newmatik` publisher already exists). Then create an Azure DevOps
   [personal access token](https://dev.azure.com/) with organization **All accessible
   organizations** and scope **Marketplace → Manage**. Store it as `$VSCE_PAT`.
2. **Open VSX** — sign in at [https://open-vsx.org](https://open-vsx.org) with GitHub. Generate
   an access token at `User Settings → Tokens`. On first publish under a new namespace, the
   namespace must be claimed (contact Open VSX via their process — or use an already-claimed
   namespace). Store the token as `$OVSX_PAT`.
3. Keep both tokens in a secure password manager. Don't commit them. Don't paste them into
   chat. Publishing is a human-only action — don't delegate it to an AI agent.

### Release flow

```bash
# Edit package.json version, CHANGELOG.md, and README.md as needed, then:
npm run publish:dry       # local verification — typecheck + test + vsce package, no publish
# Review the produced .vsix, then:
export VSCE_PAT=...       # Marketplace PAT
export OVSX_PAT=...       # Open VSX PAT
npm run publish:all       # interactive confirmation before uploading to both registries
```

The script lives at `scripts/publish.sh` — read it before running. It refuses to proceed if
typecheck / tests fail. `--vscode-only` and `--ovsx-only` flags exist for when one registry is
flaky.

Listings (they take a minute to appear after publish):

- Marketplace: `https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer`
- Open VSX:    `https://open-vsx.org/extension/newmatik/altium-schdoc-viewer`

**Cursor users** install by opening the Extensions sidebar and searching "Altium SchDoc Viewer"
— Cursor queries Open VSX by default. VS Code users install from the Marketplace the same way.

Publishing is not wired into CI on purpose. Releases are human-triggered.

## MCP server (for Claude / Cursor / Copilot / Codex chat integrations)

The extension ships a **Model Context Protocol** server at `dist/mcp-server.js` inside the
installed extension directory (and at the same path in the repo after `npm run build`). It's a
zero-dependency stdio JSON-RPC server that wraps the existing parser, netlist builder, and
export functions as MCP tools. Source: [`src/mcp/server.ts`](src/mcp/server.ts). Skill
documentation and example prompts live in [`SKILL.md`](SKILL.md) at the repo root.

**Tools exposed** (all take a `path` argument; files are cached by path + mtime):
`schdoc_summary`, `schdoc_title`, `schdoc_components`, `schdoc_component`, `schdoc_pins`,
`schdoc_nets`, `schdoc_net`, `schdoc_bom`, `schdoc_netlist`, `schdoc_search`, `schdoc_json`.

### Finding the installed server path

When the extension is installed, VS Code / Cursor place the MCP server at one of:

- macOS / Linux: `~/.vscode/extensions/newmatik.altium-schdoc-viewer-<version>/dist/mcp-server.js`
  (replace `.vscode` with `.cursor` for Cursor, `.vscode-oss` for VSCodium)
- Windows: `%USERPROFILE%\.vscode\extensions\newmatik.altium-schdoc-viewer-<version>\dist\mcp-server.js`

When working from a cloned repo, use `$REPO/dist/mcp-server.js` after running `npm run build`.

### Registering with **Claude Code**

Per-project (preferred): create `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "altium-schdoc": {
      "command": "node",
      "args": ["/absolute/path/to/dist/mcp-server.js"]
    }
  }
}
```

Or user-wide: `~/.claude.json` under `mcpServers`. Restart Claude Code. Tools will appear
prefixed with `mcp__altium-schdoc__`, e.g. `mcp__altium-schdoc__schdoc_summary`.

### Registering with **Cursor**

Create `.cursor/mcp.json` at the repo root (or `~/.cursor/mcp.json` for user-global):

```json
{
  "mcpServers": {
    "altium-schdoc": {
      "command": "node",
      "args": ["/absolute/path/to/dist/mcp-server.js"]
    }
  }
}
```

Open Cursor Settings → MCP to confirm the server is detected. Tools become available to
Cursor's chat.

### Registering with **Claude Desktop**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent
on your OS:

```json
{
  "mcpServers": {
    "altium-schdoc": {
      "command": "node",
      "args": ["/absolute/path/to/dist/mcp-server.js"]
    }
  }
}
```

Quit and relaunch Claude Desktop.

### Registering with **VS Code GitHub Copilot Chat**

Copilot Chat added MCP support in late 2024. In VS Code settings (`settings.json`):

```json
{
  "github.copilot.chat.mcp.servers": {
    "altium-schdoc": {
      "command": "node",
      "args": ["/absolute/path/to/dist/mcp-server.js"]
    }
  }
}
```

Then open the Copilot Chat panel and reference `@altium-schdoc` (exact agent prefix depends on
your Copilot version).

### Registering with **OpenAI Codex CLI** (or any MCP-compatible client)

Every client implements MCP over stdio the same way. The command is always
`node /absolute/path/to/dist/mcp-server.js`. Consult your client's docs for where its MCP
config file lives; the server entry is always the same shape as above.

### Smoke-testing the MCP server by hand

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node dist/mcp-server.js
```

You should see the `initialize` result, then the `tools/list` result listing 11 tools.

## Things not to do

- Don't bundle the webview with `platform: 'node'` or the extension with `platform: 'browser'` — the
  two bundles have different target environments and `vscode` API availability.
- Don't read the SchDoc as UTF-8 or strip bytes before the OLE2 parse — `cfb` needs the raw buffer.
- Don't assume `OwnerIndex` points to the parent record directly; always use `parentRecordIndex()`.
- Keep the "netlist is heuristic" language in README. The union-find approach is solid for most
  designs but isn't equivalent to an Altium ERC pass — the caveat is load-bearing when users make
  decisions based on the exported netlist.
- Don't add telemetry, network calls, or file-write paths from the webview; the extension is
  read-only and local-only by design, and the CSP blocks arbitrary network access from the webview.
  The MCP server is stdio-only and does not open sockets.
