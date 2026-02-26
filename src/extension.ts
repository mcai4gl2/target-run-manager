/**
 * VS Code extension entry point for Target Run Manager.
 * Registers all providers, commands, and initializes the config loader.
 */

import * as vscode from 'vscode';
import { discoverConfigFiles } from './loader/discovery';
import { parseFile } from './loader/parser';
import { mergeFiles } from './loader/merger';
import { validateModel } from './loader/validator';
import { watchConfigFiles } from './loader/watcher';
import { TargetRunManagerTreeProvider, ConfigNode, GroupNode } from './providers/treeProvider';
import { Runner } from './runner/runner';
import { StatusBarManager } from './ui/statusBar';
import { showConfigQuickPick } from './ui/quickPick';
import { ConfigEditorPanel } from './ui/configEditor';
import { ConfigStorage } from './model/storage';
import type { WorkspaceModel, RunConfig } from './model/config';
import { importFromFile } from './import/importer';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Target Run Manager');
  context.subscriptions.push(outputChannel);

  const workspaceRoot = getWorkspaceRoot();

  // ---- Mutable state — populated during workspace initialization below ----
  let currentModel: WorkspaceModel | undefined;
  let treeProvider: TargetRunManagerTreeProvider | undefined;
  let runner: Runner | undefined;
  let statusBar: StatusBarManager | undefined;
  let storage: ConfigStorage | undefined;

  function loadConfigs(): void {
    if (!workspaceRoot || !treeProvider || !runner) { return; }

    const files = discoverConfigFiles(workspaceRoot);
    if (files.length === 0) {
      const empty: WorkspaceModel = { groups: [], ungrouped: [], compounds: [], settings: {}, fileMacros: new Map() };
      outputChannel.appendLine('[Target Run Manager] No config files found.');
      currentModel = empty;
      treeProvider.setModel(empty);
      runner.setModel(empty);
      return;
    }

    const rawFiles = files
      .map((f) => {
        const result = parseFile(f);
        for (const err of result.errors) {
          outputChannel.appendLine(`[Error] ${err.file}: ${err.message}`);
        }
        return result.raw;
      })
      .filter((r) => r !== null);

    const { model, warnings } = mergeFiles(rawFiles as NonNullable<typeof rawFiles[0]>[]);
    for (const w of warnings) {
      outputChannel.appendLine(`[Warning] ${w.message}`);
    }

    const issues = validateModel(model);
    for (const issue of issues) {
      outputChannel.appendLine(
        `[${issue.severity.toUpperCase()}] ${issue.configId ?? 'global'}: ${issue.message}`,
      );
    }

    currentModel = model;
    treeProvider.setModel(model);
    runner.setModel(model);

    const totalConfigs =
      model.groups.reduce((n, g) => n + g.configs.length, 0) + model.ungrouped.length;
    outputChannel.appendLine(
      `[Target Run Manager] Loaded ${files.length} file(s) — ` +
      `${model.groups.length} group(s), ${totalConfigs} config(s).`,
    );
  }

  // ---- Commands — registered unconditionally so they are always found ----

  context.subscriptions.push(

    // ── Refresh ──
    vscode.commands.registerCommand('targetRunManager.refresh', () => loadConfigs()),

    // ── Run / Build / Debug ──
    vscode.commands.registerCommand('targetRunManager.run', async (node: ConfigNode) => {
      const config = resolveConfig(node, currentModel);
      if (config && runner) { await runner.runConfig(config); }
    }),

    vscode.commands.registerCommand('targetRunManager.build', async (node: ConfigNode) => {
      const config = resolveConfig(node, currentModel);
      if (config && runner) { await runner.buildConfig(config); }
    }),

    vscode.commands.registerCommand('targetRunManager.debug', async (node: ConfigNode) => {
      const config = resolveConfig(node, currentModel);
      if (config && runner) { await runner.runConfig({ ...config, runMode: 'debug' }); }
    }),

    // ── Active config ──
    vscode.commands.registerCommand('targetRunManager.setActive', (arg: RunConfig | ConfigNode) => {
      if (!statusBar) { return; }
      const config = arg instanceof ConfigNode ? arg.config : arg;
      statusBar.setActiveConfig(config);
    }),

    vscode.commands.registerCommand('targetRunManager.runActive', async () => {
      if (!statusBar || !runner) { return; }
      const active = statusBar.getActiveConfig();
      if (!active) {
        vscode.window.showWarningMessage('[Target Run Manager] No active config. Use Ctrl+Shift+R to pick one.');
        return;
      }
      await runner.runConfig(active);
    }),

    vscode.commands.registerCommand('targetRunManager.debugActive', async () => {
      if (!statusBar || !runner) { return; }
      const active = statusBar.getActiveConfig();
      if (active) { await runner.runConfig({ ...active, runMode: 'debug' }); }
    }),

    vscode.commands.registerCommand('targetRunManager.buildActive', async () => {
      if (!statusBar || !runner) { return; }
      const active = statusBar.getActiveConfig();
      if (active) { await runner.buildConfig(active); }
    }),

    vscode.commands.registerCommand('targetRunManager.rerunLast', async () => {
      if (!statusBar || !runner) { return; }
      const active = statusBar.getActiveConfig();
      if (active) {
        await runner.runConfig(active);
      } else {
        vscode.window.showWarningMessage('[Target Run Manager] No config to re-run.');
      }
    }),

    vscode.commands.registerCommand('targetRunManager.switchActive', async () => {
      if (!currentModel || !statusBar) { return; }
      const selected = await showConfigQuickPick(currentModel);
      if (selected) { statusBar.setActiveConfig(selected); }
    }),

    // ── Add Group ──
    vscode.commands.registerCommand('targetRunManager.addGroup', async () => {
      if (!storage) { return; }
      const name = await vscode.window.showInputBox({
        prompt: 'Group name',
        placeHolder: 'e.g. Order Book',
        validateInput: (v) => v.trim() ? null : 'Name cannot be empty',
      });
      if (!name) { return; }
      const id = `grp-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now().toString(36)}`;
      storage.addGroup(id, name.trim());
      loadConfigs();
    }),

    // ── Rename Group ──
    vscode.commands.registerCommand('targetRunManager.renameGroup', async (node: GroupNode) => {
      if (!node?.group || !storage) { return; }
      const newName = await vscode.window.showInputBox({
        prompt: 'New group name',
        value: node.group.name,
        validateInput: (v) => v.trim() ? null : 'Name cannot be empty',
      });
      if (!newName || !currentModel) { return; }
      storage.renameGroup(node.group.id, newName.trim(), currentModel);
      loadConfigs();
    }),

    // ── Delete Group ──
    vscode.commands.registerCommand('targetRunManager.deleteGroup', async (node: GroupNode) => {
      if (!node?.group || !currentModel || !storage) { return; }
      const group = node.group;
      const hasConfigs = group.configs.length > 0;
      const label = hasConfigs
        ? `Delete group "${group.name}" and its ${group.configs.length} config(s)?`
        : `Delete empty group "${group.name}"?`;
      const choice = await vscode.window.showWarningMessage(label, { modal: true }, 'Delete');
      if (choice !== 'Delete') { return; }
      const ok = storage.deleteGroup(group.id, currentModel, true);
      if (!ok) {
        vscode.window.showErrorMessage(`[Target Run Manager] Could not delete group "${group.name}".`);
      } else {
        loadConfigs();
      }
    }),

    // ── Add Config ──
    vscode.commands.registerCommand('targetRunManager.addConfig', async (node?: GroupNode) => {
      if (!currentModel || !storage) { return; }
      ConfigEditorPanel.open(context, {
        mode: 'create',
        targetGroupId: node instanceof GroupNode ? node.group.id : undefined,
        model: currentModel,
        storage,
        onSaved: loadConfigs,
      });
    }),

    // ── Edit Config ──
    vscode.commands.registerCommand('targetRunManager.editConfig', async (node: ConfigNode) => {
      const config = resolveConfig(node, currentModel);
      if (!config || !currentModel || !storage) { return; }
      const groupId = currentModel.groups.find((g) =>
        g.configs.some((c) => c.id === config.id),
      )?.id;
      ConfigEditorPanel.open(context, {
        mode: 'edit',
        config,
        targetGroupId: groupId,
        model: currentModel,
        storage,
        onSaved: loadConfigs,
      });
    }),

    // ── Clone Config ──
    vscode.commands.registerCommand('targetRunManager.cloneConfig', async (node: ConfigNode) => {
      const config = resolveConfig(node, currentModel);
      if (!config || !currentModel || !storage) { return; }
      const cloned = storage.cloneConfig(config, currentModel);
      loadConfigs();
      vscode.window.showInformationMessage(
        `[Target Run Manager] Cloned "${config.name}" → "${cloned.name}"`,
      );
    }),

    // ── Delete Config ──
    vscode.commands.registerCommand('targetRunManager.deleteConfig', async (node: ConfigNode) => {
      const config = resolveConfig(node, currentModel);
      if (!config || !currentModel || !storage) { return; }
      const choice = await vscode.window.showWarningMessage(
        `Delete config "${config.name}"?`,
        { modal: true },
        'Delete',
      );
      if (choice !== 'Delete') { return; }
      storage.deleteConfig(config.id, currentModel);
      loadConfigs();
      vscode.window.showInformationMessage(
        `[Target Run Manager] Deleted "${config.name}".`,
      );
    }),

    // ── Import from file ──
    vscode.commands.registerCommand(
      'targetRunManager.importFromFile',
      async (uri?: vscode.Uri) => {
        const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!fileUri || !currentModel || !storage) { return; }
        await importFromFile(fileUri, currentModel, storage, context);
        loadConfigs();
      },
    ),

    // ── Move to Group ──
    vscode.commands.registerCommand('targetRunManager.moveToGroup', async (node: ConfigNode) => {
      const config = resolveConfig(node, currentModel);
      if (!config || !currentModel || !storage) { return; }

      const items: vscode.QuickPickItem[] = [
        { label: '$(package) (Ungrouped)', description: '', detail: 'ungrouped' },
        ...currentModel.groups.map((g) => ({
          label: `$(folder) ${g.name}`,
          description: `${g.configs.length} config(s)`,
          detail: g.id,
        })),
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Move to group...',
      });
      if (!selected) { return; }

      const targetGroupId = selected.detail === 'ungrouped' ? undefined : selected.detail;
      storage.moveConfigToGroup(config.id, targetGroupId, currentModel);
      loadConfigs();
    }),

  );

  // ---- Workspace initialization (skipped gracefully if no workspace folder) ----

  if (!workspaceRoot) {
    outputChannel.appendLine('[Target Run Manager] No workspace folder open — run features unavailable.');
    return;
  }

  treeProvider = new TargetRunManagerTreeProvider();
  runner = new Runner(workspaceRoot, outputChannel);
  statusBar = new StatusBarManager();
  storage = new ConfigStorage(workspaceRoot);

  context.subscriptions.push(treeProvider, statusBar);

  const treeView = vscode.window.createTreeView('targetRunManagerView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  loadConfigs();

  const watcher = watchConfigFiles(workspaceRoot, () => {
    outputChannel.appendLine('[Target Run Manager] Config files changed — reloading...');
    loadConfigs();
  });
  context.subscriptions.push({ dispose: () => watcher.dispose() });
}

export function deactivate(): void {
  // All disposables handled via context.subscriptions
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveConfig(
  node: ConfigNode | undefined,
  model: WorkspaceModel | undefined,
): RunConfig | undefined {
  if (!model || !node?.config) { return undefined; }
  return node.config;
}
