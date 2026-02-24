/**
 * Status bar item showing the active config and providing a re-run button.
 */

import * as vscode from 'vscode';
import type { RunConfig } from '../model/config';

export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private activeConfig: RunConfig | undefined;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBarItem.command = 'targetRunManager.switchActive';
    this.statusBarItem.tooltip = 'Target Run Manager — Click to switch active config';
    this.update();
  }

  setActiveConfig(config: RunConfig | undefined): void {
    this.activeConfig = config;
    this.update();
  }

  getActiveConfig(): RunConfig | undefined {
    return this.activeConfig;
  }

  private update(): void {
    if (this.activeConfig) {
      this.statusBarItem.text = `$(play) ${this.activeConfig.name}`;
      this.statusBarItem.show();
    } else {
      this.statusBarItem.text = '$(play) No target selected';
      this.statusBarItem.show();
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
