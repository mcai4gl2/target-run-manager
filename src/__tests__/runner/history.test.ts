import { RunHistoryManager, finishRecord } from '../../runner/history';
import type { RunHistoryEntry } from '../../model/config';

function makeEntry(overrides: Partial<RunHistoryEntry> = {}): RunHistoryEntry {
  return {
    configId: 'cfg-test',
    configName: 'Test Config',
    startedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RunHistoryManager
// ---------------------------------------------------------------------------

describe('RunHistoryManager', () => {
  it('starts empty', () => {
    const mgr = new RunHistoryManager();
    expect(mgr.size).toBe(0);
    expect(mgr.getAll()).toEqual([]);
  });

  it('stores an entry after add()', () => {
    const mgr = new RunHistoryManager();
    const entry = makeEntry();
    mgr.add(entry);
    expect(mgr.size).toBe(1);
    expect(mgr.getAll()).toContainEqual(entry);
  });

  it('stores entries newest-first', () => {
    const mgr = new RunHistoryManager();
    const older = makeEntry({ configName: 'older' });
    const newer = makeEntry({ configName: 'newer' });
    mgr.add(older);
    mgr.add(newer);
    expect(mgr.getAll()[0].configName).toBe('newer');
    expect(mgr.getAll()[1].configName).toBe('older');
  });

  it('trims to maxEntries', () => {
    const mgr = new RunHistoryManager(3);
    for (let i = 0; i < 5; i++) {
      mgr.add(makeEntry({ configName: `run-${i}` }));
    }
    expect(mgr.size).toBe(3);
  });

  it('keeps the newest entries after trim', () => {
    const mgr = new RunHistoryManager(2);
    mgr.add(makeEntry({ configName: 'first' }));
    mgr.add(makeEntry({ configName: 'second' }));
    mgr.add(makeEntry({ configName: 'third' }));
    const names = mgr.getAll().map((e) => e.configName);
    expect(names).toContain('third');
    expect(names).toContain('second');
    expect(names).not.toContain('first');
  });

  it('getRecent returns at most n entries', () => {
    const mgr = new RunHistoryManager();
    for (let i = 0; i < 10; i++) {
      mgr.add(makeEntry({ configName: `run-${i}` }));
    }
    expect(mgr.getRecent(3)).toHaveLength(3);
  });

  it('getRecent returns all when n >= size', () => {
    const mgr = new RunHistoryManager();
    mgr.add(makeEntry());
    mgr.add(makeEntry());
    expect(mgr.getRecent(100)).toHaveLength(2);
  });

  it('clear() empties the history', () => {
    const mgr = new RunHistoryManager();
    mgr.add(makeEntry());
    mgr.clear();
    expect(mgr.size).toBe(0);
  });

  it('getAll() returns a copy — mutations do not affect internal state', () => {
    const mgr = new RunHistoryManager();
    mgr.add(makeEntry());
    const copy = mgr.getAll();
    copy.push(makeEntry({ configName: 'injected' }));
    expect(mgr.size).toBe(1);
  });

  it('getByConfigId returns only entries for that id', () => {
    const mgr = new RunHistoryManager();
    mgr.add(makeEntry({ configId: 'a', configName: 'A' }));
    mgr.add(makeEntry({ configId: 'b', configName: 'B' }));
    mgr.add(makeEntry({ configId: 'a', configName: 'A2' }));
    const aEntries = mgr.getByConfigId('a');
    expect(aEntries).toHaveLength(2);
    expect(aEntries.every((e) => e.configId === 'a')).toBe(true);
  });

  it('uses DEFAULT_MAX_ENTRIES when not specified', () => {
    expect(RunHistoryManager.DEFAULT_MAX_ENTRIES).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// finishRecord
// ---------------------------------------------------------------------------

describe('finishRecord', () => {
  it('stamps exitCode and durationMs', () => {
    const started = new Date(Date.now() - 100);
    const record = {
      configId: 'cfg-x',
      configName: 'X',
      startedAt: started,
    };
    const entry = finishRecord(record, 0);
    expect(entry.exitCode).toBe(0);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('preserves configId and configName', () => {
    const record = { configId: 'cfg-x', configName: 'X', startedAt: new Date() };
    const entry = finishRecord(record);
    expect(entry.configId).toBe('cfg-x');
    expect(entry.configName).toBe('X');
  });

  it('accepts undefined exitCode', () => {
    const record = { configId: 'x', configName: 'X', startedAt: new Date() };
    const entry = finishRecord(record);
    expect(entry.exitCode).toBeUndefined();
  });
});
