/**
 * Watches the config directory and fallback files for changes.
 * Triggers a reload callback when any config file is added, modified, or deleted.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_DIR, FALLBACK_YAML, FALLBACK_YML, FALLBACK_JSON } from './discovery';

export interface ConfigWatcher {
  dispose(): void;
}

/**
 * Watch for config file changes in the workspace.
 * Debounces rapid changes (multiple saves) with a 300ms delay.
 *
 * @param workspaceRoot - absolute path to workspace root
 * @param onChanged - callback invoked when config files change
 * @returns a disposable that stops watching
 */
export function watchConfigFiles(
  workspaceRoot: string,
  onChanged: () => void,
): ConfigWatcher {
  const watchers: fs.FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const trigger = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(onChanged, 300);
  };

  // Watch config directory if it exists
  const configDir = path.join(workspaceRoot, CONFIG_DIR);
  if (fs.existsSync(configDir)) {
    try {
      const watcher = fs.watch(configDir, { recursive: true }, (_event, filename) => {
        if (!filename) {
          return;
        }
        const ext = path.extname(filename).toLowerCase();
        if (['.yaml', '.yml', '.json'].includes(ext)) {
          trigger();
        }
      });
      watchers.push(watcher);
    } catch {
      // Config dir may not support recursive watching on all platforms
    }
  }

  // Watch fallback files
  for (const fallback of [FALLBACK_YAML, FALLBACK_YML, FALLBACK_JSON]) {
    const p = path.join(workspaceRoot, fallback);
    if (fs.existsSync(p)) {
      try {
        const watcher = fs.watch(p, trigger);
        watchers.push(watcher);
      } catch {
        // File may not be watchable
      }
    }
  }

  return {
    dispose() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // ignore
        }
      }
    },
  };
}
