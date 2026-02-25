/**
 * Run history manager — tracks the last N runs with metadata.
 *
 * Entries are stored newest-first so getRecent(n) is O(1).
 * The manager is in-memory only; persistence (e.g. to workspace state) is
 * wired in the extension entry point by serialising/deserialising via
 * getAll() / add().
 */

import type { RunHistoryEntry } from '../model/config';

export class RunHistoryManager {
  static readonly DEFAULT_MAX_ENTRIES = 50;

  private entries: RunHistoryEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = RunHistoryManager.DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /**
   * Record a completed run.  The entry is prepended (newest first) and the
   * list is trimmed to maxEntries.
   */
  add(entry: RunHistoryEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
  }

  /** Return a shallow copy of all entries (newest first). */
  getAll(): RunHistoryEntry[] {
    return [...this.entries];
  }

  /**
   * Return the most recent n entries.
   * If n >= size, returns all entries.
   */
  getRecent(n: number): RunHistoryEntry[] {
    return this.entries.slice(0, n);
  }

  /** Remove all history entries. */
  clear(): void {
    this.entries = [];
  }

  /** Number of stored entries. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Find all entries for a given config id (newest first).
   */
  getByConfigId(configId: string): RunHistoryEntry[] {
    return this.entries.filter((e) => e.configId === configId);
  }
}

// ---------------------------------------------------------------------------
// Helper — build an entry from a start time, recording duration at end
// ---------------------------------------------------------------------------

export interface RunRecord {
  configId: string;
  configName: string;
  startedAt: Date;
  buildStatus?: RunHistoryEntry['buildStatus'];
}

/** Complete a run record by stamping exitCode and durationMs. */
export function finishRecord(
  record: RunRecord,
  exitCode?: number,
): RunHistoryEntry {
  return {
    ...record,
    exitCode,
    durationMs: Date.now() - record.startedAt.getTime(),
  };
}
