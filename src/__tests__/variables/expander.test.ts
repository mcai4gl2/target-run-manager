import { expandString, expandValue, expandConfig } from '../../variables/expander';
import type { RunConfig, WorkspaceModel } from '../../model/config';

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

function makeConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    id: 'cfg-test',
    name: 'Test',
    buildSystem: 'cmake',
    runMode: 'run',
    ...overrides,
  };
}

describe('expander', () => {
  const workspaceFolder = '/workspace';

  describe('expandString', () => {
    it('expands ${var:NAME} from config macros', () => {
      const config = makeConfig({ macros: { MY_VAR: 'hello' } });
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder } };
      const result = expandString('prefix-${var:MY_VAR}-suffix', opts, []);
      expect(result).toBe('prefix-hello-suffix');
    });

    it('expands ${date} builtin', () => {
      const config = makeConfig();
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder } };
      const result = expandString('date-${date}', opts, []);
      expect(result).toMatch(/^date-\d{4}-\d{2}-\d{2}$/);
    });

    it('expands ${buildDir} builtin', () => {
      const config = makeConfig({ buildConfig: 'debug' });
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder, buildConfig: 'debug' } };
      const result = expandString('${buildDir}', opts, []);
      expect(result).toBe('/workspace/build/debug');
    });

    it('passes through ${workspaceFolder}', () => {
      const config = makeConfig();
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder } };
      const result = expandString('${workspaceFolder}/data', opts, []);
      // workspaceFolder is not a builtin — passes through
      expect(result).toBe('${workspaceFolder}/data');
    });

    it('collects warnings for undefined macros', () => {
      const config = makeConfig();
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder } };
      const warnings: { name: string; message: string }[] = [];
      const result = expandString('${var:UNKNOWN}', opts, warnings);
      expect(result).toBe('${var:UNKNOWN}');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('expandValue', () => {
    it('expands string', () => {
      const config = makeConfig({ macros: { V: 'val' } });
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder } };
      expect(expandValue('${var:V}', opts, [])).toBe('val');
    });

    it('expands array elements', () => {
      const config = makeConfig({ macros: { X: 'expanded' } });
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder } };
      const result = expandValue(['prefix', '${var:X}', 'suffix'], opts, []);
      expect(result).toEqual(['prefix', 'expanded', 'suffix']);
    });

    it('expands nested object values', () => {
      const config = makeConfig({ macros: { PORT: '8080' } });
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder } };
      const result = expandValue({ key: '${var:PORT}', nested: { deep: '${var:PORT}' } }, opts, []);
      expect(result).toEqual({ key: '8080', nested: { deep: '8080' } });
    });

    it('passes through non-string scalars', () => {
      const config = makeConfig();
      const model = makeModel();
      const opts = { config, model, builtinContext: { workspaceFolder } };
      expect(expandValue(42, opts, [])).toBe(42);
      expect(expandValue(true, opts, [])).toBe(true);
      expect(expandValue(null, opts, [])).toBeNull();
    });
  });

  describe('expandConfig', () => {
    it('expands args', () => {
      const config = makeConfig({
        macros: { FILTER: 'MyTest*' },
        args: ['--filter', '${var:FILTER}'],
      });
      const model = makeModel();
      const { expanded } = expandConfig(config, model, { workspaceFolder });
      expect(expanded.args).toEqual(['--filter', 'MyTest*']);
    });

    it('expands env values', () => {
      const config = makeConfig({
        macros: { DATA_DIR: '/mnt/data' },
        env: { DATA: '${var:DATA_DIR}', PLAIN: 'plain' },
      });
      const model = makeModel();
      const { expanded } = expandConfig(config, model, { workspaceFolder });
      expect(expanded.env?.DATA).toBe('/mnt/data');
      expect(expanded.env?.PLAIN).toBe('plain');
    });

    it('expands cwd', () => {
      const config = makeConfig({
        macros: { WD: '/my/dir' },
        cwd: '${var:WD}',
      });
      const model = makeModel();
      const { expanded } = expandConfig(config, model, { workspaceFolder });
      expect(expanded.cwd).toBe('/my/dir');
    });

    it('expands binaryOverride', () => {
      const config = makeConfig({
        macros: { BIN: '/opt/bin/app' },
        binaryOverride: '${var:BIN}',
        buildSystem: 'manual',
      });
      const model = makeModel();
      const { expanded } = expandConfig(config, model, { workspaceFolder });
      expect(expanded.binaryOverride).toBe('/opt/bin/app');
    });

    it('expands sourceScripts', () => {
      const config = makeConfig({
        macros: { ROOT: '/env' },
        sourceScripts: ['${var:ROOT}/dev.sh'],
      });
      const model = makeModel();
      const { expanded } = expandConfig(config, model, { workspaceFolder });
      expect(expanded.sourceScripts).toEqual(['/env/dev.sh']);
    });

    it('expands analyzeConfig fields', () => {
      const config = makeConfig({
        macros: { OUT: '/output' },
        runMode: 'analyze',
        analyzeConfig: {
          tool: 'valgrind',
          outputDir: '${var:OUT}/valgrind',
          postProcess: 'open ${var:OUT}/valgrind/report.xml',
        },
      });
      const model = makeModel();
      const { expanded } = expandConfig(config, model, { workspaceFolder });
      expect(expanded.analyzeConfig?.outputDir).toBe('/output/valgrind');
      expect(expanded.analyzeConfig?.postProcess).toBe('open /output/valgrind/report.xml');
    });

    it('does not mutate original config', () => {
      const config = makeConfig({
        macros: { X: 'replaced' },
        args: ['${var:X}'],
      });
      const model = makeModel();
      expandConfig(config, model, { workspaceFolder });
      // Original config unchanged
      expect(config.args?.[0]).toBe('${var:X}');
    });
  });
});
