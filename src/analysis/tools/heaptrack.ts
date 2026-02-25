/**
 * Heaptrack command builder.
 *
 * Generates: heaptrack [toolArgs] <binary> [binaryArgs]
 * Output:    heaptrack.<pid>.zst  (in cwd, or outputDir if --output is specified)
 */

import * as path from 'path';
import type { AnalyzeConfig } from '../../model/config';

export interface HeaptrackCommand {
  command: string;
  outputFile?: string;
}

export function buildHeaptrackCommand(
  analyzeConfig: AnalyzeConfig,
  binary: string,
  binaryArgs: string[],
  outputDir: string,
): HeaptrackCommand {
  const extraArgs = analyzeConfig.toolArgs ?? [];
  const outputFile = path.join(outputDir, 'heaptrack.zst');

  const parts = [
    'heaptrack',
    '--output', outputFile,
    ...extraArgs,
    binary,
    ...binaryArgs,
  ];

  return { command: parts.join(' '), outputFile };
}
