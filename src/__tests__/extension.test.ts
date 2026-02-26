/**
 * Tests that activate() always registers all commands — even with no workspace folder open.
 * This guards against regressions where early-return or initialization errors
 * prevent command registration, causing "command not found" in VS Code.
 */

// Mock heavy runtime dependencies so activate() can run in tests
jest.mock('../loader/discovery', () => ({
  discoverConfigFiles: jest.fn().mockReturnValue([]),
}));

jest.mock('../loader/watcher', () => ({
  watchConfigFiles: jest.fn().mockReturnValue({ dispose: jest.fn() }),
}));

jest.mock('../runner/runner', () => ({
  Runner: jest.fn().mockImplementation(() => ({
    setModel: jest.fn(),
    runConfig: jest.fn(),
    buildConfig: jest.fn(),
  })),
}));

jest.mock('../ui/statusBar', () => ({
  StatusBarManager: jest.fn().mockImplementation(() => ({
    setActiveConfig: jest.fn(),
    getActiveConfig: jest.fn().mockReturnValue(undefined),
    dispose: jest.fn(),
  })),
}));

jest.mock('../model/storage', () => ({
  ConfigStorage: jest.fn().mockImplementation(() => ({
    addGroup: jest.fn(),
    renameGroup: jest.fn(),
    deleteGroup: jest.fn().mockReturnValue(true),
    saveConfig: jest.fn(),
    cloneConfig: jest.fn().mockReturnValue({ name: 'clone' }),
    deleteConfig: jest.fn(),
    moveConfigToGroup: jest.fn(),
    getPrimaryFile: jest.fn().mockReturnValue('/workspace/.vscode/target-manager.yaml'),
  })),
}));

jest.mock('../providers/treeProvider', () => ({
  TargetRunManagerTreeProvider: jest.fn().mockImplementation(() => ({
    setModel: jest.fn(),
    getTreeItem: jest.fn(),
    getChildren: jest.fn().mockReturnValue([]),
    dispose: jest.fn(),
    onDidChangeTreeData: jest.fn(),
  })),
  ConfigNode: class ConfigNode {
    config: unknown;
    constructor(c: unknown) { this.config = c; }
  },
  GroupNode: class GroupNode {
    group: unknown;
    constructor(g: unknown) { this.group = g; }
  },
}));

jest.mock('../ui/configEditor', () => ({
  ConfigEditorPanel: { open: jest.fn() },
}));

jest.mock('../ui/quickPick', () => ({
  showConfigQuickPick: jest.fn(),
}));

jest.mock('../import/importer', () => ({
  importFromFile: jest.fn(),
}));

import { activate } from '../extension';
import * as vscode from 'vscode';

// Every command declared in package.json must be registered by activate()
const ALL_COMMANDS = [
  'targetRunManager.refresh',
  'targetRunManager.run',
  'targetRunManager.build',
  'targetRunManager.debug',
  'targetRunManager.setActive',
  'targetRunManager.runActive',
  'targetRunManager.debugActive',
  'targetRunManager.buildActive',
  'targetRunManager.rerunLast',
  'targetRunManager.switchActive',
  'targetRunManager.addGroup',
  'targetRunManager.renameGroup',
  'targetRunManager.deleteGroup',
  'targetRunManager.addConfig',
  'targetRunManager.editConfig',
  'targetRunManager.cloneConfig',
  'targetRunManager.deleteConfig',
  'targetRunManager.importFromFile',
  'targetRunManager.moveToGroup',
];

function makeContext(): vscode.ExtensionContext {
  return {
    subscriptions: { push: jest.fn() },
    extensionPath: '/ext',
    extensionUri: vscode.Uri.file('/ext'),
    globalState: { get: jest.fn(), update: jest.fn(), setKeysForSync: jest.fn(), keys: jest.fn().mockReturnValue([]) },
    workspaceState: { get: jest.fn(), update: jest.fn(), keys: jest.fn().mockReturnValue([]) },
    secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
    storageUri: undefined,
    globalStorageUri: vscode.Uri.file('/ext/global'),
    logUri: vscode.Uri.file('/ext/log'),
    extensionMode: 3,
    environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
    asAbsolutePath: jest.fn((p: string) => p),
    storagePath: undefined,
    globalStoragePath: '/ext/global',
    logPath: '/ext/log',
    extension: {} as vscode.Extension<unknown>,
  } as unknown as vscode.ExtensionContext;
}

function getRegisteredCommands(): string[] {
  return (vscode.commands.registerCommand as jest.Mock).mock.calls.map((call) => call[0] as string);
}

describe('Extension activation — command registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers all commands when a workspace folder is open', () => {
    activate(makeContext());
    const registered = getRegisteredCommands();
    for (const cmd of ALL_COMMANDS) {
      expect(registered).toContain(cmd);
    }
  });

  it('registers all commands even when NO workspace folder is open', () => {
    // Simulate opening VS Code with no folder
    const origFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;

    try {
      activate(makeContext());
      const registered = getRegisteredCommands();
      for (const cmd of ALL_COMMANDS) {
        expect(registered).toContain(cmd);
      }
    } finally {
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = origFolders;
    }
  });

  it('registers exactly the expected set of commands (no extras, no missing)', () => {
    activate(makeContext());
    const registered = getRegisteredCommands().sort();
    expect(registered).toEqual([...ALL_COMMANDS].sort());
  });
});
