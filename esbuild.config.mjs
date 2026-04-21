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

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
    console.log('Watching extension + webview…');
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    await extensionCtx.dispose();
    await webviewCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
