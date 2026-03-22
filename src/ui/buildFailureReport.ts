import * as vscode from 'vscode';

export interface BuildFailureDetails {
  configName: string;
  providerName: string;
  command: string;
  exitCode: number;
  output: string;
}

export interface BuildFailurePresenter {
  showBuildFailure(details: BuildFailureDetails): Promise<void>;
}

const BUILD_FAILURE_SCHEME = 'target-run-manager-build-failure';

export class BuildFailureReport implements vscode.TextDocumentContentProvider, vscode.Disposable, BuildFailurePresenter {
  private readonly docs = new Map<string, string>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly registration: vscode.Disposable;

  constructor() {
    this.registration = vscode.workspace.registerTextDocumentContentProvider(
      BUILD_FAILURE_SCHEME,
      this,
    );
  }

  dispose(): void {
    this.registration.dispose();
    this.onDidChangeEmitter.dispose();
    this.docs.clear();
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.docs.get(uri.toString()) ?? 'No build failure details available.';
  }

  async showBuildFailure(details: BuildFailureDetails): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = slugify(details.configName || 'build-failure');
    const uri = vscode.Uri.parse(`${BUILD_FAILURE_SCHEME}:/${slug}-${timestamp}.log`);

    this.docs.set(uri.toString(), formatBuildFailure(details));
    this.onDidChangeEmitter.fire(uri);

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
  }
}

function formatBuildFailure(details: BuildFailureDetails): string {
  const sections = [
    `Build failed: ${details.configName}`,
    `Provider: ${details.providerName}`,
    `Exit code: ${details.exitCode}`,
    `Command: ${details.command || '(unknown)'}`,
    '',
    'Compiler output:',
    details.output.trim() || '(No build output captured.)',
  ];
  return sections.join('\n');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'build-failure';
}
