/**
 * Terminal task runner — executes commands in VS Code integrated terminals.
 */

import * as vscode from 'vscode';

export interface TerminalRunOptions {
  command: string;
  title: string;
  cwd?: string;
  mode?: 'dedicated' | 'shared' | 'reuse';
}

export class TaskRunner {
  private sharedTerminal: vscode.Terminal | undefined;
  private lastTerminal: vscode.Terminal | undefined;

  /**
   * Run a shell command in a terminal.
   * Creates a new terminal or reuses one depending on the mode.
   */
  runInTerminal(options: TerminalRunOptions): vscode.Terminal {
    const { command, title, cwd, mode = 'dedicated' } = options;

    let terminal: vscode.Terminal;

    switch (mode) {
      case 'shared':
        if (!this.sharedTerminal || this.isTerminalClosed(this.sharedTerminal)) {
          this.sharedTerminal = this.createTerminal(title, cwd);
        }
        terminal = this.sharedTerminal;
        break;

      case 'reuse':
        if (this.lastTerminal && !this.isTerminalClosed(this.lastTerminal)) {
          terminal = this.lastTerminal;
        } else {
          terminal = this.createTerminal(title, cwd);
        }
        break;

      case 'dedicated':
      default:
        terminal = this.createTerminal(title, cwd);
        break;
    }

    terminal.show(true);
    terminal.sendText(command);
    this.lastTerminal = terminal;
    return terminal;
  }

  private createTerminal(title: string, cwd?: string): vscode.Terminal {
    return vscode.window.createTerminal({
      name: title,
      cwd,
    });
  }

  private isTerminalClosed(terminal: vscode.Terminal): boolean {
    return vscode.window.terminals.indexOf(terminal) === -1;
  }

  dispose(): void {
    this.sharedTerminal = undefined;
    this.lastTerminal = undefined;
  }
}
