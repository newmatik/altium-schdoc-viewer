import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const dist = path.join(__dirname, 'dist');

async function main() {
  if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });

  const extensionCtx = await esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
    bundle: true,
    outfile: path.join(dist, 'extension.js'),
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    external: ['vscode'],
    logLevel: 'info',
  });

  const webviewCtx = await esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'editor', 'webview', 'main.ts')],
    bundle: true,
    outfile: path.join(dist, 'webview.js'),
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    sourcemap: true,
    logLevel: 'info',
  });

  // MCP server — a standalone Node CLI that speaks JSON-RPC over stdio.
  // Shebang'd so `node dist/mcp-server.js` (or making it +x) both work.
  const mcpCtx = await esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'mcp', 'server.ts')],
    bundle: true,
    outfile: path.join(dist, 'mcp-server.js'),
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    logLevel: 'info',
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch(), mcpCtx.watch()]);
    console.log('Watching extension + webview + mcp-server…');
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild(), mcpCtx.rebuild()]);
    await extensionCtx.dispose();
    await webviewCtx.dispose();
    await mcpCtx.dispose();
    // Make the MCP server directly executable.
    const mcpOut = path.join(dist, 'mcp-server.js');
    if (fs.existsSync(mcpOut)) fs.chmodSync(mcpOut, 0o755);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
