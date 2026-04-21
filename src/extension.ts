import * as vscode from 'vscode';
import { bomToCsv } from './export/bomCsv';
import { netlistToProtel } from './export/netlistExport';
import { buildNetlist } from './netlist/builder';
import { parseSchDocBuffer } from './parser/schematic';
import { SchDocEditorProvider } from './editor/SchDocEditorProvider';

async function resolveSchDocUri(uri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (uri) return uri;
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const input = tab?.input as { uri?: vscode.Uri } | undefined;
  if (input?.uri) {
    const p = input.uri.fsPath.toLowerCase();
    if (p.endsWith('.schdoc') || p.endsWith('.schdot')) {
      return input.uri;
    }
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'Altium schematic': ['SchDoc', 'SchDot'] },
    openLabel: 'Open SchDoc',
  });
  return picked?.[0];
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SchDocEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('altium.schdoc', provider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('altium.exportBom', async (uri?: vscode.Uri) => {
      const u = await resolveSchDocUri(uri);
      if (!u) {
        vscode.window.showWarningMessage('No SchDoc selected.');
        return;
      }
      const buf = await vscode.workspace.fs.readFile(u);
      const model = parseSchDocBuffer(new Uint8Array(buf));
      const csv = bomToCsv(model);
      const base = u.fsPath.replace(/\.(SchDoc|SchDot)$/i, '') + '-bom.csv';
      const out = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(base),
        filters: { CSV: ['csv'] },
        saveLabel: 'Export BOM',
      });
      if (!out) return;
      await vscode.workspace.fs.writeFile(out, Buffer.from(csv, 'utf8'));
      vscode.window.showInformationMessage(`BOM written to ${out.fsPath}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('altium.exportNetlist', async (uri?: vscode.Uri) => {
      const u = await resolveSchDocUri(uri);
      if (!u) {
        vscode.window.showWarningMessage('No SchDoc selected.');
        return;
      }
      const buf = await vscode.workspace.fs.readFile(u);
      const model = parseSchDocBuffer(new Uint8Array(buf));
      const nets = buildNetlist(model);
      const text = netlistToProtel(nets);
      const base = u.fsPath.replace(/\.(SchDoc|SchDot)$/i, '') + '.net';
      const out = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(base),
        filters: { Netlist: ['net', 'txt'] },
        saveLabel: 'Export netlist',
      });
      if (!out) return;
      await vscode.workspace.fs.writeFile(out, Buffer.from(text, 'utf8'));
      vscode.window.showInformationMessage(`Netlist written to ${out.fsPath}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('altium.revealRaw', async (uri?: vscode.Uri) => {
      const u = await resolveSchDocUri(uri);
      if (!u) {
        vscode.window.showWarningMessage('No SchDoc selected.');
        return;
      }
      const buf = await vscode.workspace.fs.readFile(u);
      const model = parseSchDocBuffer(new Uint8Array(buf));
      const text = model.records.map((r) => r.raw).join('\n--- record ---\n');
      const doc = await vscode.workspace.openTextDocument({
        content: text,
        language: 'plaintext',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    })
  );
}

export function deactivate(): void {}
