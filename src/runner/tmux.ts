/**
 * Tmux integration — builds a shell command that launches a tmux session
 * with one pane per process, all running in parallel.
 */

import { execSync } from 'child_process';

/** Returns true if `tmux` is on PATH and responsive. */
export function isTmuxAvailable(): boolean {
  try {
    execSync('tmux -V', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a single shell command that:
 *  1. Kills any existing tmux session with the same name (idempotent).
 *  2. Creates a new detached session running commands[0] in the first pane.
 *  3. Splits a new pane for each subsequent command.
 *  4. Applies the requested layout (skipped for a single command).
 *  5. Attaches to the session so the VS Code terminal shows tmux output.
 *
 * Returns an empty string if `commands` is empty.
 */
export function buildTmuxCommand(
  sessionName: string,
  commands: string[],
  layout: string = 'tiled',
): string {
  if (commands.length === 0) { return ''; }

  const safe = sessionName.replace(/[^a-zA-Z0-9_-]/g, '_');

  const parts: string[] = [
    `tmux kill-session -t ${safe} 2>/dev/null || true`,
    `tmux new-session -d -s ${safe} ${tmuxQuote(commands[0])}`,
    ...commands.slice(1).map((cmd) => `tmux split-window -t ${safe} ${tmuxQuote(cmd)}`),
  ];

  if (commands.length > 1) {
    parts.push(`tmux select-layout -t ${safe} ${layout}`);
  }

  parts.push(`tmux attach-session -t ${safe}`);

  return parts.join(' && ');
}

/** Wrap a shell command in single quotes, escaping any interior single quotes. */
function tmuxQuote(cmd: string): string {
  return `'${cmd.replace(/'/g, "'\\''")}'`;
}
