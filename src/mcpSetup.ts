import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Register the bundled MCP server with whichever AI chat client the user prefers.
 *
 * Each supported client reads MCP config from a different file with a slightly different
 * shape. We merge into any existing config rather than overwriting it, so other MCP
 * servers the user already registered stay intact.
 */

const SERVER_NAME = 'altium-schdoc';

interface StdIoServer {
  command: string;
  args: string[];
}

interface MCPServersConfig {
  mcpServers?: Record<string, StdIoServer>;
  [key: string]: unknown;
}

interface ServersConfig {
  servers?: Record<string, StdIoServer>;
  [key: string]: unknown;
}

type ClientId = 'cursor' | 'claude-code' | 'vscode' | 'claude-desktop';

interface ClientSpec {
  id: ClientId;
  label: string;
  description: string;
  /** Returns the absolute config path; may read the workspace folder or OS-specific home. */
  configPath: (ctx: vscode.ExtensionContext) => string | Error;
  /** Which top-level key holds the server map. */
  key: 'mcpServers' | 'servers';
  /** Hint the user sees after a successful write. */
  postHint: string;
}

function workspaceRootOrError(): string | Error {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    return new Error(
      'No workspace folder is open. Open the folder that contains your .SchDoc files first, then re-run this command.'
    );
  }
  return ws.uri.fsPath;
}

const CLIENTS: ClientSpec[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    description: 'Write .cursor/mcp.json in the current workspace',
    configPath: () => {
      const root = workspaceRootOrError();
      return root instanceof Error ? root : path.join(root, '.cursor', 'mcp.json');
    },
    key: 'mcpServers',
    postHint:
      'Reload Cursor (Cmd/Ctrl+R). Then open Cursor Settings → MCP — the altium-schdoc server will appear DISABLED by default (Cursor\'s security default). Flip the toggle to enable it, then use the Agent/Composer chat (Cmd+I) with a prompt like "summarize AFE-Eval_Schematics_B.SchDoc".',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'Write .mcp.json in the current workspace (project-scoped)',
    configPath: () => {
      const root = workspaceRootOrError();
      return root instanceof Error ? root : path.join(root, '.mcp.json');
    },
    key: 'mcpServers',
    postHint:
      'Restart Claude Code in this directory. It will prompt you to approve the new server on first use; accept. Tools appear as mcp__altium-schdoc__schdoc_*.',
  },
  {
    id: 'vscode',
    label: 'VS Code (native MCP / GitHub Copilot agent)',
    description: 'Write .vscode/mcp.json in the current workspace',
    configPath: () => {
      const root = workspaceRootOrError();
      return root instanceof Error ? root : path.join(root, '.vscode', 'mcp.json');
    },
    key: 'servers',
    postHint:
      'Run "Developer: Reload Window". VS Code prompts to trust new MCP servers on first use — accept. In Copilot Chat, switch to Agent mode before asking tool-requiring questions.',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    description: 'Update the user-wide Claude Desktop config',
    configPath: () => {
      switch (process.platform) {
        case 'darwin':
          return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        case 'win32':
          return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
        default:
          return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
      }
    },
    key: 'mcpServers',
    postHint:
      'Quit and relaunch Claude Desktop. Click the plug icon in the chat to confirm altium-schdoc is connected, then ask a schematic question.',
  },
];

function mcpServerBinaryPath(ctx: vscode.ExtensionContext): string {
  return path.join(ctx.extensionPath, 'dist', 'mcp-server.js');
}

function readJsonIfExists<T extends object>(file: string): T {
  if (!fs.existsSync(file)) return {} as T;
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(
      `Existing ${file} is not valid JSON. Fix it manually (or move it aside) and re-run.`
    );
  }
}

function writeMerged(
  configPath: string,
  key: 'mcpServers' | 'servers',
  entry: StdIoServer
): 'created' | 'merged' {
  const existed = fs.existsSync(configPath);
  const cfg = readJsonIfExists<MCPServersConfig & ServersConfig>(configPath);
  const bucket = (cfg[key] ?? {}) as Record<string, StdIoServer>;
  bucket[SERVER_NAME] = entry;
  (cfg as Record<string, unknown>)[key] = bucket;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return existed ? 'merged' : 'created';
}

export async function runMcpSetupCommand(ctx: vscode.ExtensionContext): Promise<void> {
  const binary = mcpServerBinaryPath(ctx);
  if (!fs.existsSync(binary)) {
    vscode.window.showErrorMessage(
      `MCP server binary not found at ${binary}. Did the extension finish building? (npm run build)`
    );
    return;
  }
  const picks = await vscode.window.showQuickPick(
    CLIENTS.map((c) => ({
      label: c.label,
      description: c.description,
      id: c.id,
      picked: false,
    })),
    {
      canPickMany: true,
      placeHolder: 'Pick the AI clients that should see this schematic (space to toggle, Enter to confirm)',
      ignoreFocusOut: true,
    }
  );
  if (!picks || picks.length === 0) return;

  const entry: StdIoServer = { command: 'node', args: [binary] };
  const results: { client: ClientSpec; file: string; status: 'created' | 'merged' | 'error'; error?: string }[] = [];

  for (const pick of picks) {
    const client = CLIENTS.find((c) => c.id === pick.id)!;
    const p = client.configPath(ctx);
    if (p instanceof Error) {
      results.push({ client, file: '', status: 'error', error: p.message });
      continue;
    }
    try {
      const status = writeMerged(p, client.key, entry);
      results.push({ client, file: p, status });
    } catch (e) {
      results.push({
        client,
        file: p,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const successes = results.filter((r) => r.status !== 'error');
  const failures = results.filter((r) => r.status === 'error');

  if (failures.length > 0) {
    const msg = failures
      .map((f) => `${f.client.label}: ${f.error}`)
      .join('\n');
    vscode.window.showErrorMessage(`Some MCP setups failed:\n${msg}`);
  }

  if (successes.length === 0) return;

  const bullets = successes
    .map((r) => `• ${r.client.label} (${r.status}): ${r.file}\n  ${r.client.postHint}`)
    .join('\n');
  const preamble =
    'IMPORTANT: MCP clients register new servers as disabled/untrusted by default. After reloading, open your client\'s MCP settings and enable/approve the altium-schdoc server before asking the chat.';
  const action = await vscode.window.showInformationMessage(
    `Registered Altium MCP server with ${successes.length} client${successes.length === 1 ? '' : 's'}.`,
    { modal: false, detail: `${preamble}\n\n${bullets}` },
    'Test server',
    'Open config file',
    'Copy server path'
  );
  if (action === 'Test server') {
    await runMcpHealthCheckCommand(ctx);
  }
  if (action === 'Open config file' && successes[0]) {
    const doc = await vscode.workspace.openTextDocument(successes[0].file);
    await vscode.window.showTextDocument(doc, { preview: true });
  }
  if (action === 'Copy server path') {
    await vscode.env.clipboard.writeText(binary);
    vscode.window.showInformationMessage(`Copied: ${binary}`);
  }
}

/**
 * Spawn the bundled MCP server and run the same initialize + tools/list handshake a client
 * would. Reports a notification with the server version and tool count on success, or a clear
 * error (plus an output channel dump) on failure. Removes Cursor / Claude / Copilot from the
 * debugging loop when the user is trying to confirm the server itself works.
 */
export async function runMcpHealthCheckCommand(
  ctx: vscode.ExtensionContext
): Promise<void> {
  const binary = path.join(ctx.extensionPath, 'dist', 'mcp-server.js');
  if (!fs.existsSync(binary)) {
    vscode.window.showErrorMessage(
      `MCP server binary not found at ${binary}. Run "npm run build" in the extension folder, then try again.`
    );
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Altium MCP: health check', cancellable: false },
    async () => {
      let stdoutBuf = '';
      let stderrBuf = '';
      const child = spawn(process.execPath, [binary], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c: string) => (stdoutBuf += c));
      child.stderr.on('data', (c: string) => (stderrBuf += c));

      const initMsg = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'altium-health-check', version: '0.0.0' },
        },
      };
      const notifyMsg = { jsonrpc: '2.0', method: 'notifications/initialized' };
      const listMsg = { jsonrpc: '2.0', id: 2, method: 'tools/list' };

      child.stdin.write(JSON.stringify(initMsg) + '\n');
      child.stdin.write(JSON.stringify(notifyMsg) + '\n');
      child.stdin.write(JSON.stringify(listMsg) + '\n');

      interface InitResult { serverInfo?: { name?: string; version?: string } }
      interface ToolsResult { tools?: { name: string }[] }
      const deadline = Date.now() + 3000;
      let initResult: InitResult | null = null;
      let toolsResult: ToolsResult | null = null;

      while (Date.now() < deadline) {
        const nl = stdoutBuf.lastIndexOf('\n');
        if (nl >= 0) {
          const lines = stdoutBuf.slice(0, nl).split('\n').filter((l) => l.trim());
          for (const line of lines) {
            try {
              const msg = JSON.parse(line) as {
                id?: number;
                result?: object;
                error?: { message?: string };
              };
              if (msg.error) {
                stderrBuf += `\n[rpc error on id=${msg.id}] ${msg.error.message ?? ''}`;
              } else if (msg.id === 1 && msg.result) {
                initResult = msg.result as InitResult;
              } else if (msg.id === 2 && msg.result) {
                toolsResult = msg.result as ToolsResult;
              }
            } catch {
              // Ignore partial / non-JSON lines; they'll re-appear in the next chunk.
            }
          }
        }
        if (initResult && toolsResult) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      try {
        child.kill();
      } catch {
        // Child may already be gone.
      }

      if (!initResult || !toolsResult) {
        const output = mcpOutput(ctx);
        output.clear();
        output.appendLine('=== stdout ===');
        output.appendLine(stdoutBuf);
        output.appendLine('=== stderr ===');
        output.appendLine(stderrBuf);
        const brief = (stderrBuf.split('\n').find((l) => l.trim()) ?? 'no output').slice(0, 160);
        const action = await vscode.window.showErrorMessage(
          `MCP server did not respond to initialize + tools/list within 3s.  ${brief}`,
          'Show full output'
        );
        if (action === 'Show full output') output.show(true);
        return;
      }

      const version = initResult.serverInfo?.version ?? '?';
      const name = initResult.serverInfo?.name ?? SERVER_NAME;
      const tools = toolsResult.tools ?? [];
      const preview = tools.slice(0, 4).map((t) => t.name).join(', ');
      const more = tools.length > 4 ? `, +${tools.length - 4} more` : '';
      vscode.window.showInformationMessage(
        `MCP server healthy — ${name} v${version}, ${tools.length} tool${tools.length === 1 ? '' : 's'} (${preview}${more}).`
      );
    }
  );
}

let _output: vscode.OutputChannel | null = null;
function mcpOutput(ctx: vscode.ExtensionContext): vscode.OutputChannel {
  if (!_output) {
    _output = vscode.window.createOutputChannel('Altium MCP');
    ctx.subscriptions.push(_output);
  }
  return _output;
}

/** Print the registration snippet to an untitled doc for clients we don't handle natively. */
export async function runMcpShowSnippetCommand(ctx: vscode.ExtensionContext): Promise<void> {
  const binary = mcpServerBinaryPath(ctx);
  const body = `# Altium SchDoc MCP server — manual registration snippet

Server binary: ${binary}

## Cursor (.cursor/mcp.json) / Claude Code (.mcp.json) / Claude Desktop config

\`\`\`json
{
  "mcpServers": {
    "${SERVER_NAME}": {
      "command": "node",
      "args": ["${binary}"]
    }
  }
}
\`\`\`

## VS Code native MCP (.vscode/mcp.json)

\`\`\`json
{
  "servers": {
    "${SERVER_NAME}": {
      "command": "node",
      "args": ["${binary}"]
    }
  }
}
\`\`\`

Tip: Run "Altium: Set up MCP server" (Cmd+Shift+P) to write these files automatically.
`;
  const doc = await vscode.workspace.openTextDocument({
    content: body,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}
