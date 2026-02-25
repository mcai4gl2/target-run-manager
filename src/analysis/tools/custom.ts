/**
 * Custom analysis tool command builder.
 *
 * Expands a user-defined command template with these placeholders:
 *   {binary}    — resolved binary path
 *   {args}      — binary args joined as a shell string
 *   {env}       — "KEY=VALUE KEY=VALUE ..." prefix string
 *   {outputDir} — resolved output directory
 *   {cwd}       — working directory
 */

import type { AnalyzeConfig } from '../../model/config';

export interface CustomCommand {
  command: string;
}

export interface CustomContext {
  binary: string;
  args: string[];
  env?: Record<string, string>;
  outputDir: string;
  cwd: string;
}

export function buildCustomCommand(
  analyzeConfig: AnalyzeConfig,
  context: CustomContext,
): CustomCommand {
  const template = analyzeConfig.customCommand ?? '';

  const envStr = Object.entries(context.env ?? {})
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(' ');

  const expanded = template
    .replace(/\{binary\}/g, context.binary)
    .replace(/\{args\}/g, context.args.map(shellQuote).join(' '))
    .replace(/\{env\}/g, envStr)
    .replace(/\{outputDir\}/g, context.outputDir)
    .replace(/\{cwd\}/g, context.cwd);

  return { command: expanded };
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9._\-/=:@%^,]+$/.test(s)) {
    return s;
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}
