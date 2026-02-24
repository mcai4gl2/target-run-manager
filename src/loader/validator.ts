/**
 * Validates the merged WorkspaceModel.
 * Returns warnings and errors (non-fatal and fatal issues).
 */

import type { WorkspaceModel, RunConfig, RunMode, BuildSystem } from '../model/config';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  configId?: string;
  message: string;
}

const VALID_BUILD_SYSTEMS: BuildSystem[] = ['cmake', 'bazel', 'manual'];
const VALID_RUN_MODES: RunMode[] = ['run', 'debug', 'test', 'analyze', 'coverage'];

export function validateModel(model: WorkspaceModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allConfigs = [
    ...model.ungrouped,
    ...model.groups.flatMap((g) => g.configs),
  ];

  for (const config of allConfigs) {
    issues.push(...validateConfig(config));
  }

  return issues;
}

function validateConfig(config: RunConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const id = config.id;

  if (!config.name) {
    issues.push({ severity: 'warning', configId: id, message: `Config "${id}": missing "name" field` });
  }

  if (!config.buildSystem) {
    issues.push({ severity: 'error', configId: id, message: `Config "${id}": missing required "buildSystem" field` });
  } else if (!VALID_BUILD_SYSTEMS.includes(config.buildSystem)) {
    issues.push({
      severity: 'error',
      configId: id,
      message: `Config "${id}": invalid buildSystem "${config.buildSystem}". Must be one of: ${VALID_BUILD_SYSTEMS.join(', ')}`,
    });
  }

  if (!config.runMode) {
    issues.push({ severity: 'error', configId: id, message: `Config "${id}": missing required "runMode" field` });
  } else if (!VALID_RUN_MODES.includes(config.runMode)) {
    issues.push({
      severity: 'error',
      configId: id,
      message: `Config "${id}": invalid runMode "${config.runMode}". Must be one of: ${VALID_RUN_MODES.join(', ')}`,
    });
  }

  // Manual configs must have a binaryOverride
  if (config.buildSystem === 'manual' && !config.binaryOverride) {
    issues.push({
      severity: 'error',
      configId: id,
      message: `Config "${id}": buildSystem is "manual" but "binaryOverride" is not set`,
    });
  }

  // Analyze mode requires analyzeConfig
  if (config.runMode === 'analyze' && !config.analyzeConfig) {
    issues.push({
      severity: 'warning',
      configId: id,
      message: `Config "${id}": runMode is "analyze" but "analyzeConfig" is not set`,
    });
  }

  if (config.analyzeConfig) {
    if (!config.analyzeConfig.tool) {
      issues.push({
        severity: 'error',
        configId: id,
        message: `Config "${id}": analyzeConfig is missing required "tool" field`,
      });
    }
  }

  return issues;
}
