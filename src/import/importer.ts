/**
 * Orchestrates the "import from build file" flow:
 *   1. Parse the clicked file for targets.
 *   2. Show multi-select quick-pick (already-managed targets pre-selected but labelled).
 *   3. Show group selection (ungrouped / existing group / create new group).
 *   4. Save each new config via storage.saveConfig().
 */

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { parseCMakeLists } from './cmake';
import { parseBuildFile } from './bazel';
import type { ParsedTarget } from './types';
import type { WorkspaceModel, RunConfig } from '../model/config';
import type { ConfigStorage } from '../model/storage';

const CREATE_NEW = '__create_new__';
const UNGROUPED = '__ungrouped__';

/**
 * Main entry point for the context-menu import command.
 *
 * @param fileUri       The clicked file URI.
 * @param model         Current workspace model (used to detect already-managed targets).
 * @param storage       Config storage instance for saving new configs.
 * @param _context      VS Code extension context (reserved for future use).
 */
export async function importFromFile(
  fileUri: vscode.Uri,
  model: WorkspaceModel,
  storage: ConfigStorage,
  _context: vscode.ExtensionContext,
): Promise<void> {
  const filePath = fileUri.fsPath;
  const fileName = path.basename(filePath);
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(filePath);

  // Read the build file
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    vscode.window.showErrorMessage(`[Target Run Manager] Could not read ${fileName}`);
    return;
  }

  // Parse targets
  let targets: ParsedTarget[];
  if (fileName === 'CMakeLists.txt') {
    targets = parseCMakeLists(content);
  } else if (fileName === 'BUILD' || fileName === 'BUILD.bazel') {
    targets = parseBuildFile(content, filePath, workspaceRoot);
  } else {
    return;
  }

  if (targets.length === 0) {
    vscode.window.showInformationMessage(
      `[Target Run Manager] No targets found in ${fileName}`,
    );
    return;
  }

  // Determine which targets are already managed (by target label)
  const allManagedConfigs = [
    ...model.ungrouped,
    ...model.groups.flatMap((g) => g.configs),
  ];
  const managedLabels = new Set(
    allManagedConfigs.map((c) => c.target).filter((t): t is string => Boolean(t)),
  );

  const alreadyManaged = targets.filter((t) => managedLabels.has(t.label));
  const notManaged = targets.filter((t) => !managedLabels.has(t.label));

  // ── Step 1: Multi-select quick-pick ─────────────────────────────────────────
  type TargetItem = vscode.QuickPickItem & { target: ParsedTarget };

  const pickItems: TargetItem[] = [
    ...notManaged.map((t) => ({
      label: t.name,
      description: t.kind,
      picked: false,
      target: t,
    })),
    ...alreadyManaged.map((t) => ({
      label: t.name,
      description: `${t.kind}  •  already in manager`,
      picked: true,
      target: t,
    })),
  ];

  const title =
    `Select targets to add  ` +
    `(${fileName} — ${targets.length} found, ${alreadyManaged.length} already managed)`;

  const selected = await vscode.window.showQuickPick(pickItems, {
    title,
    canPickMany: true,
    placeHolder: 'Select targets to import…',
  });

  if (!selected || selected.length === 0) { return; }

  // Skip targets that are already managed (they were visible for reference only)
  const toImport = selected.filter((item) => !managedLabels.has(item.target.label));
  if (toImport.length === 0) {
    vscode.window.showInformationMessage(
      '[Target Run Manager] All selected targets are already in the manager.',
    );
    return;
  }

  // ── Step 2: Group selection ──────────────────────────────────────────────────
  const groupItems: vscode.QuickPickItem[] = [
    { label: '$(package) (Ungrouped)', description: '', detail: UNGROUPED },
    ...model.groups.map((g) => ({
      label: `$(folder) ${g.name}`,
      description: `${g.configs.length} config(s)`,
      detail: g.id,
    })),
    { label: '$(add) Create new group…', description: '', detail: CREATE_NEW },
  ];

  const groupPick = await vscode.window.showQuickPick(groupItems, {
    title: 'Add to group…',
    placeHolder: 'Select a group…',
  });

  if (!groupPick) { return; }

  let targetGroupId: string | undefined;

  if (groupPick.detail === CREATE_NEW) {
    const groupName = await vscode.window.showInputBox({
      prompt: 'New group name',
      placeHolder: 'e.g. Order Book',
      validateInput: (v) => (v.trim() ? null : 'Name cannot be empty'),
    });
    if (!groupName) { return; }
    const id = `grp-${groupName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now().toString(36)}`;
    storage.addGroup(id, groupName.trim());
    targetGroupId = id;
  } else if (groupPick.detail === UNGROUPED) {
    targetGroupId = undefined;
  } else {
    targetGroupId = groupPick.detail;
  }

  // ── Step 3: Save one config per selected target ──────────────────────────────
  for (const item of toImport) {
    const t = item.target;
    const ts = Date.now().toString(36);
    const safeName = t.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const id = `cfg-${safeName}-${ts}`;

    const config: RunConfig = {
      id,
      name: t.name,
      buildSystem: t.buildSystem,
      target: t.label,
      kind: t.kind,
      runMode: t.kind === 'test' ? 'test' : 'run',
      preBuild: true,
      terminal: 'dedicated',
    };

    storage.saveConfig(config, targetGroupId, model);
  }

  vscode.window.showInformationMessage(
    `[Target Run Manager] Added ${toImport.length} target(s).`,
  );
}
