/**
 * Model Context Protocol (MCP) server for the Altium SchDoc Viewer.
 *
 * Speaks MCP over stdio (JSON-RPC, line-delimited). Zero runtime dependencies —
 * just reuses the in-tree parser, netlist builder, and export functions.
 *
 * Run with: `node dist/mcp-server.js`
 *
 * Tools exposed:
 *   schdoc_summary(path)             — counts + sheet title
 *   schdoc_title(path)               — full title-block parameters
 *   schdoc_components(path, filter?) — list components (optional substring filter)
 *   schdoc_component(path, designator) — details on one component, incl. pins + params
 *   schdoc_pins(path, filter?)       — list all pins
 *   schdoc_nets(path, filter?)       — list nets with pin counts
 *   schdoc_net(path, name)           — pins on a specific net
 *   schdoc_bom(path)                 — grouped BOM as CSV
 *   schdoc_netlist(path)             — Protel netlist
 *   schdoc_search(path, query)       — fuzzy search across designators/nets/params
 *   schdoc_json(path)                — full JSON model (verbose)
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseSchDocBuffer, type ParsedSchDoc } from '../parser/schematic';
import { buildNetlist, type BuiltNet } from '../netlist/builder';
import { bomToCsv } from '../export/bomCsv';
import { netlistToProtel } from '../export/netlistExport';
import { buildJsonModel } from '../export/jsonModel';

const SERVER_NAME = 'altium-schdoc-viewer';
const SERVER_VERSION = '0.2.0';
const PROTOCOL_VERSION = '2024-11-05';

// ---------- cache ----------

interface Loaded {
  doc: ParsedSchDoc;
  nets: BuiltNet[];
  mtimeMs: number;
  absPath: string;
}
const cache = new Map<string, Loaded>();

function load(p: string): Loaded {
  const abs = path.resolve(p);
  const stat = fs.statSync(abs);
  const cached = cache.get(abs);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached;
  const buf = new Uint8Array(fs.readFileSync(abs));
  const doc = parseSchDocBuffer(buf);
  const nets = buildNetlist(doc);
  const entry: Loaded = { doc, nets, mtimeMs: stat.mtimeMs, absPath: abs };
  cache.set(abs, entry);
  return entry;
}

// ---------- tool handlers ----------

function toolSummary(p: string): object {
  const { doc, nets, absPath } = load(p);
  return {
    file: absPath,
    records: doc.records.length,
    components: doc.components.length,
    pins: doc.pins.length,
    wires: doc.wires.length,
    junctions: doc.junctions.length,
    netLabels: doc.netLabels.length,
    powerPorts: doc.powerPorts.length,
    arcs: doc.arcs.length,
    ellipses: doc.ellipses.length,
    polygons: doc.polygons.length,
    beziers: doc.beziers.length,
    roundRects: doc.roundRects.length,
    busses: doc.busses.length,
    noErcs: doc.noErcs.length,
    nets: nets.length,
    sheetTitle: doc.sheet.title ?? null,
    sheetRevision: doc.sheet.revision ?? null,
    sheetAuthor: doc.sheet.author ?? null,
  };
}

function toolTitle(p: string): object {
  const { doc } = load(p);
  return {
    title: doc.sheet.title,
    revision: doc.sheet.revision,
    documentNumber: doc.sheet.documentNumber,
    author: doc.sheet.author,
    drawnBy: doc.sheet.drawnBy,
    companyName: doc.sheet.companyName,
    date: doc.sheet.date,
    sheetNumber: doc.sheet.sheetNumber,
    sheetTotal: doc.sheet.sheetTotal,
    parameters: doc.sheet.parameters,
  };
}

function toolComponents(p: string, filter?: string): object {
  const { doc } = load(p);
  const q = (filter ?? '').trim().toLowerCase();
  return {
    components: doc.components
      .filter((c) =>
        !q ||
        c.designator.toLowerCase().includes(q) ||
        c.libReference.toLowerCase().includes(q) ||
        c.value.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.footprint.toLowerCase().includes(q)
      )
      .map((c) => ({
        designator: c.designator,
        libReference: c.libReference,
        value: c.value,
        footprint: c.footprint,
        description: c.description,
      })),
  };
}

function toolComponent(p: string, designator: string): object {
  const { doc } = load(p);
  const c = doc.components.find(
    (x) => x.designator.toLowerCase() === designator.toLowerCase()
  );
  if (!c) return { error: `No component with designator "${designator}"` };
  const pins = doc.pins
    .filter((pin) => pin.componentRecordIndex === c.recordIndex)
    .map((pin) => ({
      pin: pin.pinDesignator,
      name: pin.name,
      electrical: pin.electrical,
    }));
  return {
    designator: c.designator,
    libReference: c.libReference,
    value: c.value,
    footprint: c.footprint,
    description: c.description,
    uniqueId: c.uniqueId,
    location: c.location,
    bbox: c.bbox,
    parameters: c.parameters,
    pins,
  };
}

function toolPins(p: string, filter?: string): object {
  const { doc } = load(p);
  const compByIdx = new Map(doc.components.map((c) => [c.recordIndex, c]));
  const q = (filter ?? '').trim().toLowerCase();
  const out = [];
  for (const pin of doc.pins) {
    const comp = compByIdx.get(pin.componentRecordIndex);
    const des = comp?.designator ?? '?';
    const row = {
      designator: des,
      pin: pin.pinDesignator,
      name: pin.name,
      electrical: pin.electrical,
    };
    if (q) {
      const hay = `${row.designator} ${row.pin} ${row.name}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(row);
  }
  return { pins: out };
}

function toolNets(p: string, filter?: string): object {
  const { nets } = load(p);
  const q = (filter ?? '').trim().toLowerCase();
  return {
    nets: nets
      .filter((n) => !q || n.name.toLowerCase().includes(q))
      .map((n) => ({ name: n.name, pinCount: n.pins.length })),
  };
}

function toolNet(p: string, name: string): object {
  const { nets } = load(p);
  const n = nets.find((x) => x.name === name);
  if (!n) {
    // Case-insensitive fallback
    const ci = nets.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!ci) return { error: `No net named "${name}"` };
    return { name: ci.name, pins: ci.pins };
  }
  return { name: n.name, pins: n.pins };
}

function toolBom(p: string): object {
  const { doc } = load(p);
  return { format: 'csv', content: bomToCsv(doc) };
}

function toolNetlist(p: string): object {
  const { doc, nets } = load(p);
  return { format: 'protel', content: netlistToProtel(nets, doc.components) };
}

function toolSearch(p: string, query: string): object {
  const { doc, nets } = load(p);
  const q = query.trim().toLowerCase();
  if (!q) return { matches: [] };
  const matches: { kind: string; label: string; detail?: string }[] = [];
  for (const c of doc.components) {
    if (
      c.designator.toLowerCase().includes(q) ||
      c.libReference.toLowerCase().includes(q) ||
      c.value.toLowerCase().includes(q)
    ) {
      matches.push({
        kind: 'component',
        label: c.designator,
        detail: `${c.libReference} · ${c.value} · ${c.footprint}`,
      });
    }
  }
  for (const n of nets) {
    if (n.name.toLowerCase().includes(q)) {
      matches.push({ kind: 'net', label: n.name, detail: `${n.pins.length} pins` });
    }
  }
  for (const c of doc.components) {
    for (const par of c.parameters) {
      if (par.value.toLowerCase().includes(q) || par.name.toLowerCase().includes(q)) {
        matches.push({
          kind: 'parameter',
          label: `${c.designator} · ${par.name}`,
          detail: par.value,
        });
      }
    }
  }
  return { matches: matches.slice(0, 200) };
}

function toolJson(p: string): object {
  const { doc, nets } = load(p);
  return buildJsonModel(doc, nets);
}

// ---------- tool registry ----------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>) => object;
}

const PATH_PROP = {
  type: 'string',
  description: 'Absolute or workspace-relative path to the .SchDoc file',
};

const TOOLS: ToolDef[] = [
  {
    name: 'schdoc_summary',
    description:
      'High-level summary of a schematic: record counts, sheet title/revision/author.',
    inputSchema: { type: 'object', properties: { path: PATH_PROP }, required: ['path'] },
    handler: (a) => toolSummary(String(a.path)),
  },
  {
    name: 'schdoc_title',
    description: 'Sheet title block: Title, Revision, Author, Date, DocumentNumber, etc.',
    inputSchema: { type: 'object', properties: { path: PATH_PROP }, required: ['path'] },
    handler: (a) => toolTitle(String(a.path)),
  },
  {
    name: 'schdoc_components',
    description:
      'List components on the sheet. Optional substring filter across designator/libReference/value/footprint/description.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROP,
        filter: { type: 'string', description: 'Case-insensitive substring filter.' },
      },
      required: ['path'],
    },
    handler: (a) => toolComponents(String(a.path), a.filter as string | undefined),
  },
  {
    name: 'schdoc_component',
    description:
      'Detailed view of one component: all parameters (including hidden), pins with names + electrical types, bounding box.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROP,
        designator: { type: 'string', description: 'Designator like "U1" (case-insensitive).' },
      },
      required: ['path', 'designator'],
    },
    handler: (a) => toolComponent(String(a.path), String(a.designator)),
  },
  {
    name: 'schdoc_pins',
    description:
      'List all pins with their owning component designator, pin number, signal name, and electrical type. Optional substring filter.',
    inputSchema: {
      type: 'object',
      properties: { path: PATH_PROP, filter: { type: 'string' } },
      required: ['path'],
    },
    handler: (a) => toolPins(String(a.path), a.filter as string | undefined),
  },
  {
    name: 'schdoc_nets',
    description:
      'List heuristic nets (from wires, junctions, pin hotspots, labels, power ports) with pin counts. Optional substring filter on net name.',
    inputSchema: {
      type: 'object',
      properties: { path: PATH_PROP, filter: { type: 'string' } },
      required: ['path'],
    },
    handler: (a) => toolNets(String(a.path), a.filter as string | undefined),
  },
  {
    name: 'schdoc_net',
    description: 'Pins connected on one specific net (case-insensitive name match).',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROP,
        name: { type: 'string', description: 'Net name, e.g. "GND" or "+3V3".' },
      },
      required: ['path', 'name'],
    },
    handler: (a) => toolNet(String(a.path), String(a.name)),
  },
  {
    name: 'schdoc_bom',
    description:
      'Grouped bill of materials as CSV. Parts with identical libReference/value/footprint collapse into one row with Qty and compressed designator range.',
    inputSchema: { type: 'object', properties: { path: PATH_PROP }, required: ['path'] },
    handler: (a) => toolBom(String(a.path)),
  },
  {
    name: 'schdoc_netlist',
    description: 'Protel-format netlist: component sections then net sections.',
    inputSchema: { type: 'object', properties: { path: PATH_PROP }, required: ['path'] },
    handler: (a) => toolNetlist(String(a.path)),
  },
  {
    name: 'schdoc_search',
    description:
      'Fuzzy search across component designators, library references, values, net names, and parameter names/values. Returns up to 200 matches with a kind and detail.',
    inputSchema: {
      type: 'object',
      properties: {
        path: PATH_PROP,
        query: { type: 'string', description: 'Case-insensitive substring query.' },
      },
      required: ['path', 'query'],
    },
    handler: (a) => toolSearch(String(a.path), String(a.query)),
  },
  {
    name: 'schdoc_json',
    description:
      'Return the full versioned JSON model of the schematic. Verbose — prefer narrower tools when possible.',
    inputSchema: { type: 'object', properties: { path: PATH_PROP }, required: ['path'] },
    handler: (a) => toolJson(String(a.path)),
  },
];

// ---------- JSON-RPC plumbing ----------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function send(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function log(s: string): void {
  process.stderr.write(`[altium-mcp] ${s}\n`);
}

function handle(req: JsonRpcRequest): void {
  const { id, method, params } = req;
  const respondResult = (result: unknown) => {
    if (id !== undefined) send({ jsonrpc: '2.0', id, result });
  };
  const respondError = (code: number, message: string, data?: unknown) => {
    if (id !== undefined) send({ jsonrpc: '2.0', id: id ?? null, error: { code, message, data } });
  };

  try {
    if (method === 'initialize') {
      respondResult({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;
    }
    if (method === 'initialized' || method === 'notifications/initialized') {
      // Notification; no response.
      return;
    }
    if (method === 'tools/list') {
      respondResult({
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      return;
    }
    if (method === 'tools/call') {
      const p = (params as { name?: string; arguments?: Record<string, unknown> }) ?? {};
      const tool = TOOLS.find((t) => t.name === p.name);
      if (!tool) {
        respondError(-32601, `Unknown tool: ${p.name}`);
        return;
      }
      const result = tool.handler(p.arguments ?? {});
      respondResult({
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: typeof result === 'object' && result !== null && 'error' in (result as object),
      });
      return;
    }
    if (method === 'ping') {
      respondResult({});
      return;
    }
    respondError(-32601, `Method not found: ${method}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`Error handling ${method}: ${msg}`);
    respondError(-32000, msg);
  }
}

// ---------- stdio loop ----------

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    try {
      const req = JSON.parse(line) as JsonRpcRequest;
      handle(req);
    } catch (e) {
      log(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

log(`${SERVER_NAME} v${SERVER_VERSION} MCP server ready on stdio`);
