import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createServerTerminationController } from './serverLifecycle.mjs';

class FakeProcess extends EventEmitter {
  connected = true;
  exitCode = undefined;
  send() {}
}

function immediateServer() {
  const server = new EventEmitter();
  server.close = vi.fn((callback) => callback());
  server.closeIdleConnections = vi.fn();
  server.closeAllConnections = vi.fn();
  return server;
}

describe('server termination controller', () => {
  it('keeps a fatal exit code, disconnects IPC, removes listeners, and cleans up once', async () => {
    const processTarget = new FakeProcess();
    processTarget.disconnect = vi.fn(() => {
      processTarget.connected = false;
    });
    const server = immediateServer();
    const scheduler = { stop: vi.fn() };
    const database = { close: vi.fn() };
    const logger = { error: vi.fn() };
    const controller = createServerTerminationController({
      processTarget,
      server,
      scheduler,
      database,
      graceMs: 10,
      logger,
    });
    controller.attach();

    processTarget.emit('message', { type: 'shutdown' });
    processTarget.emit('SIGTERM');
    server.emit('error', new Error('runtime failure'));
    await controller.wait();
    await controller.terminate(0);

    expect(processTarget.exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith('Server error: runtime failure');
    expect(processTarget.disconnect).toHaveBeenCalledOnce();
    expect(processTarget.listenerCount('message')).toBe(0);
    expect(processTarget.listenerCount('SIGTERM')).toBe(0);
    expect(processTarget.listenerCount('SIGINT')).toBe(0);
    expect(server.listenerCount('error')).toBe(0);
    expect(scheduler.stop).toHaveBeenCalledOnce();
    expect(server.close).toHaveBeenCalledOnce();
    expect(database.close).toHaveBeenCalledOnce();
  });

  it('forces hanging connections after grace and closes the database when cleanup steps throw', async () => {
    const processTarget = new FakeProcess();
    processTarget.disconnect = vi.fn(() => {
      processTarget.connected = false;
    });
    const server = immediateServer();
    server.close.mockImplementation(() => {});
    server.closeIdleConnections.mockImplementation(() => {
      throw new Error('idle close failed');
    });
    const scheduler = {
      stop: vi.fn(() => {
        throw new Error('scheduler stop failed');
      }),
    };
    const database = { close: vi.fn() };
    const controller = createServerTerminationController({
      processTarget,
      server,
      scheduler,
      database,
      graceMs: 10,
      logger: { error: vi.fn() },
    });

    await controller.terminate(0);

    expect(processTarget.exitCode).toBe(0);
    expect(server.closeAllConnections).toHaveBeenCalledOnce();
    expect(database.close).toHaveBeenCalledOnce();
  });
});
