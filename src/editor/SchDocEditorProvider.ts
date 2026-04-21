import * as vscode from 'vscode';
import { buildNetlist, type BuiltNet } from '../netlist/builder';
import { parseSchDocBuffer, type ParsedSchDoc } from '../parser/schematic';
import { getWebviewHtml } from './html';
import { buildSvgPreviewInput } from './previewPayload';
import { buildSvgPreview } from './webview/svgPreview';

export class SchDocDocument implements vscode.CustomDocument {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly model: ParsedSchDoc,
    public readonly nets: BuiltNet[]
  ) {}

  dispose(): void {
    /* no native handles */
  }
}

export class SchDocEditorProvider implements vscode.CustomReadonlyEditorProvider<SchDocDocument> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri): Promise<SchDocDocument> {
    const buf = await vscode.workspace.fs.readFile(uri);
    const model = parseSchDocBuffer(new Uint8Array(buf));
    const nets = buildNetlist(model);
    return new SchDocDocument(uri, model, nets);
  }

  async resolveCustomEditor(
    document: SchDocDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview, this.context.extensionUri);
    webviewPanel.webview.postMessage({ type: 'init', payload: this.serialize(document) });
  }

  private serialize(document: SchDocDocument) {
    const p = document.model;
    const compMap = new Map(p.components.map((c) => [c.recordIndex, c]));
    const pins = p.pins.map((pin) => ({
      recordIndex: pin.recordIndex,
      componentRecordIndex: pin.componentRecordIndex,
      designator: compMap.get(pin.componentRecordIndex)?.designator ?? '',
      pinDesignator: pin.pinDesignator,
      name: pin.name,
      electrical: pin.electrical,
    }));
    const parameters: { component: string; name: string; value: string; hidden: boolean }[] = [];
    for (const c of p.components) {
      for (const par of c.parameters) {
        parameters.push({
          component: c.designator || '?',
          name: par.name,
          value: par.value,
          hidden: par.hidden,
        });
      }
    }
    const previewSvg = buildSvgPreview(buildSvgPreviewInput(p));
    const rawRecords = p.records.map((r) => ({
      index: r.index,
      type: r.recordType,
      preview: r.raw.slice(0, 400),
    }));
    const fileName =
      document.uri.path.split('/').pop() ??
      document.uri.fsPath.split(/[/\\]/).pop() ??
      'file.SchDoc';
    return {
      fileName,
      filePath: document.uri.fsPath,
      recordCount: p.records.length,
      sheet: { customSize: p.sheet.customSize },
      components: p.components.map((c) => ({
        recordIndex: c.recordIndex,
        designator: c.designator,
        libReference: c.libReference,
        value: c.value,
        footprint: c.footprint,
        description: c.description,
        indexInSheet: c.indexInSheet,
      })),
      pins,
      nets: document.nets,
      parameters,
      rawRecords,
      previewSvg,
    };
  }
}
