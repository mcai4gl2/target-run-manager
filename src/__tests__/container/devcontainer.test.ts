// Must be before the module import so jest.mock() hoisting applies
jest.mock('child_process', () => ({ execSync: jest.fn() }));

import {
  isInsideDevContainer,
  wrapWithDockerExec,
  DevContainerManager,
  findRunningContainers,
} from '../../container/devcontainer';

import { execSync } from 'child_process';
const mockExecSync = execSync as jest.Mock;

// ---------------------------------------------------------------------------
// isInsideDevContainer
// ---------------------------------------------------------------------------

describe('isInsideDevContainer', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv['IN_DEV_CONTAINER'] = process.env['IN_DEV_CONTAINER'];
    savedEnv['REMOTE_CONTAINERS'] = process.env['REMOTE_CONTAINERS'];
    delete process.env['IN_DEV_CONTAINER'];
    delete process.env['REMOTE_CONTAINERS'];
  });

  afterEach(() => {
    if (savedEnv['IN_DEV_CONTAINER'] === undefined) {
      delete process.env['IN_DEV_CONTAINER'];
    } else {
      process.env['IN_DEV_CONTAINER'] = savedEnv['IN_DEV_CONTAINER'];
    }
    if (savedEnv['REMOTE_CONTAINERS'] === undefined) {
      delete process.env['REMOTE_CONTAINERS'];
    } else {
      process.env['REMOTE_CONTAINERS'] = savedEnv['REMOTE_CONTAINERS'];
    }
  });

  it('returns true when IN_DEV_CONTAINER=true', () => {
    process.env['IN_DEV_CONTAINER'] = 'true';
    expect(isInsideDevContainer()).toBe(true);
  });

  it('returns true when REMOTE_CONTAINERS=true', () => {
    process.env['REMOTE_CONTAINERS'] = 'true';
    expect(isInsideDevContainer()).toBe(true);
  });

  it('returns false when neither variable is set', () => {
    expect(isInsideDevContainer()).toBe(false);
  });

  it('returns false when IN_DEV_CONTAINER has non-true value', () => {
    process.env['IN_DEV_CONTAINER'] = '1';
    expect(isInsideDevContainer()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// wrapWithDockerExec
// ---------------------------------------------------------------------------

describe('wrapWithDockerExec', () => {
  it('wraps command with docker exec prefix', () => {
    const result = wrapWithDockerExec('/bin/my_app --arg', 'abc123', '/workspaces/proj');
    expect(result).toContain('docker exec');
    expect(result).toContain('abc123');
    expect(result).toContain('/workspaces/proj');
    expect(result).toContain('/bin/my_app --arg');
  });

  it('uses default user vscode', () => {
    const result = wrapWithDockerExec('cmd', 'abc', '/ws');
    expect(result).toContain('-u vscode');
  });

  it('uses provided user override', () => {
    const result = wrapWithDockerExec('cmd', 'abc', '/ws', 'root');
    expect(result).toContain('-u root');
  });

  it('escapes single quotes in the command', () => {
    const result = wrapWithDockerExec("cmd --arg 'value'", 'abc', '/ws');
    expect(result).toContain("'\\''");
  });

  it('sets working directory via -w flag', () => {
    const result = wrapWithDockerExec('cmd', 'abc', '/workspaces/myproject');
    expect(result).toContain('-w /workspaces/myproject');
  });

  it('runs the command under bash -c', () => {
    const result = wrapWithDockerExec('cmd', 'abc', '/ws');
    expect(result).toContain("bash -c '");
  });
});

// ---------------------------------------------------------------------------
// findRunningContainers
// ---------------------------------------------------------------------------

describe('findRunningContainers', () => {
  afterEach(() => {
    mockExecSync.mockReset();
  });

  it('returns an empty array when docker command throws', () => {
    mockExecSync.mockImplementation(() => { throw new Error('docker not found'); });
    const containers = findRunningContainers();
    expect(containers).toEqual([]);
  });

  it('parses container id and name from docker ps output', () => {
    mockExecSync.mockReturnValue('abc123 vsc-myproject\ndef456 another-container\n');
    const containers = findRunningContainers();
    expect(containers).toEqual([
      { id: 'abc123', name: 'vsc-myproject' },
      { id: 'def456', name: 'another-container' },
    ]);
  });

  it('filters containers by name substring', () => {
    mockExecSync.mockReturnValue('abc123 vsc-myproject\ndef456 other\n');
    const containers = findRunningContainers('vsc-');
    expect(containers).toHaveLength(1);
    expect(containers[0].name).toBe('vsc-myproject');
  });

  it('returns empty array when output is empty', () => {
    mockExecSync.mockReturnValue('');
    expect(findRunningContainers()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DevContainerManager
// ---------------------------------------------------------------------------

describe('DevContainerManager', () => {
  it('isActive returns false when no container has been set', () => {
    const mgr = new DevContainerManager();
    expect(mgr.isActive).toBe(false);
  });

  it('containerId returns undefined when not active', () => {
    const mgr = new DevContainerManager();
    expect(mgr.containerId).toBeUndefined();
  });

  it('containerName returns undefined when not active', () => {
    const mgr = new DevContainerManager();
    expect(mgr.containerName).toBeUndefined();
  });

  it('wrapCommand returns original command when not active', () => {
    const mgr = new DevContainerManager();
    const cmd = 'my_app --arg';
    expect(mgr.wrapCommand(cmd, '/ws')).toBe(cmd);
  });

  it('isActive returns true after setContainer', () => {
    const mgr = new DevContainerManager();
    mgr.setContainer({ id: 'abc', name: 'my-container' });
    expect(mgr.isActive).toBe(true);
  });

  it('containerId returns the container id after setContainer', () => {
    const mgr = new DevContainerManager();
    mgr.setContainer({ id: 'xyz789', name: 'test-container' });
    expect(mgr.containerId).toBe('xyz789');
  });

  it('containerName returns the container name after setContainer', () => {
    const mgr = new DevContainerManager();
    mgr.setContainer({ id: 'abc', name: 'vsc-app' });
    expect(mgr.containerName).toBe('vsc-app');
  });

  it('wrapCommand wraps the command once a container is set', () => {
    const mgr = new DevContainerManager();
    mgr.setContainer({ id: 'cont123', name: 'vsc-myproject' });
    const result = mgr.wrapCommand('my_app', '/workspaces/proj');
    expect(result).toContain('docker exec');
    expect(result).toContain('cont123');
    expect(result).toContain('my_app');
  });

  describe('detect()', () => {
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      savedEnv['IN_DEV_CONTAINER'] = process.env['IN_DEV_CONTAINER'];
      savedEnv['REMOTE_CONTAINERS'] = process.env['REMOTE_CONTAINERS'];
      delete process.env['IN_DEV_CONTAINER'];
      delete process.env['REMOTE_CONTAINERS'];
      mockExecSync.mockReset();
    });

    afterEach(() => {
      if (savedEnv['IN_DEV_CONTAINER'] === undefined) { delete process.env['IN_DEV_CONTAINER']; }
      else { process.env['IN_DEV_CONTAINER'] = savedEnv['IN_DEV_CONTAINER']; }
      if (savedEnv['REMOTE_CONTAINERS'] === undefined) { delete process.env['REMOTE_CONTAINERS']; }
      else { process.env['REMOTE_CONTAINERS'] = savedEnv['REMOTE_CONTAINERS']; }
    });

    it('returns false when not inside a devcontainer', async () => {
      const mgr = new DevContainerManager();
      const result = await mgr.detect();
      expect(result).toBe(false);
      expect(mgr.isActive).toBe(false);
    });

    it('returns true and sets container when inside devcontainer and docker ps succeeds', async () => {
      process.env['IN_DEV_CONTAINER'] = 'true';
      mockExecSync.mockReturnValue('abc123 vsc-myproject\n');
      const mgr = new DevContainerManager();
      const result = await mgr.detect();
      expect(result).toBe(true);
      expect(mgr.isActive).toBe(true);
      expect(mgr.containerId).toBe('abc123');
    });

    it('returns false when inside devcontainer but docker ps returns nothing', async () => {
      process.env['IN_DEV_CONTAINER'] = 'true';
      mockExecSync.mockReturnValue('');
      const mgr = new DevContainerManager();
      const result = await mgr.detect();
      expect(result).toBe(false);
      expect(mgr.isActive).toBe(false);
    });

    it('filters containers by nameFilter in detect', async () => {
      process.env['IN_DEV_CONTAINER'] = 'true';
      mockExecSync.mockReturnValue('abc123 vsc-proj\ndef456 other\n');
      const mgr = new DevContainerManager();
      await mgr.detect('vsc-');
      expect(mgr.containerId).toBe('abc123');
    });
  });
});
