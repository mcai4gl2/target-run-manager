import {
  buildMacroScope,
  resolveMacro,
  detectMacroCycles,
  expandMacrosInString,
  MacroCircularRefError,
} from '../../variables/macros';
import type { RunConfig, WorkspaceModel } from '../../model/config';

function makeModel(overrides: Partial<WorkspaceModel> = {}): WorkspaceModel {
  return {
    groups: [],
    ungrouped: [],
    settings: { macros: {} },
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

describe('macros', () => {
  describe('buildMacroScope', () => {
    it('includes project macros', () => {
      const model = makeModel({ settings: { macros: { PROJECT_VAR: 'project-value' } } });
      const config = makeConfig();
      const scope = buildMacroScope(config, model, {});
      expect(scope.projectMacros.PROJECT_VAR).toBe('project-value');
    });

    it('includes file macros from source file', () => {
      const fileMacros = new Map([['//file.yaml', { FILE_VAR: 'file-value' }]]);
      const model = makeModel({ fileMacros });
      const config = makeConfig({ _sourceFile: '//file.yaml' });
      const scope = buildMacroScope(config, model, {});
      expect(scope.fileMacros.FILE_VAR).toBe('file-value');
    });

    it('includes config-level macros', () => {
      const model = makeModel();
      const config = makeConfig({ macros: { CONFIG_VAR: 'config-value' } });
      const scope = buildMacroScope(config, model, {});
      expect(scope.configMacros.CONFIG_VAR).toBe('config-value');
    });

    it('includes builtins', () => {
      const model = makeModel();
      const config = makeConfig();
      const scope = buildMacroScope(config, model, { buildDir: '/build/debug' });
      expect(scope.builtins.buildDir).toBe('/build/debug');
    });
  });

  describe('scope priority', () => {
    it('config overrides file which overrides project', () => {
      const fileMacros = new Map([['//file.yaml', { X: 'file-value' }]]);
      const model = makeModel({
        settings: { macros: { X: 'project-value' } },
        fileMacros,
      });
      const config = makeConfig({
        macros: { X: 'config-value' },
        _sourceFile: '//file.yaml',
      });
      const scope = buildMacroScope(config, model, {});
      const warnings: never[] = [];
      const result = resolveMacro('X', scope, new Set(), warnings);
      expect(result).toBe('config-value');
    });

    it('file overrides project when no config macro', () => {
      const fileMacros = new Map([['//file.yaml', { X: 'file-value' }]]);
      const model = makeModel({
        settings: { macros: { X: 'project-value' } },
        fileMacros,
      });
      const config = makeConfig({ _sourceFile: '//file.yaml' });
      const scope = buildMacroScope(config, model, {});
      const warnings: never[] = [];
      const result = resolveMacro('X', scope, new Set(), warnings);
      expect(result).toBe('file-value');
    });

    it('project used when no config or file macro', () => {
      const model = makeModel({ settings: { macros: { X: 'project-value' } } });
      const config = makeConfig();
      const scope = buildMacroScope(config, model, {});
      const warnings: never[] = [];
      const result = resolveMacro('X', scope, new Set(), warnings);
      expect(result).toBe('project-value');
    });
  });

  describe('undefined macro warning', () => {
    it('warns and returns undefined for unknown macro', () => {
      const model = makeModel();
      const config = makeConfig();
      const scope = buildMacroScope(config, model, {});
      const warnings: { name: string; message: string }[] = [];
      const result = resolveMacro('UNDEFINED_VAR', scope, new Set(), warnings);
      expect(result).toBeUndefined();
      expect(warnings.some((w) => w.message.includes('UNDEFINED_VAR'))).toBe(true);
    });
  });

  describe('expandMacrosInString', () => {
    it('expands simple macro reference', () => {
      const scope = {
        configMacros: { NAME: 'world' },
        fileMacros: {},
        projectMacros: {},
        builtins: {},
      };
      const result = expandMacrosInString('Hello ${var:NAME}!', scope, new Set(), '__root__', []);
      expect(result).toBe('Hello world!');
    });

    it('leaves unknown macros unexpanded', () => {
      const scope = {
        configMacros: {},
        fileMacros: {},
        projectMacros: {},
        builtins: {},
      };
      const warnings: { name: string; message: string }[] = [];
      const result = expandMacrosInString('Hello ${var:UNKNOWN}!', scope, new Set(), '__root__', warnings);
      expect(result).toBe('Hello ${var:UNKNOWN}!');
    });

    it('expands nested macros', () => {
      const scope = {
        configMacros: { A: 'prefix-${var:B}', B: 'suffix' },
        fileMacros: {},
        projectMacros: {},
        builtins: {},
      };
      const result = expandMacrosInString('${var:A}', scope, new Set(), '__root__', []);
      expect(result).toBe('prefix-suffix');
    });
  });

  describe('cycle detection', () => {
    it('detectMacroCycles finds cycles', () => {
      const cycle = detectMacroCycles({ A: '${var:B}', B: '${var:A}' });
      expect(cycle).not.toBeNull();
    });

    it('detectMacroCycles returns null for no cycles', () => {
      const cycle = detectMacroCycles({ A: 'hello', B: '${var:A} world' });
      expect(cycle).toBeNull();
    });

    it('throws MacroCircularRefError on cycle expansion', () => {
      const scope = {
        configMacros: { A: '${var:B}', B: '${var:A}' },
        fileMacros: {},
        projectMacros: {},
        builtins: {},
      };
      expect(() => {
        expandMacrosInString('${var:A}', scope, new Set(), '__root__', []);
      }).toThrow(MacroCircularRefError);
    });
  });
});
