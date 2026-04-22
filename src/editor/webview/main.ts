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

type SortDir = 'asc' | 'desc';
type SortState = { col: number; dir: SortDir } | null;

// Remembered per tab so switching tabs doesn't lose the user's sort.
const sortByTab: Record<string, SortState> = {};

/**
 * Click header → asc; click same header → desc; click a third time → unsorted (original order).
 * `localeCompare(..., { numeric: true })` orders `R1, R2, R10` correctly as well as plain text.
 */
function cycleSort(tabId: string, col: number): void {
  const cur = sortByTab[tabId] ?? null;
  if (!cur || cur.col !== col) {
    sortByTab[tabId] = { col, dir: 'asc' };
  } else if (cur.dir === 'asc') {
    sortByTab[tabId] = { col, dir: 'desc' };
  } else {
    sortByTab[tabId] = null;
  }
}

function sortRows(rows: string[][], state: SortState): string[][] {
  if (!state) return rows;
  const { col, dir } = state;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) =>
    sign *
    (a[col] ?? '').localeCompare(b[col] ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

function renderTable(
  headers: string[],
  rows: string[][],
  filter: string,
  tabId: string,
  onSortChange: () => void
): HTMLElement {
  const wrap = el('div', 'table-wrap');
  const f = filter.trim().toLowerCase();
  const filtered = f
    ? rows.filter((r) => r.some((c) => c.toLowerCase().includes(f)))
    : rows;
  const state = sortByTab[tabId] ?? null;
  const sorted = sortRows(filtered, state);
  const table = el('table');
  const thead = el('thead');
  const trh = el('tr');
  headers.forEach((h, colIdx) => {
    const th = el('th', 'sortable') as HTMLTableCellElement;
    th.tabIndex = 0;
    th.setAttribute('role', 'columnheader');
    let ariaSort: 'ascending' | 'descending' | 'none' = 'none';
    let indicator = '';
    if (state && state.col === colIdx) {
      ariaSort = state.dir === 'asc' ? 'ascending' : 'descending';
      indicator = state.dir === 'asc' ? ' ▲' : ' ▼';
    }
    th.setAttribute('aria-sort', ariaSort);
    th.textContent = h + indicator;
    const activate = () => {
      cycleSort(tabId, colIdx);
      onSortChange();
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        activate();
      }
    });
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const row of sorted) {
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
      preview: 'Preview',
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
    // Default sort on first visit of each tab: designator / net-name ascending.
    if (sortByTab[activeTab] === undefined) {
      sortByTab[activeTab] = { col: 0, dir: 'asc' };
    }
    if (activeTab === 'components') {
      const headers = ['Designator', 'LibReference', 'Value', 'Footprint', 'IndexInSheet', 'Description'];
      const rows = payload!.components.map((c) => [
        c.designator,
        c.libReference,
        c.value,
        c.footprint,
        String(c.indexInSheet),
        c.description,
      ]);
      panel.appendChild(renderTable(headers, rows, f, activeTab, renderPanel));
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
      const rows = payload!.pins.map((p) => [
        p.designator,
        p.pinDesignator,
        p.name,
        String(p.electrical),
        String(p.componentRecordIndex),
      ]);
      panel.appendChild(renderTable(headers, rows, f, activeTab, renderPanel));
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
      const rows = payload!.nets.map((n) => [
        n.name,
        n.pins.map((p) => `${p.designator}-${p.pin}`).join(', '),
      ]);
      panel.appendChild(renderTable(headers, rows, f, activeTab, renderPanel));
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
      const rows = payload!.parameters.map((p) => [
        p.component,
        p.name,
        p.value,
        p.hidden ? 'Y' : '',
      ]);
      panel.appendChild(renderTable(headers, rows, f, activeTab, renderPanel));
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
      const zoomOut = el('button', 'btn', '−') as HTMLButtonElement;
      const zoomIn = el('button', 'btn', '+') as HTMLButtonElement;
      const reset = el('button', 'btn', 'Fit') as HTMLButtonElement;
      const hint = el(
        'div',
        'preview-hint',
        'Scroll to pan · Ctrl/Cmd+scroll to zoom · drag to pan · double-click zooms in'
      );
      controls.appendChild(zoomOut);
      controls.appendChild(zoomIn);
      controls.appendChild(reset);
      controls.appendChild(hint);
      wrap.appendChild(controls);
      const host = el('div', 'svg-host') as HTMLDivElement;
      host.innerHTML = payload!.previewSvg;
      const svgNode = host.querySelector('svg') as SVGSVGElement | null;
      if (svgNode) {
        const svg: SVGSVGElement = svgNode;
        const base = svg.viewBox.baseVal;
        const initialViewBox = { x: base.x, y: base.y, width: base.width, height: base.height };
        let zoom = 1;
        let viewBox = { ...initialViewBox };
        let drag: { pointerId: number; x: number; y: number } | null = null;

        function updateUpp() {
          const rect = host.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          // SVG uses preserveAspectRatio="xMidYMid meet", so the effective scale
          // is the smaller of the two (content is padded, not cropped).
          const scaleX = rect.width / viewBox.width;
          const scaleY = rect.height / viewBox.height;
          const scale = Math.min(scaleX, scaleY);
          if (scale <= 0 || !Number.isFinite(scale)) return;
          const upp = 1 / scale;
          host.style.setProperty('--upp', String(upp));
        }

        function apply() {
          svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
          updateUpp();
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
        const resizeObserver = new ResizeObserver(() => updateUpp());
        resizeObserver.observe(host);

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
      const rows = payload!.rawRecords.map((r) => [
        String(r.index),
        r.type === null ? '' : String(r.type),
        r.preview,
      ]);
      panel.appendChild(renderTable(headers, rows, f, activeTab, renderPanel));
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
  :root { --ciab-gap: 8px; }
  body {
    margin: 0;
    font-family: var(--vscode-font-family, system-ui, -apple-system, Segoe UI, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    height: 100vh;
    overflow: hidden;
  }
  #root { display: flex; flex-direction: column; height: 100vh; }
  .header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  }
  .header h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }
  .meta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .toolbar {
    display: flex;
    gap: var(--ciab-gap);
    padding: 6px 16px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    align-items: center;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  }
  .filter {
    flex: 1;
    max-width: 360px;
    padding: 4px 8px;
    border-radius: 2px;
    border: 1px solid var(--vscode-input-border, transparent);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }
  .filter::placeholder { color: var(--vscode-input-placeholderForeground); }
  .filter:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  .btn {
    padding: 4px 10px;
    border-radius: 2px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
  .btn:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 1px;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 16px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    flex-wrap: wrap;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  }
  .tab {
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    opacity: 0.75;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    font-family: inherit;
    font-size: inherit;
  }
  .tab:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
  .tab.active {
    color: var(--vscode-foreground);
    opacity: 1;
    border-bottom-color: var(--vscode-focusBorder, var(--vscode-textLink-foreground));
  }
  .tab:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -2px;
  }
  .panel {
    flex: 1;
    overflow: auto;
    padding: 12px 16px;
    background: var(--vscode-editor-background);
  }
  .table-wrap {
    overflow: auto;
    max-height: calc(100vh - 180px);
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 2px;
  }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td {
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    padding: 4px 10px;
    text-align: left;
    vertical-align: top;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
    z-index: 1;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    user-select: none;
  }
  th.sortable { cursor: pointer; }
  th.sortable:hover { background: var(--vscode-list-hoverBackground); }
  th.sortable:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -2px; }
  th[aria-sort="ascending"], th[aria-sort="descending"] { color: var(--vscode-foreground); }
  tr:hover td { background: var(--vscode-list-hoverBackground); }
  /* Monospace for identifier-like columns */
  td.mono, th.mono { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
  .preview-wrap { display: flex; flex-direction: column; gap: var(--ciab-gap); height: calc(100vh - 180px); }
  .preview-controls { display: flex; gap: var(--ciab-gap); align-items: center; flex-wrap: wrap; }
  .preview-hint {
    margin-left: auto;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .svg-host {
    flex: 1;
    overflow: hidden;
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 2px;
    background: var(--vscode-editor-background);
    cursor: grab;
    touch-action: none;
    /* --upp is set from JS on every viewBox change; default keeps text visible on first paint. */
    --upp: 1;
  }
  .svg-host:active { cursor: grabbing; }
  .svg-host svg { display: block; width: 100%; height: 100%; user-select: none; }
`;
document.head.appendChild(style);
