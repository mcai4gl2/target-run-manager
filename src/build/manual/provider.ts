/**
 * Manual build provider.
 * No build step — uses binaryOverride as the executable path.
 */

import type { RunConfig, BuildTarget } from '../../model/config';
import type { BuildSystemProvider, BuildResult, OutputChannel } from '../provider';

export class ManualBuildProvider implements BuildSystemProvider {
  readonly name = 'manual';

  async discoverTargets(): Promise<BuildTarget[]> {
    return [];
  }

  async resolveBinaryPath(config: RunConfig): Promise<string | undefined> {
    return config.binaryOverride ?? undefined;
  }

  async buildTarget(_config: RunConfig, outputChannel: OutputChannel): Promise<BuildResult> {
    outputChannel.appendLine('[Manual] No build step — skipping');
    return { success: true, exitCode: 0, command: '' };
  }

  buildRunCommand(config: RunConfig, binaryPath: string): string {
    const parts: string[] = [];

    for (const script of config.sourceScripts ?? []) {
      parts.push(`. ${script}`);
    }

    const envParts = Object.entries(config.env ?? {}).map(
      ([k, v]) => `${k}=${shellQuote(v)}`,
    );

    const binaryCmd = [binaryPath, ...(config.args ?? []).map(shellQuote)].join(' ');

    if (envParts.length > 0) {
      parts.push(`${envParts.join(' ')} ${binaryCmd}`);
    } else {
      parts.push(binaryCmd);
    }

    return parts.join(' && ');
  }

  buildTestCommand(_config: RunConfig): string {
    return '';
  }

  async refresh(): Promise<void> {
    // nothing to refresh
  }
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9._\-/=:@%^,]+$/.test(s)) {
    return s;
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}
