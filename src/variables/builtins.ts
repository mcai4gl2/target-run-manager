/**
 * Built-in variable providers for the variable expansion pipeline.
 *
 * Built-in vars:
 *   ${buildDir}      — ${workspaceFolder}/build/<preset>
 *   ${targetBinary}  — resolved binary path for the config's target (passed in context)
 *   ${preset}        — current CMake preset or Bazel config name
 *   ${date}          — ISO date YYYY-MM-DD
 *   ${datetime}      — ISO datetime YYYY-MM-DDTHH:MM:SS
 *   ${gitBranch}     — current git branch name
 *   ${gitHash}       — short commit hash (7 chars)
 */

import { execSync } from 'child_process';
import * as path from 'path';

export interface BuiltinContext {
  workspaceFolder: string;
  buildConfig?: string;    // CMake preset name or Bazel config flag
  targetBinary?: string;   // resolved binary path
}

/** Compute all built-in variable values for the given context. */
export function computeBuiltins(context: BuiltinContext): Record<string, string> {
  const now = new Date();
  const date = formatDate(now);
  const datetime = formatDatetime(now);

  const buildDir = context.buildConfig
    ? path.join(context.workspaceFolder, 'build', context.buildConfig)
    : path.join(context.workspaceFolder, 'build');

  const vars: Record<string, string> = {
    buildDir,
    date,
    datetime,
    preset: context.buildConfig ?? '',
    targetBinary: context.targetBinary ?? '',
  };

  // Git variables — fail gracefully if not in a git repo
  try {
    vars.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: context.workspaceFolder,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    vars.gitBranch = '';
  }

  try {
    vars.gitHash = execSync('git rev-parse --short HEAD', {
      cwd: context.workspaceFolder,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    vars.gitHash = '';
  }

  return vars;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDatetime(d: Date): string {
  const date = formatDate(d);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${date}T${hh}:${mm}:${ss}`;
}
