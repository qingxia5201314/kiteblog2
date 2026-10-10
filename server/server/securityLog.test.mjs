import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeSecurityEvent } from './securityLog.mjs';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('writeSecurityEvent', () => {
  it('writes one JSON string containing only normalized allowlisted fields', () => {
    const sink = vi.fn();

    writeSecurityEvent(
      {
        timestamp: 123,
        type: 'login',
        result: false,
        userId: 42,
        username: '  AdMiN  ',
        ip: '203.0.113.8',
        password: 'do-not-log-password',
        token: 'do-not-log-token',
        cookie: 'do-not-log-cookie',
        hash: 'do-not-log-hash',
        body: { secret: 'do-not-log-body' },
        unknown: 'do-not-log-unknown'
      },
      sink
    );

    expect(sink).toHaveBeenCalledOnce();
    expect(sink.mock.calls[0]).toHaveLength(1);
    expect(typeof sink.mock.calls[0][0]).toBe('string');
    expect(JSON.parse(sink.mock.calls[0][0])).toEqual({
      timestamp: '123',
      type: 'login',
      result: 'false',
      userId: '42',
      username: 'admin',
      ip: '203.0.113.8'
    });
  });

  it('does not access sensitive or unknown event properties', () => {
    const sink = vi.fn();
    const event = {
      timestamp: '2026-07-15T00:00:00.000Z',
      type: 'login',
      result: 'failure',
      userId: '',
      username: 'Reader',
      ip: '192.0.2.4'
    };
    for (const field of ['password', 'token', 'cookie', 'hash', 'body', 'requestBody', 'unknown']) {
      Object.defineProperty(event, field, {
        get() {
          throw new Error(`read sensitive field ${field}`);
        }
      });
    }

    expect(() => writeSecurityEvent(event, sink)).not.toThrow();
    expect(JSON.parse(sink.mock.calls[0][0])).toEqual({
      timestamp: '2026-07-15T00:00:00.000Z',
      type: 'login',
      result: 'failure',
      userId: '',
      username: 'reader',
      ip: '192.0.2.4'
    });
  });

  it('uses the current ISO timestamp and console.info by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T08:09:10.123Z'));
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    writeSecurityEvent({
      type: 'session',
      result: 'success',
      userId: 'user-1',
      username: ' USER ',
      ip: '127.0.0.1'
    });

    expect(consoleInfo).toHaveBeenCalledOnce();
    expect(consoleInfo.mock.calls[0]).toHaveLength(1);
    expect(JSON.parse(consoleInfo.mock.calls[0][0])).toEqual({
      timestamp: '2026-07-15T08:09:10.123Z',
      type: 'session',
      result: 'success',
      userId: 'user-1',
      username: 'user',
      ip: '127.0.0.1'
    });
  });

  it('uses safe defaults for missing allowlisted fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T10:11:12.345Z'));
    const sink = vi.fn();

    writeSecurityEvent({}, sink);

    expect(JSON.parse(sink.mock.calls[0][0])).toEqual({
      timestamp: '2026-07-15T10:11:12.345Z',
      type: 'unknown',
      result: '',
      userId: '',
      username: '',
      ip: ''
    });
  });
});
