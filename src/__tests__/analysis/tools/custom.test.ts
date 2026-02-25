import { buildCustomCommand } from '../../../analysis/tools/custom';
import type { AnalyzeConfig } from '../../../model/config';

const BINARY = '/build/debug/app';
const OUTPUT_DIR = '/workspace/out/custom';
const CWD = '/workspace';

function makeAC(template: string): AnalyzeConfig {
  return { tool: 'custom', customCommand: template };
}

describe('custom tool builder', () => {
  it('expands {binary} placeholder', () => {
    const { command } = buildCustomCommand(makeAC('{binary}'), {
      binary: BINARY, args: [], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toBe(BINARY);
  });

  it('expands {args} placeholder', () => {
    const { command } = buildCustomCommand(makeAC('{binary} {args}'), {
      binary: BINARY, args: ['--mode', 'test'], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toContain('--mode test');
  });

  it('expands {outputDir} placeholder', () => {
    const { command } = buildCustomCommand(makeAC('out={outputDir}'), {
      binary: BINARY, args: [], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toBe(`out=${OUTPUT_DIR}`);
  });

  it('expands {cwd} placeholder', () => {
    const { command } = buildCustomCommand(makeAC('cd {cwd} && {binary}'), {
      binary: BINARY, args: [], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toBe(`cd ${CWD} && ${BINARY}`);
  });

  it('expands {env} placeholder', () => {
    const { command } = buildCustomCommand(makeAC('{env} {binary}'), {
      binary: BINARY, args: [], env: { KEY: 'val', LOG: 'debug' }, outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toContain('KEY=val');
    expect(command).toContain('LOG=debug');
  });

  it('leaves empty {env} when no env vars', () => {
    const { command } = buildCustomCommand(makeAC('{env}{binary}'), {
      binary: BINARY, args: [], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toBe(BINARY);
  });

  it('expands all placeholders in a realistic template', () => {
    const template = '/usr/bin/time -v {binary} {args} 2> {outputDir}/time.txt';
    const { command } = buildCustomCommand(makeAC(template), {
      binary: BINARY, args: ['--bench'], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toBe(`/usr/bin/time -v ${BINARY} --bench 2> ${OUTPUT_DIR}/time.txt`);
  });

  it('replaces all occurrences of a placeholder', () => {
    const { command } = buildCustomCommand(makeAC('{binary} > {outputDir}/a.txt; {binary} > {outputDir}/b.txt'), {
      binary: BINARY, args: [], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command.split(BINARY).length - 1).toBe(2);
    expect(command.split(OUTPUT_DIR).length - 1).toBe(2);
  });

  it('shell-quotes args with special characters', () => {
    const { command } = buildCustomCommand(makeAC('{binary} {args}'), {
      binary: BINARY, args: ['--msg', 'hello world'], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toContain("'hello world'");
  });

  it('returns empty string for empty template', () => {
    const { command } = buildCustomCommand(makeAC(''), {
      binary: BINARY, args: [], outputDir: OUTPUT_DIR, cwd: CWD,
    });
    expect(command).toBe('');
  });
});
