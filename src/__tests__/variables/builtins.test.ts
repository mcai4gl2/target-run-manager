import { computeBuiltins } from '../../variables/builtins';
import * as path from 'path';

describe('builtins', () => {
  const workspaceFolder = '/workspace/my-project';

  it('computes date in YYYY-MM-DD format', () => {
    const vars = computeBuiltins({ workspaceFolder });
    expect(vars.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('computes datetime in YYYY-MM-DDTHH:MM:SS format', () => {
    const vars = computeBuiltins({ workspaceFolder });
    expect(vars.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('computes buildDir from workspaceFolder and buildConfig', () => {
    const vars = computeBuiltins({ workspaceFolder, buildConfig: 'debug' });
    expect(vars.buildDir).toBe(path.join(workspaceFolder, 'build', 'debug'));
  });

  it('computes buildDir without preset', () => {
    const vars = computeBuiltins({ workspaceFolder });
    expect(vars.buildDir).toBe(path.join(workspaceFolder, 'build'));
  });

  it('sets preset to buildConfig value', () => {
    const vars = computeBuiltins({ workspaceFolder, buildConfig: 'release' });
    expect(vars.preset).toBe('release');
  });

  it('sets preset to empty string when no buildConfig', () => {
    const vars = computeBuiltins({ workspaceFolder });
    expect(vars.preset).toBe('');
  });

  it('returns targetBinary when provided', () => {
    const vars = computeBuiltins({ workspaceFolder, targetBinary: '/build/debug/my_app' });
    expect(vars.targetBinary).toBe('/build/debug/my_app');
  });

  it('returns empty targetBinary when not provided', () => {
    const vars = computeBuiltins({ workspaceFolder });
    expect(vars.targetBinary).toBe('');
  });

  it('includes gitBranch (string)', () => {
    const vars = computeBuiltins({ workspaceFolder });
    expect(typeof vars.gitBranch).toBe('string');
  });

  it('includes gitHash (string)', () => {
    const vars = computeBuiltins({ workspaceFolder });
    expect(typeof vars.gitHash).toBe('string');
  });

  it('returns empty gitBranch for non-git dir', () => {
    const vars = computeBuiltins({ workspaceFolder: '/tmp/definitely-not-a-git-repo-xyz' });
    expect(vars.gitBranch).toBe('');
  });

  it('returns empty gitHash for non-git dir', () => {
    const vars = computeBuiltins({ workspaceFolder: '/tmp/definitely-not-a-git-repo-xyz' });
    expect(vars.gitHash).toBe('');
  });
});
