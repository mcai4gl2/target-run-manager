/**
 * Entry point for variable expansion.
 *
 * Expands all ${...} and ${var:...} references in a value (string, array, or object).
 * Applied lazily at run time.
 *
 * Expansion order (applied left-to-right in a single pass):
 *   ${var:NAME}       → user macro (see macros.ts for scope resolution)
 *   ${buildDir}       → built-in (from builtins.ts)
 *   ${targetBinary}   → built-in
 *   ${preset}         → built-in
 *   ${date}           → built-in
 *   ${datetime}       → built-in
 *   ${gitBranch}      → built-in
 *   ${gitHash}        → built-in
 *   ${workspaceFolder}, ${env:VAR}, ${input:id} → passed through to VS Code
 */

import type { RunConfig, WorkspaceModel } from '../model/config';
import { computeBuiltins, type BuiltinContext } from './builtins';
import { buildMacroScope, expandMacrosInString, type MacroWarning } from './macros';

export interface ExpandOptions {
  config: RunConfig;
  model: WorkspaceModel;
  builtinContext: BuiltinContext;
}

export interface ExpandResult {
  warnings: MacroWarning[];
}

/**
 * Expand a single string value.
 * Returns the expanded string and any warnings.
 */
export function expandString(
  value: string,
  options: ExpandOptions,
  warnings: MacroWarning[],
): string {
  const builtins = computeBuiltins(options.builtinContext);
  const scope = buildMacroScope(options.config, options.model, builtins);

  // First expand ${var:NAME} references
  let result = expandMacrosInString(value, scope, new Set(), '__root__', warnings);

  // Then expand built-in vars
  result = result.replace(/\$\{([^:}]+)\}/g, (match, name: string) => {
    if (builtins[name] !== undefined) {
      return builtins[name];
    }
    // Leave VS Code vars and unknown vars as-is
    return match;
  });

  return result;
}

/**
 * Recursively expand all string values in an object, array, or string.
 * Returns the expanded value (mutates a copy).
 */
export function expandValue(
  value: unknown,
  options: ExpandOptions,
  warnings: MacroWarning[],
): unknown {
  if (typeof value === 'string') {
    return expandString(value, options, warnings);
  }

  if (Array.isArray(value)) {
    return value.map((item) => expandValue(item, options, warnings));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = expandValue(val, options, warnings);
    }
    return result;
  }

  return value;
}

/**
 * Expand all variable references in a RunConfig's string fields.
 * Returns the expanded config (original is not mutated).
 */
export function expandConfig(
  config: RunConfig,
  model: WorkspaceModel,
  builtinContext: BuiltinContext,
): { expanded: RunConfig; warnings: MacroWarning[] } {
  const warnings: MacroWarning[] = [];
  const options: ExpandOptions = { config, model, builtinContext };

  const expanded: RunConfig = {
    ...config,
    args: config.args?.map((a) => expandString(a, options, warnings)),
    env: config.env
      ? Object.fromEntries(
          Object.entries(config.env).map(([k, v]) => [k, expandString(v, options, warnings)])
        )
      : undefined,
    cwd: config.cwd ? expandString(config.cwd, options, warnings) : undefined,
    binaryOverride: config.binaryOverride
      ? expandString(config.binaryOverride, options, warnings)
      : undefined,
    sourceScripts: config.sourceScripts?.map((s) => expandString(s, options, warnings)),
  };

  if (config.analyzeConfig) {
    expanded.analyzeConfig = {
      ...config.analyzeConfig,
      outputDir: config.analyzeConfig.outputDir
        ? expandString(config.analyzeConfig.outputDir, options, warnings)
        : undefined,
      binaryOverride: config.analyzeConfig.binaryOverride
        ? expandString(config.analyzeConfig.binaryOverride, options, warnings)
        : undefined,
      postProcess: config.analyzeConfig.postProcess
        ? expandString(config.analyzeConfig.postProcess, options, warnings)
        : undefined,
      toolArgs: config.analyzeConfig.toolArgs?.map((a) => expandString(a, options, warnings)),
    };
  }

  return { expanded, warnings };
}
