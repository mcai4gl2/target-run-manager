/**
 * DevContainer support — Docker exec wrapping for run/test/analyze commands.
 *
 * Auto-detect: checks IN_DEV_CONTAINER / REMOTE_CONTAINERS env vars then
 * queries `docker ps` to find the running container ID.
 *
 * All providers use this module; it is injected into Runner so tests can
 * supply a pre-configured manager without spawning Docker.
 */

import { execSync } from 'child_process';

export interface ContainerInfo {
  id: string;
  name: string;
}

/**
 * Returns true when the process is running inside a VS Code Dev Container
 * (set by the Remote - Containers extension) or when REMOTE_CONTAINERS is set.
 */
export function isInsideDevContainer(): boolean {
  return (
    process.env['IN_DEV_CONTAINER'] === 'true' ||
    process.env['REMOTE_CONTAINERS'] === 'true'
  );
}

/**
 * List running Docker containers, optionally filtered by name substring.
 * Returns an empty array if Docker is unavailable or times out.
 */
export function findRunningContainers(nameFilter?: string): ContainerInfo[] {
  try {
    const out = execSync('docker ps --format "{{.ID}} {{.Names}}"', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const id = parts[0];
        const name = parts.slice(1).join(' ');
        return { id, name };
      })
      .filter((c) => !nameFilter || c.name.includes(nameFilter));
  } catch {
    return [];
  }
}

/**
 * Wrap a shell command so it runs inside a Docker container via `docker exec`.
 * Single quotes inside the command are escaped so the outer `bash -c '...'`
 * quoting remains valid.
 */
export function wrapWithDockerExec(
  command: string,
  containerId: string,
  workdir: string,
  user = 'vscode',
): string {
  const escaped = command.replace(/'/g, "'\\''");
  return `docker exec -u ${user} -w ${workdir} ${containerId} bash -c '${escaped}'`;
}

/**
 * Manages DevContainer state for a single extension session.
 *
 * Usage:
 *   const mgr = new DevContainerManager();
 *   await mgr.detect();          // auto-detects via docker ps
 *   mgr.wrapCommand(cmd, cwd);   // wraps if active, otherwise returns cmd
 */
export class DevContainerManager {
  private info: ContainerInfo | undefined;

  /**
   * Manually set the container (useful for tests or explicit user config).
   */
  setContainer(info: ContainerInfo): void {
    this.info = info;
  }

  /**
   * Auto-detect a running Dev Container.
   * Checks env vars first, then queries `docker ps`.
   * @param nameFilter  Optional substring to match against container names.
   */
  async detect(nameFilter?: string): Promise<boolean> {
    if (isInsideDevContainer()) {
      const containers = findRunningContainers(nameFilter);
      this.info = containers[0];
      return !!this.info;
    }
    return false;
  }

  /** True when a container has been detected or set. */
  get isActive(): boolean {
    return !!this.info;
  }

  /** The short container ID, or undefined when not active. */
  get containerId(): string | undefined {
    return this.info?.id;
  }

  /** The container name, or undefined when not active. */
  get containerName(): string | undefined {
    return this.info?.name;
  }

  /**
   * Wrap a command for execution inside the container.
   * Returns the original command unchanged when DevContainer is not active.
   */
  wrapCommand(command: string, workdir: string): string {
    if (!this.info) {
      return command;
    }
    return wrapWithDockerExec(command, this.info.id, workdir);
  }
}
