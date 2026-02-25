import { buildHeaptrackCommand } from '../../../analysis/tools/heaptrack';
import type { AnalyzeConfig } from '../../../model/config';

const BINARY = '/build/debug/my_app';
const BINARY_ARGS = ['--mode', 'sim'];
const OUTPUT_DIR = '/workspace/out/heaptrack/2026-02-25';

function makeAC(overrides: Partial<AnalyzeConfig> = {}): AnalyzeConfig {
  return { tool: 'heaptrack', ...overrides };
}

describe('heaptrack tool builder', () => {
  it('starts with heaptrack command', () => {
    const { command } = buildHeaptrackCommand(makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR);
    expect(command).toMatch(/^heaptrack /);
  });

  it('passes --output flag pointing to outputDir', () => {
    const { command, outputFile } = buildHeaptrackCommand(makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR);
    expect(command).toContain(`--output ${OUTPUT_DIR}/heaptrack.zst`);
    expect(outputFile).toBe(`${OUTPUT_DIR}/heaptrack.zst`);
  });

  it('includes binary after tool and output args', () => {
    const { command } = buildHeaptrackCommand(makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR);
    expect(command).toContain(BINARY);
  });

  it('includes binary args', () => {
    const { command } = buildHeaptrackCommand(makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR);
    expect(command).toContain('--mode sim');
  });

  it('appends extra toolArgs between output and binary', () => {
    const ac = makeAC({ toolArgs: ['--record-only'] });
    const { command } = buildHeaptrackCommand(ac, BINARY, [], OUTPUT_DIR);
    expect(command).toContain('--record-only');
  });

  it('works with no binary args', () => {
    const { command } = buildHeaptrackCommand(makeAC(), BINARY, [], OUTPUT_DIR);
    expect(command).toContain(BINARY);
  });
});
