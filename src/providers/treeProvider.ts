/**
 * TreeDataProvider for the "Target Run Manager" sidebar view.
 * Shows groups containing run configs with inline action buttons.
 */

import * as vscode from 'vscode';
import type { WorkspaceModel, Group, RunConfig, CompoundConfig } from '../model/config';

/** Union type for tree node items */
export type TreeNode = GroupNode | ConfigNode | UngroupedHeaderNode | CompoundNode;

export class GroupNode extends vscode.TreeItem {
  readonly type = 'group' as const;
  constructor(public readonly group: Group) {
    super(group.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'group';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.id = `group:${group.id}`;
    this.tooltip = `Group: ${group.name} (${group.configs.length} config${group.configs.length !== 1 ? 's' : ''})`;
  }
}

export class UngroupedHeaderNode extends vscode.TreeItem {
  readonly type = 'ungroupedHeader' as const;
  constructor() {
    super('Ungrouped', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'ungroupedHeader';
    this.iconPath = new vscode.ThemeIcon('package');
    this.id = 'ungrouped';
  }
}

export class CompoundNode extends vscode.TreeItem {
  readonly type = 'compound' as const;
  constructor(public readonly compound: CompoundConfig) {
    super(compound.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'compound';
    this.iconPath = new vscode.ThemeIcon(
      compound.order === 'parallel' ? 'split-horizontal' : 'list-ordered',
    );
    this.id = `compound:${compound.id}`;
    const modeLabel = compound.tmux ? 'tmux' : compound.order;
    this.tooltip = `${compound.name} (${modeLabel}) — ${compound.configs.length} config(s)`;
    this.description = modeLabel;
  }
}

export class ConfigNode extends vscode.TreeItem {
  readonly type = 'config' as const;
  constructor(
    public readonly config: RunConfig,
    public readonly groupId?: string,
  ) {
    super(config.name ?? config.id, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'runConfig';
    this.id = `config:${config.id}`;
    this.description = buildDescription(config);
    this.iconPath = getConfigIcon(config);
    this.tooltip = buildTooltip(config);

    // Primary click action — set as active
    this.command = {
      command: 'targetRunManager.setActive',
      title: 'Set Active',
      arguments: [config],
    };
  }
}

export class TargetRunManagerTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private model: WorkspaceModel | undefined;

  setModel(model: WorkspaceModel): void {
    this.model = model;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.model) {
      return [];
    }

    // Root level — return groups + ungrouped header
    if (!element) {
      const roots: TreeNode[] = [];

      for (const group of this.model.groups) {
        if (group.configs.length > 0) {
          roots.push(new GroupNode(group));
        }
      }

      if (this.model.ungrouped.length > 0) {
        roots.push(new UngroupedHeaderNode());
      }

      for (const compound of this.model.compounds) {
        roots.push(new CompoundNode(compound));
      }

      return roots;
    }

    // Group children — return config nodes
    if (element instanceof GroupNode) {
      return element.group.configs.map(
        (config) => new ConfigNode(config, element.group.id),
      );
    }

    // Ungrouped children
    if (element instanceof UngroupedHeaderNode) {
      return this.model.ungrouped.map((config) => new ConfigNode(config));
    }

    return [];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

function buildDescription(config: RunConfig): string {
  const parts: string[] = [];
  if (config.buildSystem && config.buildSystem !== 'cmake') {
    parts.push(config.buildSystem.toUpperCase());
  }
  if (config.buildConfig) {
    parts.push(`[${config.buildConfig}]`);
  }
  if (config.target) {
    parts.push(config.target);
  }
  return parts.join(' ');
}

function getConfigIcon(config: RunConfig): vscode.ThemeIcon {
  switch (config.runMode) {
    case 'test':
      return new vscode.ThemeIcon('beaker');
    case 'debug':
      return new vscode.ThemeIcon('bug');
    case 'analyze':
      return new vscode.ThemeIcon('microscope');
    case 'coverage':
      return new vscode.ThemeIcon('graph');
    default:
      return new vscode.ThemeIcon('play');
  }
}

function buildTooltip(config: RunConfig): string {
  const lines: string[] = [config.name ?? config.id];
  if (config.buildSystem) {
    lines.push(`Build system: ${config.buildSystem}`);
  }
  if (config.target) {
    lines.push(`Target: ${config.target}`);
  }
  if (config.buildConfig) {
    lines.push(`Build config: ${config.buildConfig}`);
  }
  if (config.runMode) {
    lines.push(`Mode: ${config.runMode}`);
  }
  if (config.args?.length) {
    lines.push(`Args: ${config.args.join(' ')}`);
  }
  return lines.join('\n');
}
