import * as vscode from 'vscode';
import { BuildFailureReport } from '../../ui/buildFailureReport';

describe('BuildFailureReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a text document content provider on construction', () => {
    const report = new BuildFailureReport();
    expect(vscode.workspace.registerTextDocumentContentProvider).toHaveBeenCalledWith(
      'target-run-manager-build-failure',
      report,
    );
    report.dispose();
  });

  it('opens a read-only details document with formatted build output', async () => {
    const report = new BuildFailureReport();

    await report.showBuildFailure({
      configName: 'Order Book',
      providerName: 'cmake',
      command: 'cmake --build --preset debug --target order_book',
      exitCode: 2,
      output: 'main.cpp:7: error: no matching function\nnote: candidate expects 2 arguments',
    });

    expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    const uri = (vscode.workspace.openTextDocument as jest.Mock).mock.calls[0][0] as vscode.Uri;

    expect(report.provideTextDocumentContent(uri)).toContain('Build failed: Order Book');
    expect(report.provideTextDocumentContent(uri)).toContain('Provider: cmake');
    expect(report.provideTextDocumentContent(uri)).toContain('Exit code: 2');
    expect(report.provideTextDocumentContent(uri)).toContain('main.cpp:7: error: no matching function');

    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ uri }),
      expect.objectContaining({
        preview: false,
        preserveFocus: false,
        viewColumn: vscode.ViewColumn.Beside,
      }),
    );

    report.dispose();
  });

  it('returns a fallback message for unknown documents', () => {
    const report = new BuildFailureReport();
    const uri = vscode.Uri.parse('target-run-manager-build-failure:/missing.log');
    expect(report.provideTextDocumentContent(uri)).toContain('No build failure details available');
    report.dispose();
  });
});
