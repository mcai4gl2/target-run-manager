/**
 * VS Code extension entry point for Target Run Manager.
 * Registers all providers, commands, and initializes the config loader.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { discoverConfigFiles } from './loader/discovery';
import { parseFile } from './loader/parser';
import { mergeFiles } from './loader/merger';
import { validateModel } from './loader/validator';
import { watchConfigFiles } from './loader/watcher';
import { TargetRunManagerTreeProvider, ConfigNode } from './providers/treeProvider';
import { Runner } from './runner/runner';
import { StatusBarManager } from './ui/statusBar';
import { showConfigQuickPick } from './ui/quickPick';
import type { WorkspaceModel, RunConfig } from './model/config';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Target Run Manager');
  context.subscriptions.push(outputChannel);

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    // No workspace open — extension is registered but idle
    return;
  }

  const treeProvider = new TargetRunManagerTreeProvider();
  const runner = new Runner(workspaceRoot, outputChannel);
  const statusBar = new StatusBarManager();

  context.subscriptions.push(treeProvider, statusBar);

  // Register the tree view
  const treeView = vscode.window.createTreeView('targetRunManagerView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // ---- Load configs ----
  let currentModel: WorkspaceModel | undefined;

  function loadConfigs(): void {
    const files = discoverConfigFiles(workspaceRoot!);
    if (files.length === 0) {
      outputChannel.appendLine('[Target Run Manager] No config files found.');
      treeProvider.setModel({ groups: [], ungrouped: [], settings: {}, fileMacros: new Map() });
      runner.setModel({ groups: [], ungrouped: [], settings: {}, fileMacros: new Map() });
      return;
    }

    const rawFiles = files.map((f) => {
      const result = parseFile(f);
      for (const err of result.errors) {
        outputChannel.appendLine(`[Error] ${err.file}: ${err.message}`);
      }
      return result.raw;
    }).filter((r) => r !== null);

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
    outputChannel.appendLine(
      `[Target Run Manager] Loaded ${files.length} config file(s). ` +
      `${model.groups.length} groups, ` +
      `${model.groups.reduce((n, g) => n + g.configs.length, 0) + model.ungrouped.length} configs.`,
    );
  }

  loadConfigs();

  // Watch for changes
  const watcher = watchConfigFiles(workspaceRoot, () => {
    outputChannel.appendLine('[Target Run Manager] Config files changed — reloading...');
    loadConfigs();
  });
  context.subscriptions.push({ dispose: () => watcher.dispose() });

  // ---- Commands ----

  context.subscriptions.push(
    vscode.commands.registerCommand('targetRunManager.refresh', () => {
      loadConfigs();
    }),

    vscode.commands.registerCommand('targetRunManager.run', async (node: ConfigNode) => {
      const config = getConfigFromNode(node, currentModel);
      if (config) {
        await runner.runConfig(config);
      }
    }),

    vscode.commands.registerCommand('targetRunManager.build', async (node: ConfigNode) => {
      const config = getConfigFromNode(node, currentModel);
      if (config) {
        await runner.buildConfig(config);
      }
    }),

    vscode.commands.registerCommand('targetRunManager.debug', async (node: ConfigNode) => {
      const config = getConfigFromNode(node, currentModel);
      if (config) {
        const debugConfig = { ...config, runMode: 'debug' as const };
        await runner.runConfig(debugConfig);
      }
    }),

    vscode.commands.registerCommand('targetRunManager.setActive', (configOrNode: RunConfig | ConfigNode) => {
      const config = configOrNode instanceof ConfigNode ? configOrNode.config : configOrNode;
      statusBar.setActiveConfig(config);
    }),

    vscode.commands.registerCommand('targetRunManager.runActive', async () => {
      const active = statusBar.getActiveConfig();
      if (!active) {
        vscode.window.showWarningMessage('[Target Run Manager] No active config selected. Use Ctrl+Shift+R to pick one.');
        return;
      }
      await runner.runConfig(active);
    }),

    vscode.commands.registerCommand('targetRunManager.debugActive', async () => {
      const active = statusBar.getActiveConfig();
      if (!active) {
        vscode.window.showWarningMessage('[Target Run Manager] No active config selected.');
        return;
      }
      await runner.runConfig({ ...active, runMode: 'debug' });
    }),

    vscode.commands.registerCommand('targetRunManager.buildActive', async () => {
      const active = statusBar.getActiveConfig();
      if (!active) {
        vscode.window.showWarningMessage('[Target Run Manager] No active config selected.');
        return;
      }
      await runner.buildConfig(active);
    }),

    vscode.commands.registerCommand('targetRunManager.rerunLast', async () => {
      const active = statusBar.getActiveConfig();
      if (active) {
        await runner.runConfig(active);
      } else {
        vscode.window.showWarningMessage('[Target Run Manager] No config to re-run.');
      }
    }),

    vscode.commands.registerCommand('targetRunManager.switchActive', async () => {
      if (!currentModel) {
        return;
      }
      const selected = await showConfigQuickPick(currentModel);
      if (selected) {
        statusBar.setActiveConfig(selected);
      }
    }),

    vscode.commands.registerCommand('targetRunManager.addGroup', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter group name',
        placeHolder: 'My Group',
      });
      if (name) {
        vscode.window.showInformationMessage(
          `[Target Run Manager] Group creation UI coming in Phase 2. ` +
          `Add groups directly to your .vscode/target-manager/ YAML files.`,
        );
      }
    }),

    vscode.commands.registerCommand('targetRunManager.addConfig', async () => {
      vscode.window.showInformationMessage(
        '[Target Run Manager] Config editor coming in Phase 2. ' +
        'Add configs directly to your .vscode/target-manager/ YAML files.',
      );
    }),

    vscode.commands.registerCommand('targetRunManager.editConfig', async (node: ConfigNode) => {
      if (node?.config?._sourceFile) {
        const doc = await vscode.workspace.openTextDocument(node.config._sourceFile);
        await vscode.window.showTextDocument(doc);
      }
    }),

    vscode.commands.registerCommand('targetRunManager.deleteConfig', async (node: ConfigNode) => {
      if (!node?.config) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Delete config "${node.config.name}"?`,
        { modal: true },
        'Delete',
      );
      if (confirm === 'Delete' && node.config._sourceFile) {
        vscode.window.showInformationMessage(
          '[Target Run Manager] Config deletion UI coming in Phase 2. ' +
          'Remove configs directly from your YAML files.',
        );
      }
    }),

    vscode.commands.registerCommand('targetRunManager.cloneConfig', async (node: ConfigNode) => {
      if (!node?.config) {
        return;
      }
      vscode.window.showInformationMessage(
        '[Target Run Manager] Config cloning UI coming in Phase 2.',
      );
    }),
  );
}

export function deactivate(): void {
  // Nothing special needed — all disposables handled via context.subscriptions
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getConfigFromNode(
  node: ConfigNode,
  model: WorkspaceModel | undefined,
): RunConfig | undefined {
  if (!model) {
    return undefined;
  }
  if (node?.config) {
    return node.config;
  }
  return undefined;
}
