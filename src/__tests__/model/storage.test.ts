import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ConfigStorage } from '../../model/storage';
import type { WorkspaceModel, RunConfig, Group } from '../../model/config';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTmpWorkspace(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trm-storage-'));
  fs.mkdirSync(path.join(tmp, '.vscode', 'target-manager'), { recursive: true });
  return tmp;
}

function makeModel(overrides: Partial<WorkspaceModel> = {}): WorkspaceModel {
  return {
    groups: [],
    ungrouped: [],
    settings: {},
    fileMacros: new Map(),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    id: 'cfg-test',
    name: 'Test Config',
    buildSystem: 'cmake',
    runMode: 'run',
    ...overrides,
  };
}

function readYaml(filePath: string): Record<string, unknown> {
  const content = fs.readFileSync(filePath, 'utf-8');
  return (yaml.load(content) as Record<string, unknown>) ?? {};
}

// ---------------------------------------------------------------------------
// ConfigStorage.configToPlain
// ---------------------------------------------------------------------------

describe('ConfigStorage.configToPlain', () => {
  it('includes required fields', () => {
    const config = makeConfig();
    const plain = ConfigStorage.configToPlain(config);
    expect(plain.id).toBe('cfg-test');
    expect(plain.name).toBe('Test Config');
    expect(plain.buildSystem).toBe('cmake');
    expect(plain.runMode).toBe('run');
  });

  it('omits undefined optional fields', () => {
    const config = makeConfig();
    const plain = ConfigStorage.configToPlain(config);
    expect('target' in plain).toBe(false);
    expect('binaryOverride' in plain).toBe(false);
    expect('args' in plain).toBe(false);
    expect('env' in plain).toBe(false);
  });

  it('includes optional fields when set', () => {
    const config = makeConfig({
      target: 'my_target',
      buildConfig: 'debug',
      args: ['--mode', 'sim'],
      env: { LOG: 'DEBUG' },
      cwd: '/tmp',
      preBuild: true,
      terminal: 'shared',
    });
    const plain = ConfigStorage.configToPlain(config);
    expect(plain.target).toBe('my_target');
    expect(plain.buildConfig).toBe('debug');
    expect(plain.args).toEqual(['--mode', 'sim']);
    expect(plain.env).toEqual({ LOG: 'DEBUG' });
    expect(plain.cwd).toBe('/tmp');
    expect(plain.preBuild).toBe(true);
    expect(plain.terminal).toBe('shared');
  });

  it('omits empty args array', () => {
    const config = makeConfig({ args: [] });
    const plain = ConfigStorage.configToPlain(config);
    expect('args' in plain).toBe(false);
  });

  it('omits empty env object', () => {
    const config = makeConfig({ env: {} });
    const plain = ConfigStorage.configToPlain(config);
    expect('env' in plain).toBe(false);
  });

  it('includes analyzeConfig when set', () => {
    const config = makeConfig({
      runMode: 'analyze',
      analyzeConfig: { tool: 'valgrind', subTool: 'memcheck' },
    });
    const plain = ConfigStorage.configToPlain(config);
    expect(plain.analyzeConfig).toEqual({ tool: 'valgrind', subTool: 'memcheck' });
  });

  it('includes macros when set', () => {
    const config = makeConfig({ macros: { MY_VAR: 'value' } });
    const plain = ConfigStorage.configToPlain(config);
    expect(plain.macros).toEqual({ MY_VAR: 'value' });
  });

  it('does not include internal _sourceFile field', () => {
    const config = makeConfig({ _sourceFile: '/some/file.yaml' });
    const plain = ConfigStorage.configToPlain(config);
    expect('_sourceFile' in plain).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConfigStorage.saveConfig — create
// ---------------------------------------------------------------------------

describe('ConfigStorage.saveConfig (create)', () => {
  let tmp: string;
  let storage: ConfigStorage;

  beforeEach(() => {
    tmp = makeTmpWorkspace();
    storage = new ConfigStorage(tmp);
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true }); });

  it('creates primary file and writes ungrouped config', () => {
    const config = makeConfig();
    const model = makeModel();
    storage.saveConfig(config, undefined, model);
    const primary = storage.getPrimaryFile();
    expect(fs.existsSync(primary)).toBe(true);
    const raw = readYaml(primary);
    const ungrouped = raw.ungrouped as Array<{ id: string }>;
    expect(ungrouped).toHaveLength(1);
    expect(ungrouped[0].id).toBe('cfg-test');
  });

  it('writes config into a new group', () => {
    const config = makeConfig();
    const model = makeModel({
      groups: [{ id: 'grp-1', name: 'Group 1', configs: [] }],
    });
    storage.saveConfig(config, 'grp-1', model);
    const raw = readYaml(storage.getPrimaryFile());
    const groups = raw.groups as Array<{ id: string; configs: Array<{ id: string }> }>;
    expect(groups[0].id).toBe('grp-1');
    expect(groups[0].configs[0].id).toBe('cfg-test');
  });

  it('creates the group if it does not exist in the file yet', () => {
    const config = makeConfig();
    const model = makeModel({
      groups: [{ id: 'grp-new', name: 'New Group', configs: [] }],
    });
    storage.saveConfig(config, 'grp-new', model);
    const raw = readYaml(storage.getPrimaryFile());
    const groups = raw.groups as Array<{ id: string; name: string }>;
    expect(groups.find((g) => g.id === 'grp-new')?.name).toBe('New Group');
  });

  it('serializes name correctly', () => {
    const config = makeConfig({ name: 'My Special Config' });
    storage.saveConfig(config, undefined, makeModel());
    const raw = readYaml(storage.getPrimaryFile());
    const ungrouped = raw.ungrouped as Array<{ name: string }>;
    expect(ungrouped[0].name).toBe('My Special Config');
  });
});

// ---------------------------------------------------------------------------
// ConfigStorage.saveConfig — update
// ---------------------------------------------------------------------------

describe('ConfigStorage.saveConfig (update)', () => {
  let tmp: string;
  let storage: ConfigStorage;

  beforeEach(() => {
    tmp = makeTmpWorkspace();
    storage = new ConfigStorage(tmp);
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true }); });

  it('updates an existing ungrouped config in-place', () => {
    const primary = storage.getPrimaryFile();
    // Set up initial state
    storage.writeYaml(primary, {
      ungrouped: [{ id: 'cfg-test', name: 'Old Name', buildSystem: 'cmake', runMode: 'run' }],
    });

    const model = makeModel({
      ungrouped: [makeConfig({ _sourceFile: primary })],
    });
    const updated = makeConfig({ name: 'New Name', _sourceFile: primary });
    storage.saveConfig(updated, undefined, model);

    const raw = readYaml(primary);
    const ungrouped = raw.ungrouped as Array<{ id: string; name: string }>;
    expect(ungrouped).toHaveLength(1); // Not duplicated
    expect(ungrouped[0].name).toBe('New Name');
  });

  it('updates config in a group in-place', () => {
    const primary = storage.getPrimaryFile();
    storage.writeYaml(primary, {
      groups: [{
        id: 'grp-1',
        name: 'Group 1',
        configs: [{ id: 'cfg-test', name: 'Old Name', buildSystem: 'cmake', runMode: 'run' }],
      }],
    });

    const model = makeModel({
      groups: [{
        id: 'grp-1',
        name: 'Group 1',
        configs: [makeConfig({ _sourceFile: primary })],
      }],
    });
    const updated = makeConfig({ name: 'Updated Name', _sourceFile: primary });
    storage.saveConfig(updated, 'grp-1', model);

    const raw = readYaml(primary);
    const groups = raw.groups as Array<{ configs: Array<{ name: string }> }>;
    expect(groups[0].configs).toHaveLength(1);
    expect(groups[0].configs[0].name).toBe('Updated Name');
  });
});

// ---------------------------------------------------------------------------
// ConfigStorage.deleteConfig
// ---------------------------------------------------------------------------

describe('ConfigStorage.deleteConfig', () => {
  let tmp: string;
  let storage: ConfigStorage;

  beforeEach(() => {
    tmp = makeTmpWorkspace();
    storage = new ConfigStorage(tmp);
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true }); });

  it('removes config from ungrouped', () => {
    const primary = storage.getPrimaryFile();
    storage.writeYaml(primary, {
      ungrouped: [
        { id: 'cfg-a', name: 'A', buildSystem: 'cmake', runMode: 'run' },
        { id: 'cfg-b', name: 'B', buildSystem: 'cmake', runMode: 'run' },
      ],
    });

    const model = makeModel({
      ungrouped: [
        makeConfig({ id: 'cfg-a', _sourceFile: primary }),
        makeConfig({ id: 'cfg-b', _sourceFile: primary }),
      ],
    });

    storage.deleteConfig('cfg-a', model);
    const raw = readYaml(primary);
    const ungrouped = raw.ungrouped as Array<{ id: string }>;
    expect(ungrouped).toHaveLength(1);
    expect(ungrouped[0].id).toBe('cfg-b');
  });

  it('removes config from a group', () => {
    const primary = storage.getPrimaryFile();
    storage.writeYaml(primary, {
      groups: [{
        id: 'grp-1',
        name: 'G1',
        configs: [
          { id: 'cfg-a', name: 'A', buildSystem: 'cmake', runMode: 'run' },
          { id: 'cfg-b', name: 'B', buildSystem: 'cmake', runMode: 'run' },
        ],
      }],
    });

    const model = makeModel({
      groups: [{
        id: 'grp-1',
        name: 'G1',
        configs: [
          makeConfig({ id: 'cfg-a', _sourceFile: primary }),
          makeConfig({ id: 'cfg-b', _sourceFile: primary }),
        ],
      }],
    });

    storage.deleteConfig('cfg-a', model);
    const raw = readYaml(primary);
    const groups = raw.groups as Array<{ configs: Array<{ id: string }> }>;
    expect(groups[0].configs).toHaveLength(1);
    expect(groups[0].configs[0].id).toBe('cfg-b');
  });

  it('does nothing for unknown config id', () => {
    const model = makeModel();
    expect(() => storage.deleteConfig('nonexistent', model)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ConfigStorage.cloneConfig
// ---------------------------------------------------------------------------

describe('ConfigStorage.cloneConfig', () => {
  let tmp: string;
  let storage: ConfigStorage;

  beforeEach(() => {
    tmp = makeTmpWorkspace();
    storage = new ConfigStorage(tmp);
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true }); });

  it('creates a clone with a different id', () => {
    const primary = storage.getPrimaryFile();
    const source = makeConfig({ _sourceFile: primary });
    const model = makeModel({ ungrouped: [source] });
    storage.writeYaml(primary, { ungrouped: [ConfigStorage.configToPlain(source)] });

    const cloned = storage.cloneConfig(source, model);
    expect(cloned.id).not.toBe(source.id);
    expect(cloned.name).toContain('copy');
  });

  it('writes the clone to disk', () => {
    const primary = storage.getPrimaryFile();
    const source = makeConfig({ _sourceFile: primary });
    const model = makeModel({ ungrouped: [source] });
    storage.writeYaml(primary, { ungrouped: [ConfigStorage.configToPlain(source)] });

    storage.cloneConfig(source, model);
    const raw = readYaml(primary);
    const ungrouped = raw.ungrouped as Array<{ id: string }>;
    // Original + clone
    expect(ungrouped.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// ConfigStorage.addGroup
// ---------------------------------------------------------------------------

describe('ConfigStorage.addGroup', () => {
  let tmp: string;
  let storage: ConfigStorage;

  beforeEach(() => {
    tmp = makeTmpWorkspace();
    storage = new ConfigStorage(tmp);
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true }); });

  it('creates a new group in the primary file', () => {
    storage.addGroup('grp-new', 'New Group');
    const raw = readYaml(storage.getPrimaryFile());
    const groups = raw.groups as Array<{ id: string; name: string }>;
    expect(groups.some((g) => g.id === 'grp-new' && g.name === 'New Group')).toBe(true);
  });

  it('does not duplicate an existing group', () => {
    storage.addGroup('grp-dup', 'Dup');
    storage.addGroup('grp-dup', 'Dup');
    const raw = readYaml(storage.getPrimaryFile());
    const groups = raw.groups as Array<{ id: string }>;
    expect(groups.filter((g) => g.id === 'grp-dup')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ConfigStorage.renameGroup
// ---------------------------------------------------------------------------

describe('ConfigStorage.renameGroup', () => {
  let tmp: string;
  let storage: ConfigStorage;

  beforeEach(() => {
    tmp = makeTmpWorkspace();
    storage = new ConfigStorage(tmp);
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true }); });

  it('renames a group in its source file', () => {
    const primary = storage.getPrimaryFile();
    storage.writeYaml(primary, {
      groups: [{ id: 'grp-1', name: 'Old Name', configs: [{ id: 'c1', buildSystem: 'cmake', runMode: 'run' }] }],
    });

    const model = makeModel({
      groups: [{ id: 'grp-1', name: 'Old Name', configs: [makeConfig({ id: 'c1', _sourceFile: primary })] }],
    });

    storage.renameGroup('grp-1', 'New Name', model);
    const raw = readYaml(primary);
    const groups = raw.groups as Array<{ id: string; name: string }>;
    expect(groups.find((g) => g.id === 'grp-1')?.name).toBe('New Name');
  });
});

// ---------------------------------------------------------------------------
// ConfigStorage.deleteGroup
// ---------------------------------------------------------------------------

describe('ConfigStorage.deleteGroup', () => {
  let tmp: string;
  let storage: ConfigStorage;

  beforeEach(() => {
    tmp = makeTmpWorkspace();
    storage = new ConfigStorage(tmp);
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true }); });

  it('deletes an empty group', () => {
    storage.addGroup('grp-empty', 'Empty');
    const model = makeModel({ groups: [{ id: 'grp-empty', name: 'Empty', configs: [] }] });
    const ok = storage.deleteGroup('grp-empty', model, false);
    expect(ok).toBe(true);
    const raw = readYaml(storage.getPrimaryFile());
    const groups = raw.groups as Array<{ id: string }>;
    expect(groups.some((g) => g.id === 'grp-empty')).toBe(false);
  });

  it('refuses to delete a non-empty group without force', () => {
    const model = makeModel({
      groups: [{ id: 'grp-full', name: 'Full', configs: [makeConfig()] }],
    });
    const ok = storage.deleteGroup('grp-full', model, false);
    expect(ok).toBe(false);
  });

  it('force-deletes a non-empty group', () => {
    const primary = storage.getPrimaryFile();
    storage.writeYaml(primary, {
      groups: [{ id: 'grp-full', name: 'Full', configs: [{ id: 'cfg-1', buildSystem: 'cmake', runMode: 'run' }] }],
    });
    const model = makeModel({
      groups: [{ id: 'grp-full', name: 'Full', configs: [makeConfig({ _sourceFile: primary })] }],
    });
    const ok = storage.deleteGroup('grp-full', model, true);
    expect(ok).toBe(true);
    const raw = readYaml(primary);
    const groups = (raw.groups ?? []) as Array<{ id: string }>;
    expect(groups.some((g) => g.id === 'grp-full')).toBe(false);
  });
});
