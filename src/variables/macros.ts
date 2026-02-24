/**
 * Macro scope resolution for ${var:NAME} references.
 *
 * Priority (highest to lowest):
 *   1. Config-level macros (config.macros)
 *   2. File/component macros (settings.macros from the config's source file)
 *   3. Project macros (settings.macros from root settings)
 *   4. Built-in extension vars (computed at runtime)
 *   5. VS Code standard vars (passed through)
 *
 * Circular reference detection: throws MacroCircularRefError.
 */

import type { RunConfig, WorkspaceModel } from '../model/config';

export class MacroCircularRefError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular macro reference detected: ${cycle.join(' → ')}`);
    this.name = 'MacroCircularRefError';
  }
}

export interface MacroWarning {
  name: string;
  message: string;
}

export interface MacroScope {
  configMacros: Record<string, string>;
  fileMacros: Record<string, string>;
  projectMacros: Record<string, string>;
  builtins: Record<string, string>;
}

/** Build the macro scope for a specific config. */
export function buildMacroScope(
  config: RunConfig,
  model: WorkspaceModel,
  builtins: Record<string, string>,
): MacroScope {
  // Project-level macros from merged settings
  const projectMacros = model.settings.macros ?? {};

  // File/component-level macros from the file that defined this config
  const fileMacros = config._sourceFile
    ? (model.fileMacros.get(config._sourceFile) ?? {})
    : {};

  // Config-level macros
  const configMacros = config.macros ?? {};

  return { configMacros, fileMacros, projectMacros, builtins };
}

/**
 * Resolve the value of a user macro (${var:NAME}).
 * Applies scope priority. Returns undefined if not found.
 * Warns if the macro is undefined.
 */
export function resolveMacro(
  name: string,
  scope: MacroScope,
  visiting: Set<string>,
  warnings: MacroWarning[],
): string | undefined {
  // Check all scopes in priority order
  const value =
    scope.configMacros[name] ??
    scope.fileMacros[name] ??
    scope.projectMacros[name] ??
    scope.builtins[name];

  if (value === undefined) {
    warnings.push({ name, message: `Undefined macro "${name}" — left unexpanded` });
    return undefined;
  }

  // Expand nested macros within the resolved value
  return expandMacrosInString(value, scope, visiting, name, warnings);
}

/**
 * Expand all ${var:NAME} references in a string.
 * Tracks visited names to detect cycles.
 */
export function expandMacrosInString(
  input: string,
  scope: MacroScope,
  visiting: Set<string>,
  currentName: string,
  warnings: MacroWarning[],
): string {
  return input.replace(/\$\{var:([^}]+)\}/g, (_match, name: string) => {
    if (visiting.has(name)) {
      // Cycle detected
      const cycle = [...visiting, name];
      throw new MacroCircularRefError(cycle);
    }

    const childVisiting = new Set(visiting);
    childVisiting.add(currentName);

    const resolved = resolveMacro(name, scope, childVisiting, warnings);
    return resolved !== undefined ? resolved : `\${var:${name}}`;
  });
}

/**
 * Detect circular macro references in a scope.
 * Returns the cycle path if found, or null.
 */
export function detectMacroCycles(
  macros: Record<string, string>,
): string[] | null {
  for (const name of Object.keys(macros)) {
    try {
      const visited = new Set<string>([name]);
      expandMacrosInString(macros[name], {
        configMacros: macros,
        fileMacros: {},
        projectMacros: {},
        builtins: {},
      }, visited, name, []);
    } catch (e) {
      if (e instanceof MacroCircularRefError) {
        return e.cycle;
      }
    }
  }
  return null;
}
