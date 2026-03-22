const vscode = {
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({
      get: (key: string, defaultValue?: unknown) => defaultValue,
    }),
    findFiles: jest.fn().mockResolvedValue([]),
    registerTextDocumentContentProvider: jest.fn().mockReturnValue({
      dispose: jest.fn(),
    }),
    openTextDocument: jest.fn().mockImplementation(async (uriOrOptions?: unknown) => ({
      uri: typeof uriOrOptions === 'object' && uriOrOptions !== null && 'uri' in (uriOrOptions as Record<string, unknown>)
        ? (uriOrOptions as { uri: unknown }).uri
        : uriOrOptions,
      getText: jest.fn(),
    })),
    createFileSystemWatcher: jest.fn().mockReturnValue({
      onDidChange: jest.fn(),
      onDidCreate: jest.fn(),
      onDidDelete: jest.fn(),
      dispose: jest.fn(),
    }),
  },
  window: {
    createOutputChannel: jest.fn().mockReturnValue({
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn(),
    }),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showTextDocument: jest.fn().mockResolvedValue(undefined),
    createStatusBarItem: jest.fn().mockReturnValue({
      text: '',
      tooltip: '',
      command: '',
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    }),
    showQuickPick: jest.fn(),
    createTreeView: jest.fn().mockReturnValue({
      dispose: jest.fn(),
      onDidCollapseElement: jest.fn(),
      onDidExpandElement: jest.fn(),
      onDidChangeSelection: jest.fn(),
      onDidChangeVisibility: jest.fn(),
    }),
    createTerminal: jest.fn().mockReturnValue({
      sendText: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn(),
    }),
    terminals: [] as unknown[],
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
  },
  EventEmitter: jest.fn().mockImplementation(() => ({
    event: jest.fn(),
    fire: jest.fn(),
    dispose: jest.fn(),
  })),
  TreeItem: jest.fn().mockImplementation((label: string) => ({ label })),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: jest.fn().mockImplementation((id: string) => ({ id })),
  Uri: {
    file: jest.fn((p: string) => ({
      fsPath: p,
      path: p,
      toString: () => p,
    })),
    parse: jest.fn((s: string) => ({
      fsPath: s,
      path: s,
      toString: () => s,
    })),
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: 1, Beside: 2 },
  MarkdownString: jest.fn().mockImplementation((s: string) => ({ value: s })),
  debug: {
    startDebugging: jest.fn().mockResolvedValue(true),
    stopDebugging: jest.fn().mockResolvedValue(undefined),
    onDidStartDebugSession: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    onDidTerminateDebugSession: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  },
};

module.exports = vscode;
