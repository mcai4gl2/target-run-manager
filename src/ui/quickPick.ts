/**
 * Quick-pick UI for switching the active config.
 */

import * as vscode from 'vscode';
import type { WorkspaceModel, RunConfig } from '../model/config';

export interface QuickPickConfig {
  label: string;
  description: string;
  config: RunConfig;
  groupName?: string;
}

/**
 * Show a quick-pick to select an active config from all available configs.
 * Returns the selected RunConfig or undefined if cancelled.
 */
export async function showConfigQuickPick(
  model: WorkspaceModel,
): Promise<RunConfig | undefined> {
  const items: (vscode.QuickPickItem & { config: RunConfig })[] = [];

  // Add grouped configs
  for (const group of model.groups) {
    if (group.configs.length === 0) {
      continue;
    }

    // Separator
    items.push({
      label: group.name,
      kind: vscode.QuickPickItemKind.Separator,
      config: undefined as unknown as RunConfig,
    });

    for (const config of group.configs) {
      items.push({
        label: `$(play) ${config.name}`,
        description: describeConfig(config),
        config,
      });
    }
  }

  // Add ungrouped
  if (model.ungrouped.length > 0) {
    items.push({
      label: 'Ungrouped',
      kind: vscode.QuickPickItemKind.Separator,
      config: undefined as unknown as RunConfig,
    });
    for (const config of model.ungrouped) {
      items.push({
        label: `$(play) ${config.name}`,
        description: describeConfig(config),
        config,
      });
    }
  }

  const selected = await vscode.window.showQuickPick(
    items.filter((i) => i.config !== undefined),
    { placeHolder: 'Select active run config...' },
  );

  return selected?.config;
}

function describeConfig(config: RunConfig): string {
  const parts: string[] = [];
  if (config.buildSystem) {
    parts.push(config.buildSystem.toUpperCase());
  }
  if (config.target) {
    parts.push(config.target);
  }
  if (config.buildConfig) {
    parts.push(`[${config.buildConfig}]`);
  }
  if (config.runMode && config.runMode !== 'run') {
    parts.push(config.runMode);
  }
  return parts.join(' · ');
}
