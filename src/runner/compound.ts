/**
 * Compound config execution — runs multiple RunConfigs sequentially or in parallel.
 */

import type { CompoundConfig, RunConfig, WorkspaceModel } from '../model/config';

/**
 * Collect all RunConfig objects referenced by a CompoundConfig.
 * Config IDs that are not found in the model are silently omitted — the caller
 * will skip missing configs rather than throwing.
 */
export function resolveCompoundConfigs(
  compound: CompoundConfig,
  model: WorkspaceModel,
): RunConfig[] {
  const allConfigs: RunConfig[] = [
    ...model.ungrouped,
    ...model.groups.flatMap((g) => g.configs),
  ];

  return compound.configs
    .map((id) => allConfigs.find((c) => c.id === id))
    .filter((c): c is RunConfig => c !== undefined);
}

/**
 * Execute a compound config by calling `executeOne` for each referenced
 * config ID.  Unknown IDs are silently skipped.
 *
 * @param compound     - The compound config to execute.
 * @param executeOne   - Async callback that runs a single config by ID.
 */
export async function executeCompound(
  compound: CompoundConfig,
  executeOne: (configId: string) => Promise<void>,
): Promise<void> {
  if (compound.order === 'parallel') {
    await Promise.all(compound.configs.map((id) => executeOne(id)));
  } else {
    for (const id of compound.configs) {
      await executeOne(id);
    }
  }
}
