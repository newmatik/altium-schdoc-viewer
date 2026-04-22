import { buildSvgPreview } from './svgPreview';

interface InitPayload {
  fileName: string;
  filePath: string;
  recordCount: number;
  sheet: { customSize: { x: number; y: number } | null };
  components: {
    recordIndex: number;
    designator: string;
    libReference: string;
    value: string;
    footprint: string;
    description: string;
    indexInSheet: number;
  }[];
  pins: {
    recordIndex: number;
    componentRecordIndex: number;
    designator: string;
    pinDesignator: string;
    name: string;
    electrical: number;
  }[];
  nets: { id: string; name: string; pins: { designator: string; pin: string; pinName: string }[] }[];
  parameters: { component: string; name: string; value: string; hidden: boolean }[];
  rawRecords: { index: number; type: number | null; preview: string }[];
  previewSvg: string;
}

const vscode = acquireVsCodeApi();

const root = document.getElementById('root')!;

let payload: InitPayload | null = null;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderTable(
  headers: string[],
  rows: string[][],
  filter: string
): HTMLElement {
  const wrap = el('div', 'table-wrap');
  const f = filter.trim().toLowerCase();
  const filtered = f
    ? rows.filter((r) => r.some((c) => c.toLowerCase().includes(f)))
    : rows;
  const table = el('table');
  const thead = el('thead');
  const trh = el('tr');
  for (const h of headers) {
    const th = el('th');
    th.textContent = h;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const row of filtered) {
    const tr = el('tr');
    for (const c of row) {
      const td = el('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function csvFromTable(headers: string[], rows: string[][]): string {
  const esc = (s: string) =>
    /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return lines.join('\n') + '\n';
}

function tabButton(label: string, id: string, active: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tab' + (active ? ' active' : '');
  b.dataset.tab = id;
  b.textContent = label;
  return b;
}

function render(): void {
  if (!payload) return;
  root.innerHTML = '';

  const header = el('header', 'header');
  header.appendChild(el('h1', '', payload.fileName));
  const meta = el('div', 'meta');
  meta.textContent = `${payload.recordCount} records · ${payload.components.length} components · ${payload.pins.length} pins · ${payload.nets.length} nets`;
  header.appendChild(meta);
  root.appendChild(header);

  const toolbar = el('div', 'toolbar');
  const filterInput = el('input', 'filter') as HTMLInputElement;
  filterInput.type = 'search';
  filterInput.placeholder = 'Filter current tab…';
  toolbar.appendChild(filterInput);
  const exportCsv = el('button', 'btn', 'Export tab CSV') as HTMLButtonElement;
  toolbar.appendChild(exportCsv);
  root.appendChild(toolbar);

  const tabs = el('div', 'tabs');
  const tabIds = ['components', 'pins', 'nets', 'parameters', 'preview', 'raw'] as const;
  let activeTab: (typeof tabIds)[number] = 'components';
  for (const id of tabIds) {
    const labels: Record<(typeof tabIds)[number], string> = {
      components: 'Components',
      pins: 'Pins',
      nets: 'Nets',
      parameters: 'Parameters',
      preview: 'Draft (WIP)',
      raw: 'Raw',
    };
    tabs.appendChild(tabButton(labels[id], id, id === activeTab));
  }
  root.appendChild(tabs);

  const panel = el('div', 'panel');
  root.appendChild(panel);

  function renderPanel(): void {
    panel.innerHTML = '';
    const f = filterInput.value;
    if (activeTab === 'components') {
      const headers = ['Designator', 'LibReference', 'Value', 'Footprint', 'IndexInSheet', 'Description'];
      const rows = payload!.components
        .map((c) => [
          c.designator,
          c.libReference,
          c.value,
          c.footprint,
          String(c.indexInSheet),
          c.description,
        ])
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
      panel.appendChild(renderTable(headers, rows, f));
      (exportCsv as HTMLButtonElement).onclick = () => {
        const blob = new Blob([csvFromTable(headers, rows)], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${payload!.fileName}-components.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    } else if (activeTab === 'pins') {
      const headers = ['Designator', 'Pin', 'Name', 'Electrical', 'CompIdx'];
      const rows = payload!.pins
        .map((p) => [
          p.designator,
          p.pinDesignator,
          p.name,
          String(p.electrical),
          String(p.componentRecordIndex),
        ])
        .sort((a, b) => {
          const d = a[0].localeCompare(b[0], undefined, { numeric: true });
          return d !== 0 ? d : a[1].localeCompare(b[1], undefined, { numeric: true });
        });
      panel.appendChild(renderTable(headers, rows, f));
      (exportCsv as HTMLButtonElement).onclick = () => {
        const blob = new Blob([csvFromTable(headers, rows)], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${payload!.fileName}-pins.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    } else if (activeTab === 'nets') {
      const headers = ['Net', 'Pins'];
      const rows = payload!.nets
        .map((n) => [n.name, n.pins.map((p) => `${p.designator}-${p.pin}`).join(', ')])
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
      panel.appendChild(renderTable(headers, rows, f));
      (exportCsv as HTMLButtonElement).onclick = () => {
        const lines = ['Net,Pin,PinName'];
        for (const n of payload!.nets) {
          for (const p of n.pins) lines.push([n.name, `${p.designator}-${p.pin}`, p.pinName].join(','));
        }
        const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${payload!.fileName}-nets.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    } else if (activeTab === 'parameters') {
      const headers = ['Component', 'Name', 'Value', 'Hidden'];
      const rows = payload!.parameters
        .map((p) => [p.component, p.name, p.value, p.hidden ? 'Y' : ''])
        .sort((a, b) => {
          const d = a[0].localeCompare(b[0], undefined, { numeric: true });
          return d !== 0 ? d : a[1].localeCompare(b[1]);
        });
      panel.appendChild(renderTable(headers, rows, f));
      (exportCsv as HTMLButtonElement).onclick = () => {
        const blob = new Blob([csvFromTable(headers, rows)], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${payload!.fileName}-parameters.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    } else if (activeTab === 'preview') {
      exportCsv.style.display = 'none';
      const wrap = el('div', 'preview-wrap');
      const controls = el('div', 'preview-controls');
      const zoomOut = el('button', 'btn', '-') as HTMLButtonElement;
      const zoomIn = el('button', 'btn', '+') as HTMLButtonElement;
      const reset = el('button', 'btn', 'Fit') as HTMLButtonElement;
      const hint = el('div', 'preview-hint', 'Wheel pans, pinch or Ctrl+wheel zooms, drag pans.');
      controls.appendChild(zoomOut);
      controls.appendChild(zoomIn);
      controls.appendChild(reset);
      controls.appendChild(hint);
      wrap.appendChild(controls);
      const host = el('div', 'svg-host') as HTMLDivElement;
      host.innerHTML = payload!.previewSvg;
      const svg = host.querySelector('svg') as SVGSVGElement | null;
      if (svg) {
        const base = svg.viewBox.baseVal;
        const initialViewBox = { x: base.x, y: base.y, width: base.width, height: base.height };
        let zoom = 1;
        let viewBox = { ...initialViewBox };
        let drag: { pointerId: number; x: number; y: number } | null = null;

        function apply() {
          svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        }

        function clampZoom(nextZoom: number): number {
          return Math.min(48, Math.max(1, nextZoom));
        }

        function zoomAt(clientX: number, clientY: number, factor: number): void {
          const rect = host.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const nextZoom = clampZoom(zoom * factor);
          if (nextZoom === zoom) return;
          const px = (clientX - rect.left) / rect.width;
          const py = (clientY - rect.top) / rect.height;
          const worldX = viewBox.x + px * viewBox.width;
          const worldY = viewBox.y + py * viewBox.height;
          zoom = nextZoom;
          viewBox = {
            x: worldX - px * (initialViewBox.width / zoom),
            y: worldY - py * (initialViewBox.height / zoom),
            width: initialViewBox.width / zoom,
            height: initialViewBox.height / zoom,
          };
          apply();
        }

        function panByPixels(dx: number, dy: number): void {
          const rect = host.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          viewBox = {
            ...viewBox,
            x: viewBox.x + (dx * viewBox.width) / rect.width,
            y: viewBox.y + (dy * viewBox.height) / rect.height,
          };
          apply();
        }

        apply();

        host.addEventListener(
          'wheel',
          (ev: WheelEvent) => {
            ev.preventDefault();
            if (ev.ctrlKey || ev.metaKey) {
              const factor = Math.exp(-ev.deltaY * 0.0025);
              zoomAt(ev.clientX, ev.clientY, factor);
              return;
            }
            panByPixels(ev.deltaX, ev.deltaY);
          },
          { passive: false }
        );

        host.addEventListener('pointerdown', (ev: PointerEvent) => {
          drag = { pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY };
          host.setPointerCapture(ev.pointerId);
        });

        host.addEventListener('pointermove', (ev: PointerEvent) => {
          if (!drag || drag.pointerId !== ev.pointerId) return;
          panByPixels(drag.x - ev.clientX, drag.y - ev.clientY);
          drag = { ...drag, x: ev.clientX, y: ev.clientY };
        });

        const stopDrag = (ev: PointerEvent) => {
          if (!drag || drag.pointerId !== ev.pointerId) return;
          drag = null;
          if (host.hasPointerCapture(ev.pointerId)) host.releasePointerCapture(ev.pointerId);
        };

        host.addEventListener('pointerup', stopDrag);
        host.addEventListener('pointercancel', stopDrag);
        host.addEventListener('dblclick', (ev: MouseEvent) => zoomAt(ev.clientX, ev.clientY, 1.6));

        zoomIn.onclick = () => {
          const rect = host.getBoundingClientRect();
          zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
        };
        zoomOut.onclick = () => {
          const rect = host.getBoundingClientRect();
          zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.25);
        };
        reset.onclick = () => {
          zoom = 1;
          viewBox = { ...initialViewBox };
          apply();
        };
      }
      wrap.appendChild(host);
      panel.appendChild(wrap);
    } else {
      exportCsv.style.display = '';
      const headers = ['Index', 'RECORD', 'Preview'];
      const rows = payload!.rawRecords
        .map((r) => [String(r.index), r.type === null ? '' : String(r.type), r.preview])
        .sort((a, b) => Number(a[0]) - Number(b[0]));
      panel.appendChild(renderTable(headers, rows, f));
      (exportCsv as HTMLButtonElement).onclick = () => {
        const blob = new Blob([csvFromTable(headers, rows)], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${payload!.fileName}-raw.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    }
    if (activeTab !== 'preview') exportCsv.style.display = '';
  }

  tabs.querySelectorAll('button.tab').forEach((btn: Element) => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('button.tab').forEach((b: Element) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = (btn as HTMLButtonElement).dataset.tab as (typeof tabIds)[number];
      renderPanel();
    });
  });

  filterInput.addEventListener('input', () => renderPanel());
  renderPanel();
}

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data;
  if (msg?.type === 'init') {
    payload = msg.payload as InitPayload;
    render();
  }
});

const style = document.createElement('style');
style.textContent = `
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:#1e1e1e; color:#ccc; height:100vh; overflow:hidden; }
  #root { display:flex; flex-direction:column; height:100vh; }
  .header { padding:12px 16px; border-bottom:1px solid #333; }
  .header h1 { margin:0; font-size:16px; color:#fff; }
  .meta { margin-top:6px; font-size:12px; color:#888; }
  .toolbar { display:flex; gap:8px; padding:8px 16px; border-bottom:1px solid #333; align-items:center; }
  .filter { flex:1; max-width:360px; padding:6px 10px; border-radius:4px; border:1px solid #444; background:#2d2d2d; color:#ddd; }
  .btn { padding:6px 12px; border-radius:4px; border:1px solid #444; background:#333; color:#ddd; cursor:pointer; }
  .btn:hover { background:#3a3a3a; }
  .tabs { display:flex; gap:4px; padding:8px 16px 0; border-bottom:1px solid #333; flex-wrap:wrap; }
  .tab { padding:6px 12px; border:1px solid transparent; border-bottom:none; background:transparent; color:#aaa; cursor:pointer; border-radius:4px 4px 0 0; }
  .tab.active { background:#252526; color:#fff; border-color:#333; border-bottom-color:#252526; }
  .panel { flex:1; overflow:auto; padding:12px 16px; background:#252526; }
  .table-wrap { overflow:auto; max-height: calc(100vh - 200px); border:1px solid #333; border-radius:4px; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  th, td { border-bottom:1px solid #333; padding:6px 8px; text-align:left; vertical-align:top; }
  th { position:sticky; top:0; background:#2a2d2e; color:#aaa; z-index:1; }
  tr:hover td { background:#2a2d2e; }
  .preview-wrap { display:flex; flex-direction:column; gap:8px; height: calc(100vh - 200px); }
  .preview-controls { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .preview-hint { margin-left:auto; font-size:12px; color:#888; }
  .svg-host { flex:1; overflow:hidden; border:1px solid #333; border-radius:4px; background:#1a1a1a; cursor:grab; touch-action:none; }
  .svg-host:active { cursor:grabbing; }
  .svg-host svg { display:block; width:100%; height:100%; user-select:none; }
`;
document.head.appendChild(style);
