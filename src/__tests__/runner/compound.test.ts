import { resolveCompoundConfigs, executeCompound } from '../../runner/compound';
import type { CompoundConfig, WorkspaceModel, RunConfig, Group } from '../../model/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(
  ungrouped: RunConfig[] = [],
  groups: Group[] = [],
): WorkspaceModel {
  return {
    groups,
    ungrouped,
    compounds: [],
    settings: {},
    fileMacros: new Map(),
  };
}

function makeRC(id: string, name = id): RunConfig {
  return { id, name, buildSystem: 'cmake', runMode: 'run' };
}

function makeCompound(
  configs: string[],
  order: 'sequential' | 'parallel' = 'sequential',
): CompoundConfig {
  return { id: 'cmp-1', name: 'Test Compound', configs, order };
}

// ---------------------------------------------------------------------------
// resolveCompoundConfigs
// ---------------------------------------------------------------------------

describe('resolveCompoundConfigs', () => {
  it('resolves configs from ungrouped', () => {
    const rc = makeRC('cfg-a');
    const model = makeModel([rc]);
    const result = resolveCompoundConfigs(makeCompound(['cfg-a']), model);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cfg-a');
  });

  it('resolves configs from groups', () => {
    const rc = makeRC('cfg-b');
    const model = makeModel([], [{ id: 'grp-1', name: 'G', configs: [rc] }]);
    const result = resolveCompoundConfigs(makeCompound(['cfg-b']), model);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cfg-b');
  });

  it('silently omits unknown config ids', () => {
    const model = makeModel([makeRC('cfg-a')]);
    const result = resolveCompoundConfigs(makeCompound(['cfg-a', 'no-such-id']), model);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when all ids are unknown', () => {
    const model = makeModel();
    const result = resolveCompoundConfigs(makeCompound(['x', 'y']), model);
    expect(result).toEqual([]);
  });

  it('returns configs in the order listed in the compound', () => {
    const model = makeModel([makeRC('cfg-b'), makeRC('cfg-a')]);
    const result = resolveCompoundConfigs(makeCompound(['cfg-a', 'cfg-b']), model);
    expect(result[0].id).toBe('cfg-a');
    expect(result[1].id).toBe('cfg-b');
  });
});

// ---------------------------------------------------------------------------
// executeCompound
// ---------------------------------------------------------------------------

describe('executeCompound — sequential', () => {
  it('calls executeOne for each config id in order', async () => {
    const called: string[] = [];
    await executeCompound(
      makeCompound(['a', 'b', 'c'], 'sequential'),
      async (id) => { called.push(id); },
    );
    expect(called).toEqual(['a', 'b', 'c']);
  });

  it('waits for each config before starting the next', async () => {
    const order: string[] = [];
    await executeCompound(
      makeCompound(['first', 'second'], 'sequential'),
      async (id) => {
        await new Promise<void>((r) => setTimeout(r, id === 'first' ? 10 : 0));
        order.push(id);
      },
    );
    expect(order).toEqual(['first', 'second']);
  });

  it('executes with no configs without error', async () => {
    await expect(
      executeCompound(makeCompound([], 'sequential'), async () => {}),
    ).resolves.toBeUndefined();
  });
});

describe('executeCompound — parallel', () => {
  it('calls executeOne for every config id', async () => {
    const called = new Set<string>();
    await executeCompound(
      makeCompound(['x', 'y', 'z'], 'parallel'),
      async (id) => { called.add(id); },
    );
    expect(called).toEqual(new Set(['x', 'y', 'z']));
  });

  it('runs all in parallel (completes faster than sequential with delays)', async () => {
    const started: number[] = [];
    const start = Date.now();
    await executeCompound(
      makeCompound(['a', 'b'], 'parallel'),
      async () => {
        started.push(Date.now() - start);
        await new Promise<void>((r) => setTimeout(r, 30));
      },
    );
    // Both should have started within a short window of each other
    const gap = Math.abs(started[1] - started[0]);
    expect(gap).toBeLessThan(20);
  });
});
