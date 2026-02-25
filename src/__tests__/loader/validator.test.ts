import { validateModel } from '../../loader/validator';
import type { WorkspaceModel } from '../../model/config';

function makeModel(overrides: Partial<WorkspaceModel> = {}): WorkspaceModel {
  return {
    groups: [],
    ungrouped: [],
    compounds: [],
    settings: {},
    fileMacros: new Map(),
    ...overrides,
  };
}

describe('validator', () => {
  it('returns no issues for empty model', () => {
    const issues = validateModel(makeModel());
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for valid configs', () => {
    const model = makeModel({
      ungrouped: [
        {
          id: 'cfg-1',
          name: 'Test',
          buildSystem: 'cmake',
          runMode: 'run',
        },
      ],
    });
    const issues = validateModel(model);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('errors on missing buildSystem', () => {
    const model = makeModel({
      ungrouped: [{ id: 'cfg-1', name: 'Test', runMode: 'run' } as never],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('buildSystem'))).toBe(true);
  });

  it('errors on invalid buildSystem value', () => {
    const model = makeModel({
      ungrouped: [{ id: 'cfg-1', name: 'Test', buildSystem: 'unknown' as never, runMode: 'run' }],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes('invalid buildSystem'))).toBe(true);
  });

  it('errors on missing runMode', () => {
    const model = makeModel({
      ungrouped: [{ id: 'cfg-1', name: 'Test', buildSystem: 'cmake' } as never],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('runMode'))).toBe(true);
  });

  it('errors on invalid runMode value', () => {
    const model = makeModel({
      ungrouped: [{ id: 'cfg-1', name: 'Test', buildSystem: 'cmake', runMode: 'fly' as never }],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.message.includes('invalid runMode'))).toBe(true);
  });

  it('errors when manual config has no binaryOverride', () => {
    const model = makeModel({
      ungrouped: [{ id: 'cfg-1', name: 'Test', buildSystem: 'manual', runMode: 'run' }],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('binaryOverride'))).toBe(true);
  });

  it('no error when manual config has binaryOverride', () => {
    const model = makeModel({
      ungrouped: [{
        id: 'cfg-1',
        name: 'Test',
        buildSystem: 'manual',
        runMode: 'run',
        binaryOverride: '/usr/bin/app',
      }],
    });
    const issues = validateModel(model);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('warns when analyze mode has no analyzeConfig', () => {
    const model = makeModel({
      ungrouped: [{
        id: 'cfg-1',
        name: 'Test',
        buildSystem: 'cmake',
        runMode: 'analyze',
      }],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('analyzeConfig'))).toBe(true);
  });

  it('errors when analyzeConfig missing tool', () => {
    const model = makeModel({
      ungrouped: [{
        id: 'cfg-1',
        name: 'Test',
        buildSystem: 'cmake',
        runMode: 'analyze',
        analyzeConfig: {} as never,
      }],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('tool'))).toBe(true);
  });

  it('warns when name is missing', () => {
    const model = makeModel({
      ungrouped: [{ id: 'cfg-1', buildSystem: 'cmake', runMode: 'run' } as never],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('name'))).toBe(true);
  });

  it('validates configs inside groups', () => {
    const model = makeModel({
      groups: [{
        id: 'grp-1',
        name: 'Group 1',
        configs: [{ id: 'cfg-1', buildSystem: 'cmake' } as never],
      }],
    });
    const issues = validateModel(model);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('runMode'))).toBe(true);
  });
});
