/**
 * strace / ltrace command builder.
 *
 * strace: strace [toolArgs] <binary> [binaryArgs]
 * ltrace: ltrace [toolArgs] <binary> [binaryArgs]
 *
 * Output written to <outputDir>/strace.log or ltrace.log via -o flag.
 */

import * as path from 'path';
import type { AnalyzeConfig, AnalysisTool } from '../../model/config';

export interface StraceCommand {
  command: string;
  outputFile: string;
}

export function buildStraceCommand(
  tool: Extract<AnalysisTool, 'strace' | 'ltrace'>,
  analyzeConfig: AnalyzeConfig,
  binary: string,
  binaryArgs: string[],
  outputDir: string,
): StraceCommand {
  const extraArgs = analyzeConfig.toolArgs ?? [];
  const outputFile = path.join(outputDir, `${tool}.log`);

  const parts = [
    tool,
    '-o', outputFile,
    ...extraArgs,
    binary,
    ...binaryArgs,
  ];

  return { command: parts.join(' '), outputFile };
}
