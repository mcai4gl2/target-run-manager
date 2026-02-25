import * as vscode from 'vscode';
import { TaskRunner } from '../../runner/taskRunner';

const mockCreateTerminal = vscode.window.createTerminal as jest.Mock;

function makeFakeTerminal() {
  return {
    sendText: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  };
}

beforeEach(() => {
  mockCreateTerminal.mockReset();
  // Reset terminals list and lastTerminal state between tests
  (vscode.window as unknown as Record<string, unknown>).terminals = [];
});

// ---------------------------------------------------------------------------
// dedicated mode (default)
// ---------------------------------------------------------------------------

describe('TaskRunner — dedicated mode', () => {
  it('creates a new terminal each time', () => {
    const t1 = makeFakeTerminal();
    const t2 = makeFakeTerminal();
    mockCreateTerminal.mockReturnValueOnce(t1).mockReturnValueOnce(t2);

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'echo a', title: 'A', mode: 'dedicated' });
    runner.runInTerminal({ command: 'echo b', title: 'B', mode: 'dedicated' });

    expect(mockCreateTerminal).toHaveBeenCalledTimes(2);
  });

  it('calls sendText with the given command', () => {
    const term = makeFakeTerminal();
    mockCreateTerminal.mockReturnValue(term);

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'my-command --flag', title: 'Test' });

    expect(term.sendText).toHaveBeenCalledWith('my-command --flag');
  });

  it('calls show() on the terminal', () => {
    const term = makeFakeTerminal();
    mockCreateTerminal.mockReturnValue(term);

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'echo', title: 'T' });

    expect(term.show).toHaveBeenCalled();
  });

  it('returns the terminal', () => {
    const term = makeFakeTerminal();
    mockCreateTerminal.mockReturnValue(term);

    const runner = new TaskRunner();
    const result = runner.runInTerminal({ command: 'echo', title: 'T' });

    expect(result).toBe(term);
  });

  it('passes cwd to createTerminal', () => {
    const term = makeFakeTerminal();
    mockCreateTerminal.mockReturnValue(term);

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'echo', title: 'T', cwd: '/my/dir' });

    expect(mockCreateTerminal).toHaveBeenCalledWith({ name: 'T', cwd: '/my/dir' });
  });
});

// ---------------------------------------------------------------------------
// shared mode
// ---------------------------------------------------------------------------

describe('TaskRunner — shared mode', () => {
  it('creates the terminal on first call', () => {
    const term = makeFakeTerminal();
    mockCreateTerminal.mockReturnValue(term);

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'echo', title: 'Shared', mode: 'shared' });

    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);
  });

  it('reuses the same terminal on subsequent calls', () => {
    const term = makeFakeTerminal();
    mockCreateTerminal.mockReturnValue(term);
    // Make isTerminalClosed return false (terminal is still open)
    (vscode.window as unknown as Record<string, unknown>).terminals = [term];

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'cmd1', title: 'S', mode: 'shared' });
    runner.runInTerminal({ command: 'cmd2', title: 'S', mode: 'shared' });

    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);
    expect(term.sendText).toHaveBeenCalledTimes(2);
  });

  it('creates a new terminal if the shared one was closed', () => {
    const term1 = makeFakeTerminal();
    const term2 = makeFakeTerminal();
    mockCreateTerminal.mockReturnValueOnce(term1).mockReturnValueOnce(term2);
    // terminals is empty — indexOf returns -1, so isTerminalClosed = true
    (vscode.window as unknown as Record<string, unknown>).terminals = [];

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'cmd1', title: 'S', mode: 'shared' });
    runner.runInTerminal({ command: 'cmd2', title: 'S', mode: 'shared' });

    expect(mockCreateTerminal).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// reuse mode
// ---------------------------------------------------------------------------

describe('TaskRunner — reuse mode', () => {
  it('creates a new terminal on first call', () => {
    const term = makeFakeTerminal();
    mockCreateTerminal.mockReturnValue(term);

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'echo', title: 'R', mode: 'reuse' });

    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);
  });

  it('reuses the last terminal when it is still open', () => {
    const term = makeFakeTerminal();
    mockCreateTerminal.mockReturnValue(term);
    (vscode.window as unknown as Record<string, unknown>).terminals = [term];

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'cmd1', title: 'R', mode: 'reuse' });
    runner.runInTerminal({ command: 'cmd2', title: 'R', mode: 'reuse' });

    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);
    expect(term.sendText).toHaveBeenNthCalledWith(1, 'cmd1');
    expect(term.sendText).toHaveBeenNthCalledWith(2, 'cmd2');
  });

  it('creates a new terminal if the last one was closed', () => {
    const term1 = makeFakeTerminal();
    const term2 = makeFakeTerminal();
    mockCreateTerminal.mockReturnValueOnce(term1).mockReturnValueOnce(term2);
    (vscode.window as unknown as Record<string, unknown>).terminals = [];

    const runner = new TaskRunner();
    runner.runInTerminal({ command: 'cmd1', title: 'R', mode: 'reuse' });
    runner.runInTerminal({ command: 'cmd2', title: 'R', mode: 'reuse' });

    expect(mockCreateTerminal).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('TaskRunner — dispose', () => {
  it('can be disposed without error', () => {
    const runner = new TaskRunner();
    expect(() => runner.dispose()).not.toThrow();
  });
});
