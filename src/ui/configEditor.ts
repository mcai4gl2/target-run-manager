/**
 * Webview panel for creating and editing RunConfig objects.
 *
 * Opens a rich form panel with all config fields. Communicates with the
 * extension via postMessage. On save, writes the config back to disk via
 * ConfigStorage.
 */

import * as vscode from 'vscode';
import type { RunConfig, Group, WorkspaceModel } from '../model/config';
import { ConfigStorage } from '../model/storage';

export type EditorMode = 'create' | 'edit';

export interface ConfigEditorOptions {
  mode: EditorMode;
  config?: RunConfig;           // Existing config (for edit mode)
  targetGroupId?: string;       // Group to place a new config in
  model: WorkspaceModel;
  storage: ConfigStorage;
  onSaved: () => void;          // Callback to reload configs after save
}

export class ConfigEditorPanel {
  static readonly viewType = 'targetRunManager.configEditor';

  private readonly panel: vscode.WebviewPanel;
  private readonly options: ConfigEditorOptions;
  private disposables: vscode.Disposable[] = [];

  static open(
    context: vscode.ExtensionContext,
    options: ConfigEditorOptions,
  ): ConfigEditorPanel {
    const title =
      options.mode === 'create'
        ? 'New Run Config'
        : `Edit: ${options.config?.name ?? options.config?.id}`;

    const panel = vscode.window.createWebviewPanel(
      ConfigEditorPanel.viewType,
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    return new ConfigEditorPanel(panel, options);
  }

  private constructor(panel: vscode.WebviewPanel, options: ConfigEditorOptions) {
    this.panel = panel;
    this.options = options;

    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Send initial data to the webview after it loads
    // Using a small delay to ensure the webview JS is ready
    setTimeout(() => this.sendInitData(), 150);
  }

  private sendInitData(): void {
    const groups = this.options.model.groups.map((g) => ({
      id: g.id,
      name: g.name,
    }));

    this.panel.webview.postMessage({
      command: 'init',
      mode: this.options.mode,
      config: this.options.config ?? this.makeDefaultConfig(),
      groups,
      targetGroupId: this.options.targetGroupId,
    });
  }

  private makeDefaultConfig(): Partial<RunConfig> {
    return {
      id: `cfg-${Date.now().toString(36)}`,
      name: '',
      buildSystem: 'cmake',
      runMode: 'run',
      preBuild: true,
      terminal: 'dedicated',
    };
  }

  private handleMessage(message: { command: string; config?: RunConfig; groupId?: string }): void {
    switch (message.command) {
      case 'save':
        this.handleSave(message.config!, message.groupId);
        break;
      case 'cancel':
        this.panel.dispose();
        break;
      case 'ready':
        this.sendInitData();
        break;
    }
  }

  private handleSave(config: RunConfig, groupId: string | undefined): void {
    try {
      this.options.storage.saveConfig(config, groupId, this.options.model);
      this.options.onSaved();
      vscode.window.showInformationMessage(
        `[Target Run Manager] Config "${config.name}" saved.`,
      );
      this.panel.dispose();
    } catch (e) {
      vscode.window.showErrorMessage(
        `[Target Run Manager] Failed to save config: ${(e as Error).message}`,
      );
    }
  }

  private dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  // ---------------------------------------------------------------------------
  // HTML content
  // ---------------------------------------------------------------------------

  private getHtmlContent(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Config Editor</title>
<style>
  :root {
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --input-border: var(--vscode-input-border);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --btn-sec-bg: var(--vscode-button-secondaryBackground);
    --btn-sec-fg: var(--vscode-button-secondaryForeground);
    --section-bg: var(--vscode-sideBar-background);
    --border: var(--vscode-panel-border);
    --focus: var(--vscode-focusBorder);
    --desc: var(--vscode-descriptionForeground);
    --error: var(--vscode-errorForeground);
  }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 0 20px 40px;
    max-width: 780px;
  }
  h2 { margin-top: 24px; margin-bottom: 6px; font-size: 1.1em; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  h3 { margin-top: 16px; margin-bottom: 4px; font-size: 0.95em; color: var(--desc); }
  label { display: block; margin-bottom: 4px; font-size: 0.9em; }
  .field { margin-bottom: 14px; }
  .desc { font-size: 0.82em; color: var(--desc); margin-top: 2px; }
  input[type="text"], input[type="number"], select, textarea {
    width: 100%;
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border, #555);
    border-radius: 2px;
    padding: 5px 8px;
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }
  input[type="text"]:focus, select:focus, textarea:focus {
    border-color: var(--focus);
  }
  .radio-group, .check-group { display: flex; flex-wrap: wrap; gap: 12px; }
  .radio-group label, .check-group label {
    display: flex; align-items: center; gap: 5px; cursor: pointer; margin: 0;
  }
  input[type="radio"], input[type="checkbox"] { cursor: pointer; }
  button {
    background: var(--btn-bg);
    color: var(--btn-fg);
    border: none;
    border-radius: 2px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9em;
  }
  button:hover { background: var(--btn-hover); }
  button.secondary {
    background: var(--btn-sec-bg);
    color: var(--btn-sec-fg);
  }
  button.icon-btn {
    background: transparent;
    color: var(--desc);
    padding: 2px 6px;
    font-size: 1em;
  }
  button.icon-btn:hover { color: var(--error); }
  .token-list { display: flex; flex-direction: column; gap: 4px; }
  .token-row { display: flex; gap: 4px; align-items: center; }
  .token-row input { flex: 1; }
  .kv-table { width: 100%; border-collapse: collapse; }
  .kv-table th { text-align: left; font-size: 0.82em; color: var(--desc); font-weight: normal; padding: 0 4px 4px; }
  .kv-table td { padding: 2px 4px 2px 0; }
  .kv-table td input { width: 100%; }
  .kv-table .del-col { width: 28px; }
  .add-btn { margin-top: 6px; font-size: 0.85em; }
  .section { background: var(--section-bg); border: 1px solid var(--border); border-radius: 4px; padding: 12px 14px; margin-top: 8px; }
  .hidden { display: none !important; }
  .actions { display: flex; gap: 8px; margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--border); }
  .error-msg { color: var(--error); font-size: 0.85em; margin-top: 4px; display: none; }
  .required::after { content: " *"; color: var(--error); }
  details > summary { cursor: pointer; user-select: none; font-weight: 600; }
  details[open] > summary { margin-bottom: 8px; }
</style>
</head>
<body>
<h2 id="page-title">Config Editor</h2>

<!-- ─── Basic info ─── -->
<div class="field">
  <label class="required" for="cfg-name">Name</label>
  <input type="text" id="cfg-name" placeholder="e.g. Run (debug)">
  <div class="error-msg" id="err-name">Name is required.</div>
</div>

<div class="field">
  <label>Build System</label>
  <div class="radio-group">
    <label><input type="radio" name="buildSystem" value="cmake" checked> CMake</label>
    <label><input type="radio" name="buildSystem" value="bazel"> Bazel</label>
    <label><input type="radio" name="buildSystem" value="manual"> Manual</label>
  </div>
</div>

<div class="field">
  <label for="cfg-group">Group</label>
  <select id="cfg-group">
    <option value="">(Ungrouped)</option>
  </select>
</div>

<!-- ─── Target ─── -->
<div class="field" id="section-target">
  <label for="cfg-target">Target Name</label>
  <input type="text" id="cfg-target" placeholder="e.g. order_book_main  or  //src/app:server">
  <div class="desc">CMake target name or Bazel label (//pkg:target). Leave empty for manual.</div>
</div>

<div class="field" id="section-build-config">
  <label for="cfg-build-config">Build Config / Preset</label>
  <input type="text" id="cfg-build-config" placeholder="e.g. debug, release, opt">
  <div class="desc">CMake preset name or Bazel --config flag.</div>
</div>

<div class="field">
  <label for="cfg-kind">Target Kind</label>
  <select id="cfg-kind">
    <option value="executable">executable</option>
    <option value="test">test</option>
    <option value="benchmark">benchmark</option>
  </select>
</div>

<!-- ─── Run mode ─── -->
<div class="field">
  <label>Run Mode</label>
  <div class="radio-group">
    <label><input type="radio" name="runMode" value="run" checked> Run</label>
    <label><input type="radio" name="runMode" value="debug"> Debug</label>
    <label><input type="radio" name="runMode" value="test"> Test</label>
    <label><input type="radio" name="runMode" value="analyze"> Analyze</label>
    <label><input type="radio" name="runMode" value="coverage"> Coverage</label>
  </div>
</div>

<!-- ─── Binary override ─── -->
<div class="field">
  <label for="cfg-binary-override">Binary Override <span class="desc" style="font-weight:normal">(optional — bypasses build system)</span></label>
  <input type="text" id="cfg-binary-override" placeholder="e.g. /opt/vendor/app  or  \${workspaceFolder}/bin/app">
  <div class="desc" id="binary-override-hint" class="hidden">Required for Manual build system.</div>
  <div class="error-msg" id="err-binary">Binary Override is required for Manual build system.</div>
</div>

<!-- ─── Args ─── -->
<h2>Arguments</h2>
<div class="token-list" id="args-list"></div>
<button class="add-btn secondary" onclick="addArg()">+ Add Argument</button>

<!-- ─── Environment ─── -->
<h2>Environment Variables</h2>
<table class="kv-table" id="env-table">
  <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
  <tbody id="env-body"></tbody>
</table>
<button class="add-btn secondary" onclick="addEnvRow()">+ Add Variable</button>

<!-- ─── Execution ─── -->
<h2>Execution</h2>
<div class="field">
  <label for="cfg-cwd">Working Directory</label>
  <input type="text" id="cfg-cwd" placeholder="\${workspaceFolder}">
</div>

<div class="field">
  <label>Source Scripts <span class="desc" style="font-weight:normal">(sourced before execution)</span></label>
  <div class="token-list" id="scripts-list"></div>
  <button class="add-btn secondary" onclick="addScript()">+ Add Script</button>
</div>

<div class="field check-group">
  <label><input type="checkbox" id="cfg-prebuild" checked> Build before run</label>
</div>

<div class="field">
  <label>Terminal Mode</label>
  <div class="radio-group">
    <label><input type="radio" name="terminal" value="dedicated" checked> Dedicated (new terminal each run)</label>
    <label><input type="radio" name="terminal" value="shared"> Shared (one terminal, reused)</label>
    <label><input type="radio" name="terminal" value="reuse"> Reuse Last</label>
  </div>
</div>

<!-- ─── Analysis Config ─── -->
<div id="section-analyze" class="hidden">
  <h2>Analysis Config</h2>
  <div class="section">
    <div class="field">
      <label for="cfg-tool">Analysis Tool</label>
      <select id="cfg-tool" onchange="onToolChange()">
        <option value="valgrind">valgrind</option>
        <option value="perf">perf</option>
        <option value="gprof">gprof</option>
        <option value="heaptrack">heaptrack</option>
        <option value="strace">strace</option>
        <option value="ltrace">ltrace</option>
        <option value="custom">custom</option>
      </select>
    </div>
    <div class="field" id="section-subtool">
      <label for="cfg-subtool">Sub-tool</label>
      <select id="cfg-subtool"></select>
    </div>
    <div class="field" id="section-custom-cmd" style="display:none">
      <label for="cfg-custom-cmd">Custom Command Template</label>
      <input type="text" id="cfg-custom-cmd" placeholder="my-tool {binary} {args} > {outputDir}/out.txt">
      <div class="desc">Placeholders: {binary}, {args}, {env}, {outputDir}, {cwd}</div>
    </div>
    <div class="field">
      <label>Extra Tool Args</label>
      <div class="token-list" id="tool-args-list"></div>
      <button class="add-btn secondary" onclick="addToolArg()">+ Add Arg</button>
    </div>
    <div class="field">
      <label for="cfg-output-dir">Output Directory</label>
      <input type="text" id="cfg-output-dir" placeholder="\${workspaceFolder}/out/analysis/\${date}">
    </div>
    <div class="field">
      <label for="cfg-post-process">Post-Process Command</label>
      <input type="text" id="cfg-post-process" placeholder="e.g. kcachegrind \${outputDir}/callgrind.out">
    </div>
    <div class="field check-group">
      <label><input type="checkbox" id="cfg-open-report" checked> Auto-open report when done</label>
    </div>
  </div>
</div>

<!-- ─── Macros ─── -->
<h2>Config-Level Macros</h2>
<div class="desc" style="margin-bottom:8px">Macros defined here override file/project macros for this config only.</div>
<table class="kv-table" id="macros-table">
  <thead><tr><th>Name</th><th>Value</th><th></th></tr></thead>
  <tbody id="macros-body"></tbody>
</table>
<button class="add-btn secondary" onclick="addMacroRow()">+ Add Macro</button>

<!-- ─── Actions ─── -->
<div class="actions">
  <button onclick="handleSave()">Save</button>
  <button class="secondary" onclick="handleCancel()">Cancel</button>
</div>

<script>
const vscode = acquireVsCodeApi();
let _mode = 'create';
let _configId = null;
let _groups = [];
let _targetGroupId = null;

// Tool sub-tool options
const SUBTOOLS = {
  valgrind: ['memcheck', 'callgrind', 'massif', 'helgrind', 'drd'],
  perf: ['record', 'stat', 'annotate'],
  gprof: [],
  heaptrack: [],
  strace: [],
  ltrace: [],
  custom: [],
};

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.command === 'init') {
    _mode = msg.mode;
    _groups = msg.groups || [];
    _targetGroupId = msg.targetGroupId || null;
    populateGroupDropdown(_groups, msg.targetGroupId);
    if (msg.config) loadConfig(msg.config);
    document.getElementById('page-title').textContent =
      _mode === 'create' ? 'New Run Config' : 'Edit Config';
  }
});

// Tell the extension we're ready
vscode.postMessage({ command: 'ready' });

function populateGroupDropdown(groups, selectedId) {
  const sel = document.getElementById('cfg-group');
  sel.innerHTML = '<option value="">(Ungrouped)</option>';
  for (const g of groups) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    if (g.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function loadConfig(cfg) {
  _configId = cfg.id;
  setVal('cfg-name', cfg.name || '');
  setRadio('buildSystem', cfg.buildSystem || 'cmake');
  setVal('cfg-target', cfg.target || '');
  setVal('cfg-build-config', cfg.buildConfig || '');
  setSelectVal('cfg-kind', cfg.kind || 'executable');
  setRadio('runMode', cfg.runMode || 'run');
  setVal('cfg-binary-override', cfg.binaryOverride || '');
  setVal('cfg-cwd', cfg.cwd || '');
  document.getElementById('cfg-prebuild').checked = cfg.preBuild !== false;
  setRadio('terminal', cfg.terminal || 'dedicated');

  // Args
  clearList('args-list');
  for (const a of (cfg.args || [])) addArg(a);

  // Env
  clearEnv('env-body');
  for (const [k, v] of Object.entries(cfg.env || {})) addEnvRow(k, v);

  // Source scripts
  clearList('scripts-list');
  for (const s of (cfg.sourceScripts || [])) addScript(s);

  // Analyze config
  if (cfg.analyzeConfig) {
    const ac = cfg.analyzeConfig;
    setSelectVal('cfg-tool', ac.tool || 'valgrind');
    onToolChange();
    setSelectVal('cfg-subtool', ac.subTool || '');
    setVal('cfg-output-dir', ac.outputDir || '');
    setVal('cfg-post-process', ac.postProcess || '');
    document.getElementById('cfg-open-report').checked = ac.openReport !== false;
    setVal('cfg-custom-cmd', ac.customCommand || '');
    clearList('tool-args-list');
    for (const a of (ac.toolArgs || [])) addToolArg(a);
  }

  // Macros
  clearEnv('macros-body');
  for (const [k, v] of Object.entries(cfg.macros || {})) addMacroRow(k, v);

  // Update conditional sections
  onRunModeChange();
  onBuildSystemChange();
}

// ── Value helpers ──
function setVal(id, v) { document.getElementById(id).value = v; }
function setSelectVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v;
}
function setRadio(name, v) {
  const el = document.querySelector('input[name="' + name + '"][value="' + v + '"]');
  if (el) el.checked = true;
}
function getRadio(name) {
  const el = document.querySelector('input[name="' + name + '"]:checked');
  return el ? el.value : '';
}
function clearList(id) { document.getElementById(id).innerHTML = ''; }
function clearEnv(id) { document.getElementById(id).innerHTML = ''; }

// ── Token list ──
function makeTokenRow(value, onDelete) {
  const row = document.createElement('div');
  row.className = 'token-row';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = value;
  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.textContent = '✕';
  btn.onclick = onDelete;
  row.appendChild(inp);
  row.appendChild(btn);
  return row;
}

function addArg(v) {
  const list = document.getElementById('args-list');
  const row = makeTokenRow(v || '', () => row.remove());
  list.appendChild(row);
}

function addScript(v) {
  const list = document.getElementById('scripts-list');
  const row = makeTokenRow(v || '', () => row.remove());
  list.appendChild(row);
}

function addToolArg(v) {
  const list = document.getElementById('tool-args-list');
  const row = makeTokenRow(v || '', () => row.remove());
  list.appendChild(row);
}

// ── Key-value table ──
function makeKvRow(k, v, tbody) {
  const tr = document.createElement('tr');
  const tdKey = document.createElement('td');
  const tdVal = document.createElement('td');
  const tdDel = document.createElement('td');
  tdDel.className = 'del-col';

  const kInp = document.createElement('input'); kInp.type = 'text'; kInp.value = k; kInp.placeholder = 'KEY';
  const vInp = document.createElement('input'); vInp.type = 'text'; vInp.value = v; vInp.placeholder = 'value';
  const btn = document.createElement('button');
  btn.className = 'icon-btn'; btn.textContent = '✕'; btn.onclick = () => tr.remove();

  tdKey.appendChild(kInp); tdVal.appendChild(vInp); tdDel.appendChild(btn);
  tr.appendChild(tdKey); tr.appendChild(tdVal); tr.appendChild(tdDel);
  tbody.appendChild(tr);
}

function addEnvRow(k, v) {
  makeKvRow(k || '', v || '', document.getElementById('env-body'));
}

function addMacroRow(k, v) {
  makeKvRow(k || '', v || '', document.getElementById('macros-body'));
}

// ── Conditional sections ──
document.querySelectorAll('input[name="runMode"]').forEach(r => r.addEventListener('change', onRunModeChange));
document.querySelectorAll('input[name="buildSystem"]').forEach(r => r.addEventListener('change', onBuildSystemChange));

function onRunModeChange() {
  const mode = getRadio('runMode');
  document.getElementById('section-analyze').classList.toggle('hidden', mode !== 'analyze');
  if (mode === 'analyze') onToolChange();
}

function onBuildSystemChange() {
  const sys = getRadio('buildSystem');
  const hint = document.getElementById('binary-override-hint');
  if (hint) hint.classList.toggle('hidden', sys !== 'manual');
}

function onToolChange() {
  const tool = document.getElementById('cfg-tool').value;
  const subs = SUBTOOLS[tool] || [];
  const sel = document.getElementById('cfg-subtool');
  const currentVal = sel.value;
  sel.innerHTML = '';
  for (const s of subs) {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    if (s === currentVal) opt.selected = true;
    sel.appendChild(opt);
  }
  document.getElementById('section-subtool').style.display = subs.length ? '' : 'none';
  document.getElementById('section-custom-cmd').style.display = tool === 'custom' ? '' : 'none';
}

// ── Collect form data ──
function collectConfig() {
  const name = document.getElementById('cfg-name').value.trim();
  if (!name) {
    document.getElementById('err-name').style.display = 'block';
    document.getElementById('cfg-name').focus();
    return null;
  }
  document.getElementById('err-name').style.display = 'none';

  const buildSystem = getRadio('buildSystem');
  const binaryOverride = document.getElementById('cfg-binary-override').value.trim();

  if (buildSystem === 'manual' && !binaryOverride) {
    document.getElementById('err-binary').style.display = 'block';
    document.getElementById('cfg-binary-override').focus();
    return null;
  }
  document.getElementById('err-binary').style.display = 'none';

  // Collect args
  const args = [...document.querySelectorAll('#args-list .token-row input')]
    .map(i => i.value.trim()).filter(Boolean);

  // Collect env
  const env = {};
  document.querySelectorAll('#env-body tr').forEach(tr => {
    const [k, v] = tr.querySelectorAll('input');
    if (k && k.value.trim()) env[k.value.trim()] = v ? v.value : '';
  });

  // Collect scripts
  const sourceScripts = [...document.querySelectorAll('#scripts-list .token-row input')]
    .map(i => i.value.trim()).filter(Boolean);

  // Collect macros
  const macros = {};
  document.querySelectorAll('#macros-body tr').forEach(tr => {
    const [k, v] = tr.querySelectorAll('input');
    if (k && k.value.trim()) macros[k.value.trim()] = v ? v.value : '';
  });

  const cfg = {
    id: _configId || ('cfg-' + Date.now().toString(36)),
    name,
    buildSystem,
    target: document.getElementById('cfg-target').value.trim() || undefined,
    kind: document.getElementById('cfg-kind').value || 'executable',
    buildConfig: document.getElementById('cfg-build-config').value.trim() || undefined,
    runMode: getRadio('runMode'),
    binaryOverride: binaryOverride || undefined,
    args: args.length ? args : undefined,
    env: Object.keys(env).length ? env : undefined,
    cwd: document.getElementById('cfg-cwd').value.trim() || undefined,
    sourceScripts: sourceScripts.length ? sourceScripts : undefined,
    preBuild: document.getElementById('cfg-prebuild').checked,
    terminal: getRadio('terminal') || 'dedicated',
    macros: Object.keys(macros).length ? macros : undefined,
  };

  // Analyze config
  const runMode = cfg.runMode;
  if (runMode === 'analyze') {
    const tool = document.getElementById('cfg-tool').value;
    const subTool = document.getElementById('cfg-subtool').value || undefined;
    const toolArgs = [...document.querySelectorAll('#tool-args-list .token-row input')]
      .map(i => i.value.trim()).filter(Boolean);
    cfg.analyzeConfig = {
      tool,
      subTool,
      toolArgs: toolArgs.length ? toolArgs : undefined,
      outputDir: document.getElementById('cfg-output-dir').value.trim() || undefined,
      postProcess: document.getElementById('cfg-post-process').value.trim() || undefined,
      openReport: document.getElementById('cfg-open-report').checked,
      customCommand: tool === 'custom'
        ? (document.getElementById('cfg-custom-cmd').value.trim() || undefined)
        : undefined,
    };
  }

  return cfg;
}

function handleSave() {
  const cfg = collectConfig();
  if (!cfg) return;
  const groupId = document.getElementById('cfg-group').value || undefined;
  vscode.postMessage({ command: 'save', config: cfg, groupId });
}

function handleCancel() {
  vscode.postMessage({ command: 'cancel' });
}
</script>
</body>
</html>`;
  }
}
