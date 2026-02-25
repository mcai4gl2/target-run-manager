import { buildStraceCommand } from '../../../analysis/tools/strace';
import type { AnalyzeConfig } from '../../../model/config';

const BINARY = '/build/debug/server';
const BINARY_ARGS = ['--port', '8080'];
const OUTPUT_DIR = '/workspace/out/strace';

function makeAC(overrides: Partial<AnalyzeConfig> = {}): AnalyzeConfig {
  return { tool: 'strace', ...overrides };
}

describe('strace tool builder', () => {
  it('uses strace as the command prefix', () => {
    const { command } = buildStraceCommand('strace', makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR);
    expect(command).toMatch(/^strace /);
  });

  it('writes output to <outputDir>/strace.log via -o flag', () => {
    const { command, outputFile } = buildStraceCommand('strace', makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR);
    expect(command).toContain(`-o ${OUTPUT_DIR}/strace.log`);
    expect(outputFile).toBe(`${OUTPUT_DIR}/strace.log`);
  });

  it('includes binary and binary args', () => {
    const { command } = buildStraceCommand('strace', makeAC(), BINARY, BINARY_ARGS, OUTPUT_DIR);
    expect(command).toContain(BINARY);
    expect(command).toContain('--port 8080');
  });

  it('appends extra toolArgs', () => {
    const ac = makeAC({ toolArgs: ['-e', 'trace=network'] });
    const { command } = buildStraceCommand('strace', ac, BINARY, BINARY_ARGS, OUTPUT_DIR);
    expect(command).toContain('-e trace=network');
  });
});

describe('ltrace tool builder', () => {
  it('uses ltrace as the command prefix', () => {
    const { command } = buildStraceCommand('ltrace', makeAC({ tool: 'ltrace' }), BINARY, [], OUTPUT_DIR);
    expect(command).toMatch(/^ltrace /);
  });

  it('writes output to <outputDir>/ltrace.log', () => {
    const { command, outputFile } = buildStraceCommand('ltrace', makeAC({ tool: 'ltrace' }), BINARY, [], OUTPUT_DIR);
    expect(command).toContain(`-o ${OUTPUT_DIR}/ltrace.log`);
    expect(outputFile).toBe(`${OUTPUT_DIR}/ltrace.log`);
  });
});
